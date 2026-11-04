// Calcul d'itinéraire avec le Connection Scan Algorithm (CSA).
// Une "connexion" est un trajet élémentaire d'un bus entre deux arrêts consécutifs ;
// on les parcourt par heure de départ croissante pour trouver l'arrivée au plus tôt.
import { distance, walkSeconds } from './geo.js';
import { addDays, serviceDayStart } from './time.js';
import { onGtfsReload } from './gtfs.js';
import { delayAt } from './realtime.js';

const TRANSFER_RADIUS = 400; // m, marche maximale entre deux arrêts lors d'une correspondance
const ACCESS_RADII = [800, 1500]; // m, marche maximale vers/depuis le premier/dernier arrêt
const MIN_TRANSFER = 60; // s, temps minimum pour changer de bus
const MAX_DIRECT_WALK = 2000; // m, au-delà on ne propose pas l'itinéraire 100 % à pied
const HORIZON = 4 * 3600; // s, durée maximale de recherche

let connectionsCache = new Map();
let footpathsCache = null;
onGtfsReload(() => {
  connectionsCache = new Map();
  footpathsCache = null;
});

function buildConnections(gtfs, date) {
  if (connectionsCache.has(date)) return connectionsCache.get(date);
  const refs = [];
  const tmp = [];
  // Courses du jour, et courses de la veille qui se prolongent après minuit.
  for (const [d, offset] of [[date, 0], [addDays(date, -1), -86400]]) {
    const services = gtfs.servicesOn(d);
    gtfs.trips.forEach((t, ti) => {
      if (!t.stops || !services.has(t.serviceId)) return;
      if (offset && t.arr[t.arr.length - 1] < 86400) return;
      const ref = refs.length;
      refs.push({ trip: ti, date: d, offset });
      for (let k = 0; k < t.stops.length - 1; k++) {
        const dep = t.dep[k] + offset;
        if (dep < 0) continue;
        tmp.push([dep, t.arr[k + 1] + offset, t.stops[k], t.stops[k + 1], ref, k]);
      }
    });
  }
  tmp.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const n = tmp.length;
  const c = {
    n, refs,
    dep: new Int32Array(n), arr: new Int32Array(n),
    from: new Int32Array(n), to: new Int32Array(n),
    ref: new Int32Array(n), pos: new Int32Array(n),
  };
  tmp.forEach((x, i) => {
    c.dep[i] = x[0]; c.arr[i] = x[1]; c.from[i] = x[2]; c.to[i] = x[3]; c.ref[i] = x[4]; c.pos[i] = x[5];
  });
  // On garde quelques jours en cache au maximum.
  if (connectionsCache.size > 3) connectionsCache.delete(connectionsCache.keys().next().value);
  connectionsCache.set(date, c);
  return c;
}

function buildFootpaths(gtfs) {
  if (footpathsCache) return footpathsCache;
  const { stops } = gtfs;
  footpathsCache = stops.map((a, i) => {
    const list = [];
    for (let j = 0; j < stops.length; j++) {
      if (i === j) continue;
      const b = stops[j];
      if (Math.abs(a.lat - b.lat) > 0.005 || Math.abs(a.lon - b.lon) > 0.008) continue;
      const d = distance(a.lat, a.lon, b.lat, b.lon);
      if (d <= TRANSFER_RADIUS) list.push([j, walkSeconds(d), Math.round(d)]);
    }
    return list;
  });
  return footpathsCache;
}

function nearbyStops(gtfs, lat, lon) {
  for (const radius of ACCESS_RADII) {
    const found = [];
    gtfs.stops.forEach((s, i) => {
      const d = distance(lat, lon, s.lat, s.lon);
      if (d <= radius) found.push({ stop: i, dist: Math.round(d), walk: walkSeconds(d) });
    });
    if (found.length) return found;
  }
  return [];
}

function lowerBound(arr, value) {
  let lo = 0, hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid] < value) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

const NONE = 0, ORIGIN = 1, RIDE = 2, TRANSFER = 3;

// Recherche de l'itinéraire arrivant le plus tôt, en partant à t0 (secondes de la journée).
function scan(gtfs, conns, foot, origins, targets, t0) {
  const n = gtfs.stops.length;
  const earliest = new Float64Array(n).fill(Infinity);
  const byTransit = new Uint8Array(n);
  const jType = new Uint8Array(n);
  const jA = new Int32Array(n); // RIDE : connexion de montée ; TRANSFER : arrêt de départ
  const jB = new Int32Array(n); // RIDE : connexion de descente ; TRANSFER : durée de marche
  const tripEnter = new Int32Array(conns.refs.length).fill(-1);

  for (const o of origins) {
    const t = t0 + o.walk;
    if (t < earliest[o.stop]) {
      earliest[o.stop] = t;
      jType[o.stop] = ORIGIN;
      jB[o.stop] = o.walk;
    }
  }

  let best = Infinity;
  let bestStop = -1;
  const reach = (s) => {
    const w = targets.get(s);
    if (w !== undefined && earliest[s] + w < best) {
      best = earliest[s] + w;
      bestStop = s;
    }
  };

  const limit = t0 + HORIZON;
  for (let c = lowerBound(conns.dep, t0); c < conns.n; c++) {
    const dep = conns.dep[c];
    if (dep > best || dep > limit) break;
    const r = conns.ref[c];
    if (tripEnter[r] === -1) {
      const from = conns.from[c];
      if (earliest[from] + (byTransit[from] ? MIN_TRANSFER : 0) <= dep) tripEnter[r] = c;
      else continue;
    }
    const to = conns.to[c];
    const arr = conns.arr[c];
    if (arr >= earliest[to]) continue;
    earliest[to] = arr;
    byTransit[to] = 1;
    jType[to] = RIDE;
    jA[to] = tripEnter[r];
    jB[to] = c;
    reach(to);
    for (const [nb, walk] of foot[to]) {
      const t = arr + walk + MIN_TRANSFER;
      if (t < earliest[nb]) {
        earliest[nb] = t;
        byTransit[nb] = 0;
        jType[nb] = TRANSFER;
        jA[nb] = to;
        jB[nb] = walk;
        reach(nb);
      }
    }
  }
  if (bestStop < 0) return null;

  // Reconstruction du trajet en remontant depuis l'arrêt final.
  const steps = [];
  let cur = bestStop;
  for (let guard = 0; guard < 50; guard++) {
    if (jType[cur] === RIDE) {
      steps.unshift({ type: 'ride', enter: jA[cur], exit: jB[cur] });
      cur = conns.from[jA[cur]];
    } else if (jType[cur] === TRANSFER) {
      steps.unshift({ type: 'transfer', from: jA[cur], to: cur, walk: jB[cur] });
      cur = jA[cur];
    } else if (jType[cur] === ORIGIN) {
      steps.unshift({ type: 'origin', to: cur, walk: jB[cur] });
      return { steps, lastStop: bestStop, arrival: best };
    } else break;
  }
  return null;
}

function stopPoint(gtfs, si) {
  const s = gtfs.stops[si];
  return { name: s.name, lat: s.lat, lon: s.lon, stopId: s.id, stationId: s.station };
}

// Extrait la portion du tracé de la ligne entre deux arrêts.
function shapeSlice(shape, a, b) {
  const nearest = (p, from) => {
    let bestI = from, bestD = Infinity;
    for (let i = from; i < shape.length; i++) {
      const d = (shape[i][0] - p.lat) ** 2 + (shape[i][1] - p.lon) ** 2;
      if (d < bestD) { bestD = d; bestI = i; }
    }
    return bestI;
  };
  const i = nearest(a, 0);
  const j = nearest(b, i);
  return j > i ? shape.slice(i, j + 1) : null;
}

function buildItinerary(gtfs, conns, result, origin, dest, date, tripUpdates) {
  const dayStart = serviceDayStart(date);
  const toMs = (sec) => (dayStart + sec) * 1000;
  const legs = [];
  let clock = null;

  for (const step of result.steps) {
    if (step.type === 'origin') {
      continue; // traité après coup, une fois l'heure de montée connue
    }
    if (step.type === 'ride') {
      const ref = conns.refs[conns.ref[step.enter]];
      const trip = gtfs.trips[ref.trip];
      const route = gtfs.routes.get(trip.routeId);
      const k0 = conns.pos[step.enter];
      const k1 = conns.pos[step.exit] + 1;
      const from = stopPoint(gtfs, trip.stops[k0]);
      const to = stopPoint(gtfs, trip.stops[k1]);
      const stops = [];
      for (let k = k0; k <= k1; k++) {
        stops.push({ ...stopPoint(gtfs, trip.stops[k]), time: toMs(trip.dep[k] + ref.offset) });
      }
      const shape = trip.shapeId && gtfs.shapes.get(trip.shapeId);
      const rt = delayAt(gtfs, trip, k0, ref.date, tripUpdates.get(trip.id));
      legs.push({
        mode: 'bus',
        route: { id: route.id, shortName: route.shortName, longName: route.longName, color: route.color, textColor: route.textColor },
        headsign: trip.headsign,
        tripId: trip.id,
        from, to,
        start: toMs(trip.dep[k0] + ref.offset),
        end: toMs(trip.arr[k1] + ref.offset),
        delay: rt?.delay ?? null,
        stops,
        geometry: (shape && shapeSlice(shape, from, to)) || stops.map((s) => [s.lat, s.lon]),
      });
      clock = trip.arr[k1] + ref.offset;
    } else if (step.type === 'transfer') {
      const a = gtfs.stops[step.from], b = gtfs.stops[step.to];
      const dist = Math.round(distance(a.lat, a.lon, b.lat, b.lon));
      legs.push({
        mode: 'walk',
        from: stopPoint(gtfs, step.from), to: stopPoint(gtfs, step.to),
        start: toMs(clock), end: toMs(clock + step.walk),
        duration: step.walk, distance: dist,
        geometry: [[a.lat, a.lon], [b.lat, b.lon]],
      });
      clock += step.walk;
    }
  }

  // Marche initiale : on part juste à temps pour le premier bus.
  const first = result.steps[0];
  const firstStop = gtfs.stops[first.to];
  const firstBus = legs.find((l) => l.mode === 'bus');
  if (!firstBus) return null;
  const accessDist = Math.round(distance(origin.lat, origin.lon, firstStop.lat, firstStop.lon));
  if (accessDist > 20) {
    legs.unshift({
      mode: 'walk',
      from: { name: origin.name || 'Départ', lat: origin.lat, lon: origin.lon },
      to: stopPoint(gtfs, first.to),
      start: firstBus.start - first.walk * 1000, end: firstBus.start,
      duration: first.walk, distance: accessDist,
      geometry: [[origin.lat, origin.lon], [firstStop.lat, firstStop.lon]],
    });
  }

  const lastStop = gtfs.stops[result.lastStop];
  const egressDist = Math.round(distance(lastStop.lat, lastStop.lon, dest.lat, dest.lon));
  const lastLeg = legs[legs.length - 1];
  if (egressDist > 20) {
    const w = walkSeconds(egressDist);
    legs.push({
      mode: 'walk',
      from: stopPoint(gtfs, result.lastStop),
      to: { name: dest.name || 'Arrivée', lat: dest.lat, lon: dest.lon },
      start: lastLeg.end, end: lastLeg.end + w * 1000,
      duration: w, distance: egressDist,
      geometry: [[lastStop.lat, lastStop.lon], [dest.lat, dest.lon]],
    });
  }

  // Nettoyage : on supprime les changements de quai sans marche réelle
  // et on fusionne les marches consécutives.
  const cleaned = [];
  for (const leg of legs) {
    const prev = cleaned[cleaned.length - 1];
    if (leg.mode === 'walk' && leg.distance < 30 && prev && legs[legs.length - 1] !== leg) continue;
    if (leg.mode === 'walk' && prev?.mode === 'walk') {
      prev.to = leg.to;
      prev.end = leg.end;
      prev.duration += leg.duration;
      prev.distance += leg.distance;
      prev.geometry = [...prev.geometry, ...leg.geometry.slice(1)];
      continue;
    }
    cleaned.push(leg);
  }
  legs.splice(0, legs.length, ...cleaned);

  const start = legs[0].start;
  const end = legs[legs.length - 1].end;
  return {
    start, end,
    duration: Math.round((end - start) / 1000),
    transfers: legs.filter((l) => l.mode === 'bus').length - 1,
    walkDistance: legs.filter((l) => l.mode === 'walk').reduce((s, l) => s + l.distance, 0),
    legs,
    firstBusDep: conns.dep[result.steps.find((s) => s.type === 'ride').enter],
  };
}

export function plan(gtfs, { from, to, date, time, count = 3 }, tripUpdates = new Map()) {
  const conns = buildConnections(gtfs, date);
  const foot = buildFootpaths(gtfs);
  const origins = nearbyStops(gtfs, from.lat, from.lon);
  const targets = new Map(nearbyStops(gtfs, to.lat, to.lon).map((t) => [t.stop, t.walk]));
  const itineraries = [];
  const seen = new Set();

  let t = time;
  for (let i = 0; i < count + 2 && itineraries.length < count; i++) {
    const result = scan(gtfs, conns, foot, origins, targets, t);
    if (!result) break;
    const it = buildItinerary(gtfs, conns, result, from, to, date, tripUpdates);
    if (!it) break;
    const sig = it.legs.map((l) => (l.mode === 'bus' ? l.tripId : 'w')).join('>');
    if (!seen.has(sig)) {
      seen.add(sig);
      itineraries.push(it);
    }
    t = it.firstBusDep + 1;
  }

  const direct = Math.round(distance(from.lat, from.lon, to.lat, to.lon));
  if (direct <= MAX_DIRECT_WALK) {
    const w = walkSeconds(direct);
    const start = (serviceDayStart(date) + time) * 1000;
    itineraries.push({
      start, end: start + w * 1000, duration: w, transfers: 0, walkDistance: direct,
      walkOnly: true,
      legs: [{
        mode: 'walk',
        from: { name: from.name || 'Départ', lat: from.lat, lon: from.lon },
        to: { name: to.name || 'Arrivée', lat: to.lat, lon: to.lon },
        start, end: start + w * 1000, duration: w, distance: direct,
        geometry: [[from.lat, from.lon], [to.lat, to.lon]],
      }],
    });
  }

  for (const it of itineraries) delete it.firstBusDep;
  return itineraries.sort((a, b) => a.end - b.end);
}

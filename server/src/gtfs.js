// Chargement et indexation des données théoriques GTFS du réseau LE MET'.
import fs from 'node:fs';
import path from 'node:path';
import AdmZip from 'adm-zip';
import { parse } from 'csv-parse/sync';
import { parseGtfsTime, weekdayName, addDays } from './time.js';
import { distance } from './geo.js';

export const GTFS_URL = process.env.GTFS_URL || 'https://data.lemet.fr/documents/LEMET-gtfs.zip';
const DATA_DIR = path.resolve(import.meta.dirname, '../data');
const ZIP_PATH = path.join(DATA_DIR, 'gtfs.zip');
const MAX_AGE_MS = 24 * 3600 * 1000;

const CATEGORIES = {
  M: { id: 'mettis', name: 'Mettis', order: 0 },
  L: { id: 'lianes', name: 'Lianes', order: 1 },
  C: { id: 'citeis', name: 'Citéis', order: 2 },
  P: { id: 'proxis', name: 'Proxis', order: 3 },
  N: { id: 'navettes', name: 'Navettes', order: 4 },
  F: { id: 'flexo', name: 'Flexo (transport à la demande)', order: 5 },
  S: { id: 'scolaires', name: 'Scolaires', order: 7 },
};
const OTHER_CATEGORY = { id: 'autres', name: 'Autres', order: 6 };
const MERGE_RADIUS = 150; // m

// Quelques noms du fichier source sont mal encodés (UTF-8 décodé deux fois,
// ou caractère perdu dans des noms en majuscules comme « MÉCLEUVES »).
function fixEncoding(str) {
  return str.replace(/Ãš/g, 'è').replace(/ï¿œ/g, 'É');
}

async function downloadIfNeeded() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const fresh = fs.existsSync(ZIP_PATH) && Date.now() - fs.statSync(ZIP_PATH).mtimeMs < MAX_AGE_MS;
  if (fresh) return;
  try {
    console.log(`[gtfs] Téléchargement de ${GTFS_URL}`);
    const res = await fetch(GTFS_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(ZIP_PATH + '.tmp', buf);
    fs.renameSync(ZIP_PATH + '.tmp', ZIP_PATH);
  } catch (err) {
    if (!fs.existsSync(ZIP_PATH)) throw err;
    console.warn(`[gtfs] Échec du téléchargement (${err.message}), utilisation du cache`);
  }
}

function readTable(zip, name) {
  const entry = zip.getEntry(name);
  if (!entry) return [];
  return parse(entry.getData(), { columns: true, skip_empty_lines: true, bom: true, trim: true });
}

function buildIndex(zip) {
  const agency = readTable(zip, 'agency.txt')[0] || {};

  // --- Arrêts ---------------------------------------------------------
  const stops = [];
  const stopIndex = new Map();
  const stationRows = new Map();
  for (const r of readTable(zip, 'stops.txt')) {
    const s = {
      id: r.stop_id,
      name: fixEncoding(r.stop_name),
      lat: +r.stop_lat,
      lon: +r.stop_lon,
      parent: r.parent_station || null,
      wheelchair: r.wheelchair_boarding === '1',
    };
    if (r.location_type === '1') stationRows.set(s.id, s);
    else if (!r.location_type || r.location_type === '0') {
      stopIndex.set(s.id, stops.length);
      stops.push(s);
    }
  }

  // Une "station" regroupe les quais d'un même arrêt (ex. les deux sens).
  // Le fichier contient parfois plusieurs stations parentes portant le même nom
  // à quelques mètres l'une de l'autre : on les fusionne pour l'affichage.
  const stations = new Map();
  const byName = new Map();
  const merged = new Map();
  for (const st of stationRows.values()) {
    const twin = (byName.get(st.name) || []).find((o) => distance(o.lat, o.lon, st.lat, st.lon) < MERGE_RADIUS);
    if (twin) merged.set(st.id, twin.id);
    else byName.set(st.name, [...(byName.get(st.name) || []), st]);
  }
  stops.forEach((s, idx) => {
    let sid = s.parent && stationRows.has(s.parent) ? s.parent : s.id;
    sid = merged.get(sid) || sid;
    s.station = sid;
    if (!stations.has(sid)) {
      const base = stationRows.get(sid) || s;
      stations.set(sid, { id: sid, name: base.name, lat: base.lat, lon: base.lon, stops: [], routes: new Set() });
    }
    stations.get(sid).stops.push(idx);
  });
  for (const [from, to] of merged) stations.set(from, stations.get(to));

  // --- Lignes ---------------------------------------------------------
  const routes = new Map();
  for (const r of readTable(zip, 'routes.txt')) {
    const cat = CATEGORIES[r.route_short_name?.[0]] || OTHER_CATEGORY;
    routes.set(r.route_id, {
      id: r.route_id,
      shortName: r.route_short_name,
      longName: fixEncoding(r.route_long_name),
      type: +r.route_type,
      color: '#' + (r.route_color || '666666'),
      textColor: '#' + (r.route_text_color || 'FFFFFF'),
      sortOrder: +r.route_sort_order || 0,
      category: cat,
    });
  }

  // --- Calendrier -----------------------------------------------------
  const calendar = readTable(zip, 'calendar.txt');
  const calendarDates = readTable(zip, 'calendar_dates.txt');
  function servicesOn(date) {
    const set = new Set();
    const wd = weekdayName(date);
    for (const c of calendar) {
      if (c[wd] === '1' && c.start_date <= date && date <= c.end_date) set.add(c.service_id);
    }
    for (const cd of calendarDates) {
      if (cd.date !== date) continue;
      if (cd.exception_type === '1') set.add(cd.service_id);
      else set.delete(cd.service_id);
    }
    return set;
  }
  const allDates = [...new Set(calendarDates.map((c) => c.date))].sort();
  for (const c of calendar) allDates.push(c.start_date, c.end_date);
  allDates.sort();
  const validity = { from: allDates[0], to: allDates[allDates.length - 1] };

  // --- Courses --------------------------------------------------------
  const trips = [];
  const tripIndex = new Map();
  for (const r of readTable(zip, 'trips.txt')) {
    if (!routes.has(r.route_id)) continue;
    tripIndex.set(r.trip_id, trips.length);
    trips.push({
      id: r.trip_id,
      routeId: r.route_id,
      serviceId: r.service_id,
      headsign: r.trip_headsign,
      direction: +r.direction_id || 0,
      shapeId: r.shape_id,
      wheelchair: r.wheelchair_accessible === '1',
      stops: null, arr: null, dep: null,
    });
  }

  // --- Horaires (stockés en tableaux typés pour limiter la mémoire) ----
  const raw = new Map();
  for (const r of readTable(zip, 'stop_times.txt')) {
    const ti = tripIndex.get(r.trip_id);
    const si = stopIndex.get(r.stop_id);
    if (ti === undefined || si === undefined) continue;
    let list = raw.get(ti);
    if (!list) raw.set(ti, (list = []));
    const arr = parseGtfsTime(r.arrival_time);
    const dep = parseGtfsTime(r.departure_time);
    list.push([+r.stop_sequence, si, arr < 0 ? dep : arr, dep < 0 ? arr : dep]);
  }
  for (const [ti, list] of raw) {
    list.sort((a, b) => a[0] - b[0]);
    const t = trips[ti];
    t.seqs = Int32Array.from(list, (x) => x[0]);
    t.stops = Int32Array.from(list, (x) => x[1]);
    t.arr = Int32Array.from(list, (x) => x[2]);
    t.dep = Int32Array.from(list, (x) => x[3]);
  }
  raw.clear();

  // Index arrêt -> passages (course, position dans la course).
  const stopTrips = stops.map(() => []);
  trips.forEach((t, ti) => {
    if (!t.stops) return;
    for (let k = 0; k < t.stops.length; k++) {
      stopTrips[t.stops[k]].push(ti, k);
      stations.get(stops[t.stops[k]].station).routes.add(t.routeId);
    }
  });

  // --- Tracés ---------------------------------------------------------
  const shapePts = new Map();
  for (const r of readTable(zip, 'shapes.txt')) {
    let list = shapePts.get(r.shape_id);
    if (!list) shapePts.set(r.shape_id, (list = []));
    list.push([+r.shape_pt_sequence, Math.round(+r.shape_pt_lat * 1e5) / 1e5, Math.round(+r.shape_pt_lon * 1e5) / 1e5]);
  }
  const shapes = new Map();
  for (const [id, list] of shapePts) {
    list.sort((a, b) => a[0] - b[0]);
    shapes.set(id, list.map((p) => [p[1], p[2]]));
  }

  // --- Synthèse par ligne : tracés et séquence d'arrêts par sens -------
  for (const route of routes.values()) {
    const patterns = new Map();
    const shapeIds = new Set();
    for (const t of trips) {
      if (t.routeId !== route.id || !t.stops) continue;
      if (t.shapeId && shapes.has(t.shapeId)) shapeIds.add(t.shapeId);
      const key = t.direction + '|' + t.stops.join(',');
      const p = patterns.get(key);
      if (p) p.count++;
      else patterns.set(key, { direction: t.direction, trip: t, count: 1 });
    }
    // Pour chaque sens, on garde le parcours le plus fréquent (puis le plus long).
    const best = new Map();
    for (const p of patterns.values()) {
      const cur = best.get(p.direction);
      if (!cur || p.count > cur.count || (p.count === cur.count && p.trip.stops.length > cur.trip.stops.length)) {
        best.set(p.direction, p);
      }
    }
    route.directions = [...best.values()]
      .sort((a, b) => a.direction - b.direction)
      .map((p) => ({
        direction: p.direction,
        headsign: p.trip.headsign,
        stops: Array.from(p.trip.stops, (si) => stops[si].station).filter((s, i, a) => s !== a[i - 1]),
      }));
    route.shapeIds = [...shapeIds];
  }

  return {
    agency: { name: agency.agency_name, url: agency.agency_url, phone: agency.agency_phone, fareUrl: agency.agency_fare_url },
    loadedAt: new Date().toISOString(),
    validity,
    stops, stopIndex, stations, routes, trips, tripIndex, stopTrips, shapes,
    servicesOn: memoize(servicesOn),
  };
}

function memoize(fn) {
  const cache = new Map();
  return (key) => {
    if (!cache.has(key)) cache.set(key, fn(key));
    return cache.get(key);
  };
}

let current = null;
const listeners = [];

export function getGtfs() {
  if (!current) throw new Error('Données GTFS pas encore chargées');
  return current;
}

export function onGtfsReload(fn) {
  listeners.push(fn);
}

export async function loadGtfs() {
  await downloadIfNeeded();
  const t0 = Date.now();
  const zip = new AdmZip(ZIP_PATH);
  current = buildIndex(zip);
  console.log(
    `[gtfs] ${current.routes.size} lignes, ${current.stations.size} arrêts, ${current.trips.length} courses ` +
      `chargés en ${Date.now() - t0} ms (validité ${current.validity.from} → ${current.validity.to})`,
  );
  listeners.forEach((fn) => fn(current));
  return current;
}

// Recharge les données une fois par jour.
export function scheduleDailyReload() {
  setInterval(() => loadGtfs().catch((e) => console.error('[gtfs] rechargement échoué', e)), MAX_AGE_MS).unref();
}

// Passages programmés à une station entre deux instants (en secondes de la journée de service).
// Inclut les courses de la veille qui circulent après minuit (horaires > 24:00:00).
export function scheduledDepartures(gtfs, stationId, date, fromSec, toSec) {
  const station = gtfs.stations.get(stationId);
  if (!station) return null;
  const result = [];
  const days = [
    { date, offset: 0 },
    { date: addDays(date, -1), offset: -86400 },
  ];
  for (const { date: d, offset } of days) {
    const services = gtfs.servicesOn(d);
    for (const si of station.stops) {
      const list = gtfs.stopTrips[si];
      for (let i = 0; i < list.length; i += 2) {
        const t = gtfs.trips[list[i]];
        const k = list[i + 1];
        if (!services.has(t.serviceId)) continue;
        if (k === t.stops.length - 1) continue; // terminus : pas de départ
        const dep = t.dep[k] + offset;
        if (dep < fromSec || dep > toSec) continue;
        result.push({ trip: t, index: k, serviceDate: d, time: dep });
      }
    }
  }
  return result.sort((a, b) => a.time - b.time);
}

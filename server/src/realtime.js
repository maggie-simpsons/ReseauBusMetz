// Données temps réel GTFS-RT : positions des véhicules, retards et perturbations.
import GtfsRealtimeBindings from 'gtfs-realtime-bindings';
import { getGtfs } from './gtfs.js';
import { serviceDayStart, parisNow } from './time.js';

const { transit_realtime } = GtfsRealtimeBindings;
const BASE = 'https://proxy.transport.data.gouv.fr/resource';
const FEEDS = {
  vehicles: { url: process.env.RT_VEHICLES_URL || `${BASE}/lemet-metz-gtfs-rt-vehicle-position`, ttl: 10_000 },
  tripUpdates: { url: process.env.RT_TRIPS_URL || `${BASE}/lemet-metz-gtfs-rt-trip-update`, ttl: 20_000 },
  alerts: { url: process.env.RT_ALERTS_URL || `${BASE}/lemet-metz-gtfs-rt-service-alert`, ttl: 60_000 },
};

const cache = new Map();

// Récupère un flux en le gardant en cache `ttl` ms ; en cas d'erreur, renvoie la dernière version connue.
async function fetchFeed(name) {
  const { url, ttl } = FEEDS[name];
  const entry = cache.get(name);
  if (entry && Date.now() - entry.at < ttl) return entry.value;
  if (entry?.pending) return entry.pending;

  const pending = (async () => {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const feed = transit_realtime.FeedMessage.decode(new Uint8Array(await res.arrayBuffer()));
      const value = transit_realtime.FeedMessage.toObject(feed, { longs: Number, enums: String });
      cache.set(name, { at: Date.now(), value });
      return value;
    } catch (err) {
      console.warn(`[rt] flux ${name} indisponible : ${err.message}`);
      if (entry) {
        cache.set(name, { ...entry, at: Date.now() - ttl / 2, pending: null });
        return entry.value;
      }
      cache.delete(name);
      return { entity: [] };
    }
  })();
  cache.set(name, { ...(entry || { at: 0, value: null }), pending });
  return pending;
}

function translated(t) {
  if (!t?.translation?.length) return '';
  const fr = t.translation.find((x) => !x.language || x.language.startsWith('fr'));
  return (fr || t.translation[0]).text;
}

// --- Retards ---------------------------------------------------------

let tripUpdatesIndex = { at: 0, map: new Map() };

export async function getTripUpdates() {
  const feed = await fetchFeed('tripUpdates');
  if (tripUpdatesIndex.feed === feed) return tripUpdatesIndex.map;
  const map = new Map();
  for (const e of feed.entity || []) {
    const tu = e.tripUpdate;
    if (!tu?.trip?.tripId) continue;
    map.set(tu.trip.tripId, {
      canceled: tu.trip.scheduleRelationship === 'CANCELED',
      startDate: tu.trip.startDate,
      updates: (tu.stopTimeUpdate || []).map((u) => ({
        seq: u.stopSequence,
        stopId: u.stopId,
        skipped: u.scheduleRelationship === 'SKIPPED',
        arrDelay: u.arrival?.delay,
        arrTime: u.arrival?.time,
        depDelay: u.departure?.delay,
        depTime: u.departure?.time,
      })),
    });
  }
  tripUpdatesIndex = { feed, map };
  return map;
}

// Calcule le retard (s) d'une course à l'arrêt d'indice k, en propageant
// la dernière mise à jour connue en amont (comportement standard GTFS-RT).
export function delayAt(gtfs, trip, k, serviceDate, tu) {
  if (!tu) return null;
  if (tu.canceled) return { canceled: true };
  const dayStart = serviceDayStart(serviceDate);
  let found = null;
  for (const u of tu.updates) {
    let idx = -1;
    if (u.seq != null) idx = trip.seqs.indexOf(u.seq);
    if (idx < 0 && u.stopId) idx = trip.stops.findIndex((si) => gtfs.stops[si].id === u.stopId);
    if (idx < 0 || idx > k) continue;
    if (!found || idx >= found.idx) found = { idx, u };
  }
  if (!found) return null;
  const { idx, u } = found;
  if (idx === k && u.skipped) return { skipped: true };
  let delay = null;
  if (idx === k && (u.depTime || u.depDelay != null)) {
    delay = u.depDelay ?? u.depTime - (dayStart + trip.dep[idx]);
  } else if (u.arrTime || u.arrDelay != null) {
    delay = u.arrDelay ?? u.arrTime - (dayStart + trip.arr[idx]);
  } else if (u.depTime || u.depDelay != null) {
    delay = u.depDelay ?? u.depTime - (dayStart + trip.dep[idx]);
  }
  return delay == null ? null : { delay };
}

// --- Véhicules -------------------------------------------------------

export async function getVehicles() {
  const gtfs = getGtfs();
  const [feed, updates] = await Promise.all([fetchFeed('vehicles'), getTripUpdates()]);
  const now = parisNow();
  const vehicles = [];
  for (const e of feed.entity || []) {
    const v = e.vehicle;
    if (!v?.position) continue;
    const tripId = v.trip?.tripId;
    const ti = gtfs.tripIndex.get(tripId);
    const trip = ti !== undefined ? gtfs.trips[ti] : null;
    const routeId = v.trip?.routeId || trip?.routeId;
    const route = gtfs.routes.get(routeId);

    let delay = null;
    let nextStop = null;
    if (trip?.stops) {
      let k = v.currentStopSequence != null ? trip.seqs.indexOf(v.currentStopSequence) : -1;
      if (k < 0 && v.stopId) k = trip.stops.findIndex((si) => gtfs.stops[si].id === v.stopId);
      if (k >= 0) {
        nextStop = gtfs.stops[trip.stops[k]].name;
        delay = delayAt(gtfs, trip, k, updates.get(tripId)?.startDate || now.date, updates.get(tripId))?.delay ?? null;
      }
    }

    vehicles.push({
      id: v.vehicle?.id || e.id,
      label: v.vehicle?.label || null,
      lat: v.position.latitude,
      lon: v.position.longitude,
      bearing: v.position.bearing ?? null,
      speed: v.position.speed != null ? Math.round(v.position.speed * 3.6) : null,
      routeId: routeId || null,
      routeShortName: route?.shortName || null,
      color: route?.color || '#555555',
      textColor: route?.textColor || '#FFFFFF',
      tripId: tripId || null,
      headsign: trip?.headsign || null,
      nextStop,
      delay,
      timestamp: v.timestamp || null,
    });
  }
  return vehicles;
}

// --- Perturbations ---------------------------------------------------

export async function getAlerts() {
  const gtfs = getGtfs();
  const feed = await fetchFeed('alerts');
  const nowSec = Date.now() / 1000;
  const alerts = [];
  for (const e of feed.entity || []) {
    const a = e.alert;
    if (!a) continue;
    const periods = (a.activePeriod || []).map((p) => ({ start: p.start || null, end: p.end || null }));
    const active = !periods.length || periods.some((p) => (!p.start || p.start <= nowSec) && (!p.end || p.end >= nowSec));
    const routeIds = new Set();
    const stationIds = new Set();
    for (const ie of a.informedEntity || []) {
      if (ie.routeId && gtfs.routes.has(ie.routeId)) routeIds.add(ie.routeId);
      if (ie.trip?.routeId && gtfs.routes.has(ie.trip.routeId)) routeIds.add(ie.trip.routeId);
      if (ie.stopId) {
        const si = gtfs.stopIndex.get(ie.stopId);
        if (si !== undefined) stationIds.add(gtfs.stops[si].station);
        else if (gtfs.stations.has(ie.stopId)) stationIds.add(ie.stopId);
      }
    }
    alerts.push({
      id: e.id,
      active,
      title: translated(a.headerText),
      description: translated(a.descriptionText),
      url: translated(a.url) || null,
      cause: a.cause || null,
      effect: a.effect || null,
      periods,
      routes: [...routeIds],
      stations: [...stationIds],
    });
  }
  return alerts.sort((x, y) => Number(y.active) - Number(x.active));
}

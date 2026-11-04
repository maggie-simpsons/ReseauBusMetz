import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import cors from 'cors';
import compression from 'compression';
import { loadGtfs, getGtfs, scheduleDailyReload, scheduledDepartures } from './gtfs.js';
import { getVehicles, getAlerts, getTripUpdates, delayAt } from './realtime.js';
import { getBikes } from './bikes.js';
import { plan } from './planner.js';
import { parisNow, serviceDayStart } from './time.js';

const PORT = +process.env.PORT || 3001;
const app = express();
app.use(cors());
app.use(compression());

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);

function routeSummary(r) {
  return {
    id: r.id, shortName: r.shortName, longName: r.longName, type: r.type,
    color: r.color, textColor: r.textColor, sortOrder: r.sortOrder, category: r.category,
  };
}

function stationSummary(gtfs, s) {
  return {
    id: s.id, name: s.name, lat: s.lat, lon: s.lon,
    wheelchair: s.stops.some((i) => gtfs.stops[i].wheelchair),
    routes: [...s.routes].sort((a, b) => gtfs.routes.get(a).sortOrder - gtfs.routes.get(b).sortOrder),
  };
}

app.get('/api/meta', (req, res) => {
  const gtfs = getGtfs();
  res.json({ agency: gtfs.agency, validity: gtfs.validity, loadedAt: gtfs.loadedAt });
});

// Toutes les lignes, avec leurs tracés (pour dessiner le réseau complet sur la carte).
app.get('/api/routes', (req, res) => {
  const gtfs = getGtfs();
  const routes = [...gtfs.routes.values()]
    .filter((r) => r.directions.length)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((r) => ({
      ...routeSummary(r),
      directions: r.directions.map((d) => ({ direction: d.direction, headsign: d.headsign })),
      shapes: r.shapeIds.map((id) => gtfs.shapes.get(id)),
    }));
  res.set('Cache-Control', 'public, max-age=3600').json(routes);
});

app.get('/api/routes/:id', (req, res) => {
  const gtfs = getGtfs();
  const r = gtfs.routes.get(req.params.id);
  if (!r) return res.status(404).json({ error: 'Ligne inconnue' });
  res.json({
    ...routeSummary(r),
    shapes: r.shapeIds.map((id) => gtfs.shapes.get(id)),
    directions: r.directions.map((d) => ({
      direction: d.direction,
      headsign: d.headsign,
      stops: d.stops.map((sid) => stationSummary(gtfs, gtfs.stations.get(sid))),
    })),
  });
});

app.get('/api/stations', (req, res) => {
  const gtfs = getGtfs();
  const list = [...gtfs.stations]
    .filter(([key, s]) => key === s.id && s.routes.size) // ignore les alias des stations fusionnées
    .map(([, s]) => s)
    .map((s) => stationSummary(gtfs, s))
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  res.set('Cache-Control', 'public, max-age=3600').json(list);
});

// Prochains passages à un arrêt, enrichis des retards temps réel.
app.get('/api/stations/:id/departures', wrap(async (req, res) => {
  const gtfs = getGtfs();
  const station = gtfs.stations.get(req.params.id);
  if (!station) return res.status(404).json({ error: 'Arrêt inconnu' });
  const limit = Math.min(+req.query.limit || 30, 100);
  const now = parisNow();
  const updates = await getTripUpdates();
  const nowMs = Date.now();

  const list = scheduledDepartures(gtfs, station.id, now.date, now.seconds - 15 * 60, now.seconds + 4 * 3600);
  const departures = [];
  for (const d of list) {
    const { trip, index: k } = d;
    const route = gtfs.routes.get(trip.routeId);
    const scheduled = (serviceDayStart(now.date) + d.time) * 1000;
    const rt = delayAt(gtfs, trip, k, d.serviceDate, updates.get(trip.id));
    const delay = rt?.delay ?? null;
    const expected = scheduled + (delay || 0) * 1000;
    if (expected < nowMs - 30_000) continue;
    departures.push({
      tripId: trip.id,
      routeId: route.id,
      shortName: route.shortName,
      color: route.color,
      textColor: route.textColor,
      headsign: trip.headsign,
      direction: trip.direction,
      platform: gtfs.stops[trip.stops[k]].id,
      wheelchair: trip.wheelchair,
      scheduled,
      expected,
      delay,
      realtime: delay !== null,
      canceled: !!rt?.canceled,
      skipped: !!rt?.skipped,
    });
    if (departures.length >= limit) break;
  }
  departures.sort((a, b) => a.expected - b.expected);
  res.json({ station: stationSummary(gtfs, station), departures, generatedAt: nowMs });
}));

// Parcours détaillé d'une course (utile pour suivre un bus).
app.get('/api/trips/:id', wrap(async (req, res) => {
  const gtfs = getGtfs();
  const ti = gtfs.tripIndex.get(req.params.id);
  if (ti === undefined) return res.status(404).json({ error: 'Course inconnue' });
  const trip = gtfs.trips[ti];
  const route = gtfs.routes.get(trip.routeId);
  const now = parisNow();
  const date = now.date;
  const tu = (await getTripUpdates()).get(trip.id);
  const dayStart = serviceDayStart(tu?.startDate || date);
  res.json({
    id: trip.id,
    route: routeSummary(route),
    headsign: trip.headsign,
    shape: trip.shapeId ? gtfs.shapes.get(trip.shapeId) : null,
    stops: Array.from(trip.stops, (si, k) => {
      const s = gtfs.stops[si];
      const rt = delayAt(gtfs, trip, k, tu?.startDate || date, tu);
      return {
        stationId: s.station, name: s.name, lat: s.lat, lon: s.lon,
        scheduled: (dayStart + trip.dep[k]) * 1000,
        delay: rt?.delay ?? null,
      };
    }),
  });
}));

app.get('/api/vehicles', wrap(async (req, res) => {
  res.json({ vehicles: await getVehicles(), generatedAt: Date.now() });
}));

app.get('/api/alerts', wrap(async (req, res) => {
  res.json(await getAlerts());
}));

app.get('/api/bikes', wrap(async (req, res) => {
  res.json(await getBikes());
}));

function parseLatLon(str) {
  const [lat, lon] = String(str || '').split(',').map(Number);
  return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null;
}

app.get('/api/plan', wrap(async (req, res) => {
  const gtfs = getGtfs();
  const from = parseLatLon(req.query.from);
  const to = parseLatLon(req.query.to);
  if (!from || !to) return res.status(400).json({ error: 'Paramètres from et to attendus (lat,lon)' });
  from.name = req.query.fromName;
  to.name = req.query.toName;

  const now = parisNow();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(req.query.date || '') ? req.query.date.replace(/-/g, '') : now.date;
  let time = now.seconds;
  if (/^\d{1,2}:\d{2}$/.test(req.query.time || '')) {
    const [h, m] = req.query.time.split(':').map(Number);
    time = h * 3600 + m * 60;
  }
  if (date < gtfs.validity.from || date > gtfs.validity.to) {
    return res.status(400).json({ error: `Les horaires disponibles couvrent du ${gtfs.validity.from} au ${gtfs.validity.to}` });
  }
  const updates = date === now.date ? await getTripUpdates() : new Map();
  res.json({ itineraries: plan(gtfs, { from, to, date, time }, updates) });
}));

// Recherche d'adresses via le service national de géocodage (Géoplateforme IGN).
app.get('/api/geocode', wrap(async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (q.length < 3) return res.json([]);
  const url = new URL('https://data.geopf.fr/geocodage/search');
  url.searchParams.set('q', q);
  url.searchParams.set('limit', '6');
  url.searchParams.set('lat', '49.1193');
  url.searchParams.set('lon', '6.1757');
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(6000) });
    const data = await r.json();
    res.json((data.features || []).map((f) => ({
      label: f.properties.label,
      city: f.properties.city,
      lat: f.geometry.coordinates[1],
      lon: f.geometry.coordinates[0],
    })));
  } catch {
    res.json([]);
  }
}));

// En production, le serveur sert aussi l'application React compilée.
const clientDist = path.resolve(import.meta.dirname, '../../client/dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get(/^\/(?!api\/).*/, (req, res) => res.sendFile(path.join(clientDist, 'index.html')));
}

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Erreur interne du serveur' });
});

await loadGtfs();
scheduleDailyReload();
app.listen(PORT, () => console.log(`[api] http://localhost:${PORT}`));

// Vélos en libre-service GraouLib' (flux GBFS).
const GBFS_ROOT = process.env.GBFS_URL || 'https://gbfs.graoulib.fifteen.eu/gbfs/metz/gbfs.json';
const TTL = 60_000;

let feedUrls = null;
let cache = { at: 0, value: null };

async function getJson(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} sur ${url}`);
  return res.json();
}

async function discover() {
  if (feedUrls) return feedUrls;
  const root = await getJson(GBFS_ROOT);
  const lang = root.data.fr || root.data.en || Object.values(root.data)[0];
  feedUrls = Object.fromEntries(lang.feeds.map((f) => [f.name, f.url]));
  return feedUrls;
}

// Les URLs annoncées par l'opérateur sont parfois cassées : on se rabat alors
// sur le même nom de flux à côté du gbfs.json racine.
async function getFeed(name) {
  const urls = await discover();
  try {
    return await getJson(urls[name]);
  } catch {
    return getJson(new URL(`${name}.json`, GBFS_ROOT).href);
  }
}

export async function getBikes() {
  if (cache.value && Date.now() - cache.at < TTL) return cache.value;
  try {
    const [info, status] = await Promise.all([getFeed('station_information'), getFeed('station_status')]);
    const statusById = new Map(status.data.stations.map((s) => [s.station_id, s]));
    const stations = info.data.stations.map((s) => {
      const st = statusById.get(s.station_id) || {};
      return {
        id: s.station_id,
        name: s.name,
        lat: s.lat,
        lon: s.lon,
        capacity: s.capacity ?? null,
        bikes: st.num_bikes_available ?? 0,
        docks: st.num_docks_available ?? 0,
        open: st.is_renting !== false && st.is_renting !== 0,
      };
    });
    cache = { at: Date.now(), value: { stations } };
  } catch (err) {
    console.warn(`[gbfs] indisponible : ${err.message}`);
    feedUrls = null;
    if (!cache.value) return { stations: [] };
  }
  return cache.value;
}

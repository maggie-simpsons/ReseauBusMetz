const timeFmt = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' });

export const formatTime = (ms) => timeFmt.format(new Date(ms));

export function formatDuration(sec) {
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')}`;
}

export function formatDistance(m) {
  return m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1).replace('.', ',')} km`;
}

// "dans 3 min", "à l'approche" ou l'heure si c'est loin.
export function formatWait(ms, now = Date.now()) {
  const min = Math.floor((ms - now) / 60000);
  if (min <= 0) return 'À l’approche';
  if (min < 60) return `${min} min`;
  return formatTime(ms);
}

export function formatDelay(sec) {
  if (sec == null) return null;
  const min = Math.round(sec / 60);
  if (min === 0) return 'À l’heure';
  return min > 0 ? `+${min} min` : `${min} min (en avance)`;
}

// Recherche insensible à la casse et aux accents.
export const normalize = (s) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export function distanceM(a, b) {
  const R = 6371000, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

// Les noms d'arrêts sont en majuscules dans les données : on les rend plus lisibles.
const SMALL = new Set(['de', 'du', 'des', 'la', 'le', 'les', 'et', 'sur', 'aux', 'au', 'en', "d'", "l'"]);
export function prettyName(name) {
  if (!name || name !== name.toUpperCase()) return name;
  return name
    .toLowerCase()
    .split(/(\s+|-|')/)
    .map((w, i) => (i > 0 && SMALL.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join('')
    .replace(/\b(Pem|Sncf|Chr|Tad|Zac|Zi|Iut|P\+r)\b/g, (m) => m.toUpperCase());
}

// Date et heure à Paris ("AAAA-MM-JJ", "HH:MM"), quel que soit le fuseau du téléphone.
export function parisDateTime(date = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(date).map((p) => [p.type, p.value]),
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

const dateTimeFmt = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Paris' });
export const formatDateTime = (ms) => dateTimeFmt.format(new Date(ms));

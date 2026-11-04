// Gestion de l'heure dans le fuseau du réseau (Europe/Paris).
const TZ = 'Europe/Paris';

const fmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: TZ,
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit',
  hourCycle: 'h23',
});

function parts(date) {
  const p = {};
  for (const { type, value } of fmt.formatToParts(date)) p[type] = value;
  return p;
}

// Décalage (ms) entre l'heure de Paris et UTC à un instant donné.
function tzOffset(epochMs) {
  const p = parts(new Date(epochMs));
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return asUtc - Math.floor(epochMs / 1000) * 1000;
}

// "Maintenant" à Paris : date de service (YYYYMMDD) et secondes depuis minuit.
export function parisNow(date = new Date()) {
  const p = parts(date);
  return {
    date: `${p.year}${p.month}${p.day}`,
    seconds: +p.hour * 3600 + +p.minute * 60 + +p.second,
  };
}

// Epoch (secondes) du début de la journée de service, selon la norme GTFS
// ("midi moins 12 h"), ce qui gère correctement les changements d'heure.
export function serviceDayStart(dateStr) {
  const y = +dateStr.slice(0, 4), m = +dateStr.slice(4, 6), d = +dateStr.slice(6, 8);
  const noonGuess = Date.UTC(y, m - 1, d, 12);
  const noon = noonGuess - tzOffset(noonGuess);
  return Math.round(noon / 1000) - 12 * 3600;
}

export function addDays(dateStr, n) {
  const y = +dateStr.slice(0, 4), m = +dateStr.slice(4, 6), d = +dateStr.slice(6, 8);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10).replace(/-/g, '');
}

export function weekdayName(dateStr) {
  const y = +dateStr.slice(0, 4), m = +dateStr.slice(4, 6), d = +dateStr.slice(6, 8);
  return ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][
    new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  ];
}

export function parseGtfsTime(t) {
  if (!t) return -1;
  const [h, m, s] = t.split(':');
  return +h * 3600 + +m * 60 + +s;
}

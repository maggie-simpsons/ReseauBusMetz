const R = 6371000;
const rad = (d) => (d * Math.PI) / 180;

// Distance en mètres entre deux points (formule de haversine).
export function distance(lat1, lon1, lat2, lon2) {
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// Vitesse de marche ≈ 4,5 km/h, avec un facteur 1,3 pour les détours du réseau piéton.
export const WALK_SPEED = 1.25;
export const WALK_DETOUR = 1.3;

export function walkSeconds(meters) {
  return Math.round((meters * WALK_DETOUR) / WALK_SPEED);
}

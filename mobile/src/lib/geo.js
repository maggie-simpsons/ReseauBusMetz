// Conversions et simplification des tracés pour react-native-maps.

export const METZ = { latitude: 49.1193, longitude: 6.1757, latitudeDelta: 0.12, longitudeDelta: 0.12 };

export const toCoord = ([lat, lon]) => ({ latitude: lat, longitude: lon });

// Douglas-Peucker sur des points [lat, lon]. Le réseau complet compte ~100 000 points :
// les simplifier rend la carte fluide sur mobile sans changer l'aspect des lignes.
export function simplify(points, tolerance = 0.00006) {
  if (!points || points.length < 3) return points || [];
  const sq = tolerance * tolerance;
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ay, ax] = points[a];
    const [by, bx] = points[b];
    const dx = bx - ax, dy = by - ay;
    const len = dx * dx + dy * dy;
    let max = 0, idx = -1;
    for (let i = a + 1; i < b; i++) {
      const [py, px] = points[i];
      let t = len ? ((px - ax) * dx + (py - ay) * dy) / len : 0;
      t = Math.max(0, Math.min(1, t));
      const ex = ax + t * dx - px, ey = ay + t * dy - py;
      const d = ex * ex + ey * ey;
      if (d > max) { max = d; idx = i; }
    }
    if (max > sq && idx > 0) {
      keep[idx] = 1;
      stack.push([a, idx], [idx, b]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

export function inRegion(region, lat, lon, margin = 0.2) {
  const h = region.latitudeDelta * (0.5 + margin);
  const w = region.longitudeDelta * (0.5 + margin);
  return Math.abs(lat - region.latitude) <= h && Math.abs(lon - region.longitude) <= w;
}

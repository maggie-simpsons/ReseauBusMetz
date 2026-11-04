import { useMemo, useState } from 'react';
import { RouteBadge, Loading } from './common.jsx';
import { normalize, prettyName, distanceM, formatDistance } from '../format.js';

const MAX_RESULTS = 60;

export default function StopsPanel({ stations, routesById, onSelect }) {
  const [query, setQuery] = useState('');
  const [position, setPosition] = useState(null);
  const [geoError, setGeoError] = useState(null);

  const results = useMemo(() => {
    if (!stations) return [];
    const q = normalize(query);
    let list = q ? stations.filter((s) => normalize(s.name).includes(q)) : stations;
    if (position) {
      list = list
        .map((s) => ({ ...s, dist: distanceM(position, s) }))
        .sort((a, b) => a.dist - b.dist);
    }
    return list.slice(0, MAX_RESULTS);
  }, [stations, query, position]);

  function locate() {
    setGeoError(null);
    if (!navigator.geolocation) return setGeoError('La géolocalisation n’est pas disponible.');
    navigator.geolocation.getCurrentPosition(
      (p) => setPosition({ lat: p.coords.latitude, lon: p.coords.longitude }),
      () => setGeoError('Impossible d’obtenir votre position.'),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  if (!stations) return <Loading />;

  return (
    <div className="panel">
      <input className="search" type="search" placeholder="Rechercher un arrêt…"
        value={query} onChange={(e) => setQuery(e.target.value)} />
      <div className="toolbar">
        {position ? (
          <button className="chip active" onClick={() => setPosition(null)}>📍 Triés par distance ✕</button>
        ) : (
          <button className="chip" onClick={locate}>📍 Arrêts autour de moi</button>
        )}
        <span className="muted small">{stations.length} arrêts</span>
      </div>
      {geoError && <p className="state state-error">{geoError}</p>}
      <ul className="list">
        {results.map((s) => (
          <li key={s.id}>
            <button className="row row-stop" onClick={() => onSelect(s.id)}>
              <span className="row-text">
                {prettyName(s.name)}
                {s.dist != null && <span className="muted small"> · {formatDistance(s.dist)}</span>}
              </span>
              <span className="mini-badges">
                {s.routes.slice(0, 8).map((id) => <RouteBadge key={id} route={routesById.get(id)} small />)}
                {s.routes.length > 8 && <span className="muted small">+{s.routes.length - 8}</span>}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {!results.length && <p className="state">Aucun arrêt trouvé.</p>}
    </div>
  );
}

import { useMemo, useState } from 'react';
import { RouteBadge, Loading } from './common.jsx';
import { normalize, prettyName } from '../format.js';

export default function LinesPanel({ routes, alerts, onSelect }) {
  const [query, setQuery] = useState('');

  const disrupted = useMemo(
    () => new Set((alerts || []).filter((a) => a.active).flatMap((a) => a.routes)),
    [alerts],
  );

  const groups = useMemo(() => {
    if (!routes) return [];
    const q = normalize(query);
    const map = new Map();
    for (const r of routes) {
      if (q && !normalize(`${r.shortName} ${r.longName}`).includes(q)) continue;
      if (!map.has(r.category.id)) map.set(r.category.id, { ...r.category, routes: [] });
      map.get(r.category.id).routes.push(r);
    }
    return [...map.values()].sort((a, b) => a.order - b.order);
  }, [routes, query]);

  if (!routes) return <Loading />;

  return (
    <div className="panel">
      <input className="search" type="search" placeholder="Rechercher une ligne (ex. MA, L5, Woippy…)"
        value={query} onChange={(e) => setQuery(e.target.value)} />
      {groups.map((g) => (
        <section key={g.id}>
          <h3 className="group-title">{g.name}</h3>
          <ul className="list">
            {g.routes.map((r) => (
              <li key={r.id}>
                <button className="row" onClick={() => onSelect(r.id)}>
                  <RouteBadge route={r} />
                  <span className="row-text">{prettyName(r.longName)}</span>
                  {disrupted.has(r.id) && <span className="warn" title="Perturbation en cours">⚠</span>}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {!groups.length && <p className="state">Aucune ligne ne correspond.</p>}
    </div>
  );
}

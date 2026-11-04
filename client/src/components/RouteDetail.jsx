import { useState } from 'react';
import { RouteBadge, BackButton, Loading, ErrorState } from './common.jsx';
import AlertCard from './AlertCard.jsx';
import { prettyName } from '../format.js';

export default function RouteDetail({ route, routeInfo, error, vehicles, alerts, onBack, onSelectStation }) {
  const [dirIndex, setDirIndex] = useState(0);
  const head = route || routeInfo;

  const routeAlerts = (alerts || []).filter((a) => a.active && a.routes.includes(head?.id));
  const liveCount = (vehicles || []).filter((v) => v.routeId === head?.id).length;
  const dir = route?.directions[dirIndex] || route?.directions[0];

  return (
    <div className="panel">
      <BackButton onClick={onBack}>Toutes les lignes</BackButton>
      {head && (
        <header className="detail-head">
          <RouteBadge route={head} />
          <div>
            <h2>{prettyName(head.longName)}</h2>
            <p className="muted">
              {head.category?.name} · {liveCount} bus en circulation
            </p>
          </div>
        </header>
      )}

      {routeAlerts.map((a) => <AlertCard key={a.id} alert={a} />)}

      {!route && !error && <Loading />}
      {error && <ErrorState error={error} />}

      {route && route.directions.length > 1 && (
        <div className="segmented">
          {route.directions.map((d, i) => (
            <button key={d.direction} className={i === dirIndex ? 'active' : ''} onClick={() => setDirIndex(i)}>
              → {prettyName(d.headsign)}
            </button>
          ))}
        </div>
      )}

      {dir && (
        <ol className="timeline" style={{ '--line': route.color }}>
          {dir.stops.map((s, i) => (
            <li key={`${s.id}-${i}`}>
              <button className="timeline-stop" onClick={() => onSelectStation(s.id)}>
                <span className="dot" />
                <span className="row-text">
                  {prettyName(s.name)}
                  {s.wheelchair && <span className="muted" title="Accessible en fauteuil roulant"> ♿</span>}
                </span>
                <span className="mini-badges">
                  {s.routes.filter((id) => id !== route.id).length > 0 && (
                    <span className="muted small">+{s.routes.length - 1} ligne{s.routes.length > 2 ? 's' : ''}</span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { useApi } from '../api.js';
import { RouteBadge, BackButton, Loading, ErrorState, LiveDot } from './common.jsx';
import AlertCard from './AlertCard.jsx';
import { formatTime, formatWait, prettyName } from '../format.js';

const REFRESH_MS = 20_000;

export default function StationDetail({ stationId, routesById, alerts, onBack, onSelectRoute, onPlanFrom, onPlanTo }) {
  const { data, error, loading, reload } = useApi(`/stations/${encodeURIComponent(stationId)}/departures?limit=40`, REFRESH_MS);
  const [filter, setFilter] = useState(null);
  const [, tick] = useState(0);

  // Rafraîchit l'affichage des minutes restantes entre deux requêtes.
  useEffect(() => {
    const id = setInterval(() => tick((x) => x + 1), 15_000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => setFilter(null), [stationId]);

  const station = data?.station;
  const departures = useMemo(
    () => (data?.departures || []).filter((d) => !filter || d.routeId === filter),
    [data, filter],
  );
  const stationAlerts = (alerts || []).filter(
    (a) => a.active && (a.stations.includes(stationId) || a.routes.some((r) => station?.routes.includes(r))),
  );

  return (
    <div className="panel">
      <BackButton onClick={onBack} />
      {loading && !data && <Loading />}
      {error && !data && <ErrorState error={error} onRetry={reload} />}
      {station && (
        <>
          <header className="detail-head">
            <div className="stop-icon">🚏</div>
            <div>
              <h2>{prettyName(station.name)}</h2>
              <p className="muted">
                {station.routes.length} ligne{station.routes.length > 1 ? 's' : ''}
                {station.wheelchair && ' · ♿ Accessible'}
              </p>
            </div>
          </header>

          <div className="toolbar">
            <button className="chip" onClick={() => onPlanFrom(station)}>Partir d’ici</button>
            <button className="chip" onClick={() => onPlanTo(station)}>Aller ici</button>
          </div>

          <div className="mini-badges filter-badges">
            <button className={`chip ${!filter ? 'active' : ''}`} onClick={() => setFilter(null)}>Toutes</button>
            {station.routes.map((id) => (
              <button key={id} className={`badge-btn ${filter === id ? 'active' : ''}`}
                onClick={() => setFilter(filter === id ? null : id)}
                onDoubleClick={() => onSelectRoute(id)} title="Double-clic : voir la ligne">
                <RouteBadge route={routesById.get(id)} />
              </button>
            ))}
          </div>

          {stationAlerts.map((a) => <AlertCard key={a.id} alert={a} routesById={routesById} />)}

          <h3 className="group-title">Prochains passages</h3>
          <ul className="departures">
            {departures.map((d) => (
              <li key={`${d.tripId}-${d.scheduled}`} className={d.canceled || d.skipped ? 'canceled' : ''}>
                <RouteBadge route={{ shortName: d.shortName, color: d.color, textColor: d.textColor }} />
                <div className="dep-main">
                  <div className="dep-headsign">{prettyName(d.headsign)}</div>
                  <div className="muted small">
                    {d.canceled ? 'Supprimé' : d.skipped ? 'Arrêt non desservi' : (
                      <>
                        {formatTime(d.expected)}
                        {d.realtime && d.delay >= 60 && (
                          <span className="late"> · retard {Math.round(d.delay / 60)} min (prévu {formatTime(d.scheduled)})</span>
                        )}
                        {d.realtime && d.delay <= -60 && <span className="early"> · en avance</span>}
                        {!d.realtime && ' · horaire théorique'}
                      </>
                    )}
                  </div>
                </div>
                <div className={`dep-wait ${d.realtime ? 'is-live' : ''}`}>
                  {d.realtime && <LiveDot />}
                  {formatWait(d.expected)}
                </div>
              </li>
            ))}
          </ul>
          {!departures.length && <p className="state">Aucun passage prévu dans les 4 prochaines heures.</p>}
          <p className="muted small legend"><LiveDot /> Temps réel · sinon horaire théorique</p>
        </>
      )}
    </div>
  );
}

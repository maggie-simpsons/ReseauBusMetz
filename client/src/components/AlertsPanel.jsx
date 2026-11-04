import { useMemo } from 'react';
import AlertCard from './AlertCard.jsx';
import { Loading } from './common.jsx';

export default function AlertsPanel({ alerts, routes }) {
  const routesById = useMemo(() => new Map((routes || []).map((r) => [r.id, r])), [routes]);
  if (!alerts) return <Loading />;
  const active = alerts.filter((a) => a.active);
  const upcoming = alerts.filter((a) => !a.active);

  return (
    <div className="panel">
      {!alerts.length && (
        <div className="empty">
          <div className="empty-icon">✅</div>
          <p>Aucune perturbation signalée sur le réseau.</p>
        </div>
      )}
      {active.length > 0 && <h3 className="group-title">En cours</h3>}
      {active.map((a) => <AlertCard key={a.id} alert={a} routesById={routesById} />)}
      {upcoming.length > 0 && <h3 className="group-title">À venir</h3>}
      {upcoming.map((a) => <AlertCard key={a.id} alert={a} routesById={routesById} />)}
    </div>
  );
}

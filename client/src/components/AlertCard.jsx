import { RouteBadge } from './common.jsx';

const dateFmt = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Paris' });

export default function AlertCard({ alert, routesById }) {
  const period = alert.periods.find((p) => p.start || p.end);
  return (
    <article className={`alert ${alert.active ? '' : 'alert-future'}`}>
      <div className="alert-head">
        <span className="warn">⚠</span>
        <strong>{alert.title || 'Perturbation'}</strong>
      </div>
      {routesById && alert.routes.length > 0 && (
        <div className="mini-badges">
          {alert.routes.map((id) => <RouteBadge key={id} route={routesById.get(id)} small />)}
        </div>
      )}
      {alert.description && <p className="alert-text">{alert.description}</p>}
      {period && (
        <p className="muted small">
          {period.start && `Du ${dateFmt.format(period.start * 1000)}`}
          {period.end && ` au ${dateFmt.format(period.end * 1000)}`}
        </p>
      )}
      {alert.url && <a href={alert.url} target="_blank" rel="noreferrer">En savoir plus</a>}
    </article>
  );
}

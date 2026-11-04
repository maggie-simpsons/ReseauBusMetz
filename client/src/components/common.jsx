export function RouteBadge({ route, small }) {
  if (!route) return null;
  return (
    <span className={`badge ${small ? 'badge-sm' : ''}`} style={{ background: route.color, color: route.textColor }}>
      {route.shortName}
    </span>
  );
}

export function BackButton({ onClick, children = 'Retour' }) {
  return (
    <button className="back" onClick={onClick}>
      ‹ {children}
    </button>
  );
}

export function Loading({ text = 'Chargement…' }) {
  return <div className="state"><span className="spinner" /> {text}</div>;
}

export function ErrorState({ error, onRetry }) {
  return (
    <div className="state state-error">
      {error?.message || 'Une erreur est survenue'}
      {onRetry && <button className="link" onClick={onRetry}>Réessayer</button>}
    </div>
  );
}

export function LiveDot({ title = 'Temps réel' }) {
  return <span className="live-dot" title={title} aria-label={title} />;
}

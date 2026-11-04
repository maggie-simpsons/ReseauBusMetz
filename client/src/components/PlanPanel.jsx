import { useState } from 'react';
import { api } from '../api.js';
import PlaceInput from './PlaceInput.jsx';
import { RouteBadge, Loading, ErrorState, LiveDot } from './common.jsx';
import { formatTime, formatDuration, formatDistance, formatDelay, prettyName } from '../format.js';

function parisDateTime() {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(new Date()).map((p) => [p.type, p.value]),
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

export default function PlanPanel({ plan, setPlan, stations }) {
  const [when, setWhen] = useState('now');
  const [dt, setDt] = useState(parisDateTime);
  const [state, setState] = useState({ loading: false, error: null });
  const [expanded, setExpanded] = useState(0);

  const { from, to, results, selected, picking } = plan;

  async function search(e) {
    e?.preventDefault();
    if (!from || !to) return;
    setState({ loading: true, error: null });
    const params = new URLSearchParams({
      from: `${from.lat},${from.lon}`, to: `${to.lat},${to.lon}`,
      fromName: from.name || '', toName: to.name || '',
    });
    if (when === 'later') {
      params.set('date', dt.date);
      params.set('time', dt.time);
    }
    try {
      const data = await api(`/plan?${params}`);
      setPlan((p) => ({ ...p, results: data.itineraries, selected: 0 }));
      setExpanded(0);
      setState({ loading: false, error: null });
    } catch (error) {
      setState({ loading: false, error });
    }
  }

  const update = (patch) => setPlan((p) => ({ ...p, results: null, ...patch }));

  return (
    <div className="panel">
      <form className="plan-form" onSubmit={search}>
        <PlaceInput label="Départ" marker="from" value={from} stations={stations}
          onChange={(v) => update({ from: v, picking: null })}
          picking={picking === 'from'} onPick={() => setPlan((p) => ({ ...p, picking: p.picking === 'from' ? null : 'from' }))} />
        <PlaceInput label="Arrivée" marker="to" value={to} stations={stations}
          onChange={(v) => update({ to: v, picking: null })}
          picking={picking === 'to'} onPick={() => setPlan((p) => ({ ...p, picking: p.picking === 'to' ? null : 'to' }))} />
        {picking && <p className="hint">Cliquez sur la carte pour placer le point {picking === 'from' ? 'de départ' : 'd’arrivée'}.</p>}

        <div className="plan-options">
          <button type="button" className="chip" onClick={() => update({ from: to, to: from })} title="Inverser">⇅ Inverser</button>
          <select value={when} onChange={(e) => setWhen(e.target.value)} aria-label="Heure de départ">
            <option value="now">Partir maintenant</option>
            <option value="later">Partir à…</option>
          </select>
          {when === 'later' && (
            <>
              <input type="date" value={dt.date} onChange={(e) => setDt({ ...dt, date: e.target.value })} />
              <input type="time" value={dt.time} onChange={(e) => setDt({ ...dt, time: e.target.value })} />
            </>
          )}
        </div>
        <button className="primary" type="submit" disabled={!from || !to || state.loading}>
          Rechercher un itinéraire
        </button>
      </form>

      {state.loading && <Loading text="Calcul de l’itinéraire…" />}
      {state.error && <ErrorState error={state.error} />}
      {results && !results.length && (
        <p className="state">Aucun itinéraire trouvé. Essayez un autre horaire ou des points plus proches d’un arrêt.</p>
      )}

      {results?.map((it, i) => (
        <article key={i} className={`itinerary ${selected === i ? 'selected' : ''}`}
          onClick={() => { setPlan((p) => ({ ...p, selected: i })); setExpanded(i); }}>
          <div className="it-summary">
            <div>
              <div className="it-times">{formatTime(it.start)} → {formatTime(it.end)}</div>
              <div className="it-chain">
                {it.legs.map((l, j) => (
                  <span key={j} className="it-step">
                    {j > 0 && <span className="muted">›</span>}
                    {l.mode === 'walk' ? <span title={`Marche ${formatDistance(l.distance)}`}>🚶</span> : <RouteBadge route={l.route} small />}
                  </span>
                ))}
              </div>
            </div>
            <div className="it-duration">
              <strong>{formatDuration(it.duration)}</strong>
              <span className="muted small">
                {it.walkOnly ? 'à pied' : it.transfers === 0 ? 'direct' : `${it.transfers} corresp.`}
              </span>
            </div>
          </div>

          {expanded === i && (
            <ol className="legs">
              {it.legs.map((l, j) => (
                <li key={j} className={`leg leg-${l.mode}`} style={l.route ? { '--line': l.route.color } : undefined}>
                  <div className="leg-time">{formatTime(l.start)}</div>
                  <div className="leg-body">
                    {l.mode === 'walk' ? (
                      <>
                        <div><strong>{prettyName(l.from.name)}</strong></div>
                        <div className="muted small">🚶 Marcher {formatDuration(l.duration)} ({formatDistance(l.distance)}) jusqu’à {prettyName(l.to.name)}</div>
                      </>
                    ) : (
                      <>
                        <div><strong>{prettyName(l.from.name)}</strong></div>
                        <div className="leg-route">
                          <RouteBadge route={l.route} /> direction {prettyName(l.headsign)}
                        </div>
                        <div className="muted small">
                          {l.stops.length - 1} arrêt{l.stops.length > 2 ? 's' : ''} · {formatDuration((l.end - l.start) / 1000)}
                          {l.delay != null && <> · <LiveDot /> {formatDelay(l.delay)}</>}
                        </div>
                        <div className="muted small">Descendre à <strong>{prettyName(l.to.name)}</strong> ({formatTime(l.end)})</div>
                      </>
                    )}
                  </div>
                </li>
              ))}
              <li className="leg leg-end">
                <div className="leg-time">{formatTime(it.end)}</div>
                <div className="leg-body"><strong>{prettyName(it.legs[it.legs.length - 1].to.name)}</strong></div>
              </li>
            </ol>
          )}
        </article>
      ))}
    </div>
  );
}

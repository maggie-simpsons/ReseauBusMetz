import { useEffect, useMemo, useState } from 'react';
import { useApi } from './api.js';
import MapView from './components/MapView.jsx';
import LinesPanel from './components/LinesPanel.jsx';
import RouteDetail from './components/RouteDetail.jsx';
import StopsPanel from './components/StopsPanel.jsx';
import StationDetail from './components/StationDetail.jsx';
import PlanPanel from './components/PlanPanel.jsx';
import AlertsPanel from './components/AlertsPanel.jsx';
import { LiveDot } from './components/common.jsx';

const TABS = [
  { id: 'lines', label: 'Lignes', icon: '🚌' },
  { id: 'stops', label: 'Arrêts', icon: '🚏' },
  { id: 'plan', label: 'Itinéraire', icon: '🧭' },
  { id: 'alerts', label: 'Infos trafic', icon: '⚠️' },
];

const LAYERS = [
  { id: 'network', label: 'Réseau' },
  { id: 'school', label: 'Lignes scolaires' },
  { id: 'stops', label: 'Arrêts' },
  { id: 'vehicles', label: 'Bus en direct' },
  { id: 'bikes', label: 'Vélos GraouLib’' },
];

export default function App() {
  const [tab, setTab] = useState('lines');
  const [routeId, setRouteId] = useState(null);
  const [stationId, setStationId] = useState(null);
  const [layers, setLayers] = useState({ network: true, school: false, stops: true, vehicles: true, bikes: false });
  const [plan, setPlan] = useState({ from: null, to: null, results: null, selected: 0, picking: null });
  const [focus, setFocus] = useState(null);
  const [panelOpen, setPanelOpen] = useState(true);

  const routes = useApi('/routes');
  const stations = useApi('/stations');
  const alerts = useApi('/alerts', 60_000);
  const vehicles = useApi(layers.vehicles || routeId ? '/vehicles' : null, 10_000);
  const bikes = useApi(layers.bikes ? '/bikes' : null, 60_000);
  const routeDetail = useApi(routeId ? `/routes/${encodeURIComponent(routeId)}` : null);

  const routesById = useMemo(() => new Map((routes.data || []).map((r) => [r.id, r])), [routes.data]);
  const stationsById = useMemo(() => new Map((stations.data || []).map((s) => [s.id, s])), [stations.data]);
  const itinerary = tab === 'plan' && plan.results ? plan.results[plan.selected] : null;
  const activeAlerts = (alerts.data || []).filter((a) => a.active).length;

  // Recentrage de la carte selon la sélection.
  useEffect(() => {
    if (routeDetail.data?.shapes?.length) setFocus({ bounds: routeDetail.data.shapes.flat() });
  }, [routeDetail.data]);
  useEffect(() => {
    const s = stationsById.get(stationId);
    if (s) setFocus({ center: [s.lat, s.lon], zoom: 16 });
  }, [stationId, stationsById]);
  useEffect(() => {
    if (itinerary) setFocus({ bounds: itinerary.legs.flatMap((l) => l.geometry) });
  }, [itinerary]);

  function selectRoute(id) {
    setRouteId(id);
    setStationId(null);
    setTab('lines');
    setPanelOpen(true);
  }

  function selectStation(id) {
    setStationId(id);
    setPanelOpen(true);
  }

  function changeTab(id) {
    setTab(id);
    setStationId(null);
    if (id !== 'lines') setRouteId(null);
    setPanelOpen(true);
  }

  function planWith(key, station) {
    setPlan((p) => ({ ...p, results: null, [key]: { name: station.name, lat: station.lat, lon: station.lon } }));
    changeTab('plan');
  }

  function onMapClick(latlng) {
    if (tab !== 'plan' || !plan.picking) return;
    const point = { name: `Point sur la carte (${latlng.lat.toFixed(4)}, ${latlng.lng.toFixed(4)})`, lat: latlng.lat, lon: latlng.lng };
    setPlan((p) => ({ ...p, results: null, [p.picking]: point, picking: null }));
  }

  let content;
  if (stationId) {
    content = (
      <StationDetail
        stationId={stationId}
        routesById={routesById}
        alerts={alerts.data}
        onBack={() => setStationId(null)}
        onSelectRoute={selectRoute}
        onPlanFrom={(s) => planWith('from', s)}
        onPlanTo={(s) => planWith('to', s)}
      />
    );
  } else if (tab === 'lines' && routeId) {
    content = (
      <RouteDetail
        key={routeId}
        route={routeDetail.data}
        error={routeDetail.error}
        routeInfo={routesById.get(routeId)}
        vehicles={vehicles.data?.vehicles}
        alerts={alerts.data}
        onBack={() => setRouteId(null)}
        onSelectStation={selectStation}
      />
    );
  } else if (tab === 'lines') {
    content = <LinesPanel routes={routes.data} alerts={alerts.data} onSelect={selectRoute} />;
  } else if (tab === 'stops') {
    content = <StopsPanel stations={stations.data} routesById={routesById} onSelect={selectStation} />;
  } else if (tab === 'plan') {
    content = <PlanPanel plan={plan} setPlan={setPlan} stations={stations.data} />;
  } else {
    content = <AlertsPanel alerts={alerts.data} routes={routes.data} />;
  }

  return (
    <div className="app">
      <aside className={`sidebar ${panelOpen ? 'open' : 'collapsed'}`}>
        <header className="brand">
          <button className="brand-toggle" onClick={() => setPanelOpen((o) => !o)} aria-label="Afficher/masquer le panneau">
            <img src="/bus.svg" alt="" width="32" height="32" />
          </button>
          <div>
            <h1>Metz Transport</h1>
            <p className="muted small">
              Réseau LE MET’ · <LiveDot /> {vehicles.data ? `${vehicles.data.vehicles.length} bus en direct` : 'temps réel'}
            </p>
          </div>
        </header>
        <nav className="tabs">
          {TABS.map((t) => (
            <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => changeTab(t.id)}>
              <span className="tab-icon">{t.icon}</span>
              <span>{t.label}</span>
              {t.id === 'alerts' && activeAlerts > 0 && <span className="count">{activeAlerts}</span>}
            </button>
          ))}
        </nav>
        <div className="content">
          {routes.error && <p className="state state-error">Le serveur est injoignable. Lancez-le avec « npm run dev ».</p>}
          {content}
        </div>
      </aside>

      <main className="map-wrap">
        <MapView
          routes={routes.data}
          stations={stations.data}
          vehicles={vehicles.data?.vehicles}
          bikes={bikes.data?.stations}
          layers={layers}
          selectedRoute={routeId && tab === 'lines' && !itinerary ? routeDetail.data : null}
          selectedStationId={stationId}
          itinerary={itinerary}
          planPoints={tab === 'plan' ? plan : {}}
          focus={focus}
          picking={tab === 'plan' && plan.picking}
          onMapClick={onMapClick}
          onSelectStation={selectStation}
          onSelectRoute={selectRoute}
        />
        <details className="layers" open={window.innerWidth > 768}>
          <summary>Couches</summary>
          {LAYERS.map((l) => (
            <label key={l.id}>
              <input type="checkbox" checked={layers[l.id]}
                onChange={(e) => setLayers((s) => ({ ...s, [l.id]: e.target.checked }))} />
              {l.label}
            </label>
          ))}
        </details>
      </main>
    </div>
  );
}

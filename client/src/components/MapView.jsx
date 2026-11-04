import { useEffect, useMemo, useState } from 'react';
import L from 'leaflet';
import { MapContainer, TileLayer, Polyline, CircleMarker, Marker, Popup, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import { formatDelay, prettyName } from '../format.js';

const METZ = [49.1193, 6.1757];
const STOPS_MIN_ZOOM = 14;

const iconCache = new Map();
function cachedIcon(key, make) {
  if (!iconCache.has(key)) iconCache.set(key, make());
  return iconCache.get(key);
}

function vehicleIcon(v) {
  const bearing = v.bearing == null ? null : Math.round(v.bearing / 10) * 10;
  return cachedIcon(`v|${v.routeShortName}|${v.color}|${v.textColor}|${bearing}`, () =>
    L.divIcon({
      className: '',
      iconSize: [32, 32],
      iconAnchor: [16, 16],
      html: `<div class="veh" style="--c:${v.color};--t:${v.textColor}">
        ${bearing == null ? '' : `<div class="veh-arrow" style="transform:rotate(${bearing}deg)"></div>`}
        <div class="veh-body">${v.routeShortName || '?'}</div></div>`,
    }),
  );
}

function bikeIcon(s) {
  const level = !s.open ? 'off' : s.bikes === 0 ? 'empty' : s.bikes <= 2 ? 'low' : 'ok';
  return cachedIcon(`b|${level}|${s.bikes}`, () =>
    L.divIcon({
      className: '',
      iconSize: [28, 28],
      iconAnchor: [14, 14],
      html: `<div class="bike bike-${level}"><span>🚲</span><b>${s.bikes}</b></div>`,
    }),
  );
}

function pinIcon(kind) {
  return cachedIcon(`pin|${kind}`, () =>
    L.divIcon({
      className: '',
      iconSize: [30, 40],
      iconAnchor: [15, 38],
      html: `<div class="pin pin-${kind}">${kind === 'from' ? 'A' : 'B'}</div>`,
    }),
  );
}

// Recentre la carte quand l'élément sélectionné change.
function FocusController({ focus }) {
  const map = useMap();
  useEffect(() => {
    if (!focus) return;
    if (focus.bounds?.length) {
      map.flyToBounds(L.latLngBounds(focus.bounds), { padding: [40, 40], maxZoom: 16, duration: 0.6 });
    } else if (focus.center) {
      map.flyTo(focus.center, Math.max(map.getZoom(), focus.zoom || 16), { duration: 0.6 });
    }
  }, [focus, map]);
  return null;
}

function MapEvents({ onClick, onZoom }) {
  const map = useMapEvents({
    click: (e) => onClick?.(e.latlng),
    zoomend: () => onZoom(map.getZoom()),
  });
  return null;
}

function useDarkMode() {
  const [dark, setDark] = useState(() => window.matchMedia?.('(prefers-color-scheme: dark)').matches);
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!mq) return;
    const fn = (e) => setDark(e.matches);
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, []);
  return dark;
}

export default function MapView({
  routes, stations, vehicles, bikes, layers,
  selectedRoute, selectedStationId, itinerary, planPoints,
  focus, picking, onMapClick, onSelectStation, onSelectRoute,
}) {
  const [zoom, setZoom] = useState(13);
  const dark = useDarkMode();
  const renderer = useMemo(() => L.canvas({ padding: 0.5 }), []);
  const routeById = useMemo(() => new Map((routes || []).map((r) => [r.id, r])), [routes]);

  const selectedStationIds = useMemo(() => {
    if (!selectedRoute?.directions) return null;
    return new Set(selectedRoute.directions.flatMap((d) => d.stops.map((s) => s.id)));
  }, [selectedRoute]);

  const showStops = layers.stops && (zoom >= STOPS_MIN_ZOOM || selectedStationIds);
  const visibleStations = !stations || !showStops ? [] :
    selectedStationIds && zoom < STOPS_MIN_ZOOM ? stations.filter((s) => selectedStationIds.has(s.id)) : stations;

  const visibleVehicles = (vehicles || []).filter((v) => !selectedRoute || v.routeId === selectedRoute.id);
  const dimmed = !!(selectedRoute || itinerary);

  return (
    <MapContainer center={METZ} zoom={13} className={`map ${picking ? 'map-picking' : ''}`} zoomControl={false} preferCanvas>
      <TileLayer
        className={dark ? 'tiles-dark' : ''}
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · Données LE MET’, GraouLib’'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        maxZoom={19}
      />
      <FocusController focus={focus} />
      <MapEvents onClick={onMapClick} onZoom={setZoom} />

      {/* Réseau complet */}
      {layers.network && routes?.filter((r) => layers.school || r.category.id !== 'scolaires').map((r) =>
        r.shapes.map((shape, i) => (
          <Polyline
            key={`${r.id}-${i}`}
            positions={shape}
            renderer={renderer}
            pathOptions={{
              color: r.color,
              weight: r.category.id === 'mettis' ? 5 : 3,
              opacity: dimmed ? 0.12 : 0.75,
            }}
            eventHandlers={{ click: (e) => { L.DomEvent.stopPropagation(e); onSelectRoute(r.id); } }}
          >
            <Tooltip sticky>{r.shortName} · {prettyName(r.longName)}</Tooltip>
          </Polyline>
        )),
      )}

      {/* Ligne sélectionnée */}
      {selectedRoute?.shapes?.map((shape, i) => (
        <Polyline key={`sel-${i}`} positions={shape} renderer={renderer}
          pathOptions={{ color: selectedRoute.color, weight: 7, opacity: 0.95 }} />
      ))}

      {/* Arrêts */}
      {visibleStations.map((s) => {
        const onRoute = selectedStationIds?.has(s.id);
        const selected = s.id === selectedStationId;
        const color = onRoute ? selectedRoute.color : routeById.get(s.routes[0])?.color || '#555';
        return (
          <CircleMarker
            key={s.id}
            center={[s.lat, s.lon]}
            radius={selected ? 9 : onRoute ? 6 : 4}
            renderer={renderer}
            pathOptions={{
              color: selected ? '#111' : color,
              weight: selected ? 3 : 2,
              fillColor: '#fff',
              fillOpacity: 1,
              opacity: dimmed && !onRoute && !selected ? 0.35 : 1,
            }}
            eventHandlers={{ click: (e) => { L.DomEvent.stopPropagation(e); onSelectStation(s.id); } }}
          >
            <Tooltip direction="top" offset={[0, -4]}>{prettyName(s.name)}</Tooltip>
          </CircleMarker>
        );
      })}

      {/* Itinéraire */}
      {itinerary?.legs.map((leg, i) =>
        leg.mode === 'walk' ? (
          <Polyline key={`leg-${i}`} positions={leg.geometry}
            pathOptions={{ color: '#475569', weight: 4, dashArray: '2 8', lineCap: 'round' }} />
        ) : (
          <Polyline key={`leg-${i}`} positions={leg.geometry}
            pathOptions={{ color: leg.route.color, weight: 7, opacity: 0.95 }} />
        ),
      )}
      {itinerary?.legs.filter((l) => l.mode === 'bus').flatMap((l, i) => [
        <CircleMarker key={`b${i}a`} center={[l.from.lat, l.from.lon]} radius={6} pathOptions={{ color: l.route.color, fillColor: '#fff', fillOpacity: 1, weight: 3 }}>
          <Tooltip>{prettyName(l.from.name)}</Tooltip>
        </CircleMarker>,
        <CircleMarker key={`b${i}b`} center={[l.to.lat, l.to.lon]} radius={6} pathOptions={{ color: l.route.color, fillColor: '#fff', fillOpacity: 1, weight: 3 }}>
          <Tooltip>{prettyName(l.to.name)}</Tooltip>
        </CircleMarker>,
      ])}
      {planPoints.from && <Marker position={[planPoints.from.lat, planPoints.from.lon]} icon={pinIcon('from')} />}
      {planPoints.to && <Marker position={[planPoints.to.lat, planPoints.to.lon]} icon={pinIcon('to')} />}

      {/* Vélos GraouLib' */}
      {layers.bikes && bikes?.map((s) => (
        <Marker key={s.id} position={[s.lat, s.lon]} icon={bikeIcon(s)}>
          <Popup>
            <strong>{s.name}</strong><br />
            🚲 {s.bikes} vélo{s.bikes > 1 ? 's' : ''} disponible{s.bikes > 1 ? 's' : ''}<br />
            🅿️ {s.docks} place{s.docks > 1 ? 's' : ''} libre{s.docks > 1 ? 's' : ''}
            {!s.open && <><br /><em>Station fermée</em></>}
          </Popup>
        </Marker>
      ))}

      {/* Bus en temps réel */}
      {layers.vehicles && visibleVehicles.map((v) => (
        <Marker key={v.id} position={[v.lat, v.lon]} icon={vehicleIcon(v)} zIndexOffset={1000}>
          <Popup>
            <div className="veh-popup">
              <span className="badge" style={{ background: v.color, color: v.textColor }}>{v.routeShortName}</span>{' '}
              <strong>{v.headsign ? prettyName(v.headsign) : 'Bus'}</strong>
              {v.nextStop && <div>Prochain arrêt : {prettyName(v.nextStop)}</div>}
              {v.delay != null && <div>{formatDelay(v.delay)}</div>}
              {v.speed != null && <div>{v.speed} km/h</div>}
              <div className="muted">Véhicule n° {v.label || v.id}</div>
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}

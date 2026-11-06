import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { router, useIsFocused } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApi } from '../../lib/api';
import { useData } from '../../lib/data';
import { useColors } from '../../lib/theme';
import { METZ, inRegion, simplify, toCoord } from '../../lib/geo';
import { formatDelay, prettyName } from '../../lib/format';
import { LiveDot, RouteBadge } from '../../components/common';

const STOPS_MAX_DELTA = 0.035; // les arrêts n'apparaissent qu'à partir de ce niveau de zoom
const MAX_STOP_MARKERS = 250;

const LAYERS = [
  { id: 'network', label: 'Réseau' },
  { id: 'school', label: 'Lignes scolaires' },
  { id: 'stops', label: 'Arrêts' },
  { id: 'vehicles', label: 'Bus en direct' },
  { id: 'bikes', label: 'Vélos GraouLib’' },
];

// Les marqueurs personnalisés doivent suivre leurs changements de vue juste le temps
// d'être dessinés (sinon ils restent vides sur Android, ou coûtent cher en continu).
function useTracking(key) {
  const [track, setTrack] = useState(true);
  useEffect(() => {
    setTrack(true);
    const t = setTimeout(() => setTrack(false), 800);
    return () => clearTimeout(t);
  }, [key]);
  return track;
}

const StopMarker = memo(function StopMarker({ station, color, size }) {
  const track = useTracking(`${color}|${size}`);
  return (
    <Marker
      coordinate={toCoord([station.lat, station.lon])}
      title={prettyName(station.name)}
      description="Voir les prochains passages ›"
      onCalloutPress={() => router.push(`/station/${encodeURIComponent(station.id)}`)}
      tracksViewChanges={track}
      anchor={{ x: 0.5, y: 0.5 }}
    >
      <View style={[styles.stop, { width: size, height: size, borderRadius: size / 2, borderColor: color }]} />
    </Marker>
  );
});

const VehicleMarker = memo(function VehicleMarker({ v }) {
  const bearing = v.bearing == null ? null : Math.round(v.bearing / 15) * 15;
  const track = useTracking(`${v.routeShortName}|${bearing}`);
  const parts = [
    v.nextStop && `Prochain arrêt : ${prettyName(v.nextStop)}`,
    v.delay != null && formatDelay(v.delay),
    v.speed != null && `${v.speed} km/h`,
  ].filter(Boolean);
  return (
    <Marker
      coordinate={{ latitude: v.lat, longitude: v.lon }}
      title={`${v.routeShortName || 'Bus'} → ${v.headsign ? prettyName(v.headsign) : '?'}`}
      description={parts.join(' · ')}
      tracksViewChanges={track}
      anchor={{ x: 0.5, y: 0.5 }}
      zIndex={1000}
    >
      <View style={styles.vehWrap}>
        {bearing != null && (
          <View style={[styles.vehArrowBox, { transform: [{ rotate: `${bearing}deg` }] }]}>
            <View style={[styles.vehArrow, { borderBottomColor: v.color }]} />
          </View>
        )}
        <View style={[styles.veh, { backgroundColor: v.color }]}>
          <Text style={[styles.vehText, { color: v.textColor }]}>{v.routeShortName || '?'}</Text>
        </View>
      </View>
    </Marker>
  );
});

const BikeMarker = memo(function BikeMarker({ s }) {
  const level = !s.open ? 'off' : s.bikes === 0 ? 'empty' : s.bikes <= 2 ? 'low' : 'ok';
  const track = useTracking(`${level}|${s.bikes}`);
  const bg = { ok: '#16a34a', low: '#d97706', empty: '#dc2626', off: '#6b7280' }[level];
  return (
    <Marker
      coordinate={{ latitude: s.lat, longitude: s.lon }}
      title={s.name}
      description={s.open
        ? `🚲 ${s.bikes} vélo${s.bikes > 1 ? 's' : ''} · 🅿️ ${s.docks} place${s.docks > 1 ? 's' : ''}`
        : 'Station fermée'}
      tracksViewChanges={track}
      anchor={{ x: 0.5, y: 0.5 }}
    >
      <View style={[styles.bike, { backgroundColor: bg }]}>
        <Text style={styles.bikeText}>🚲 {s.bikes}</Text>
      </View>
    </Marker>
  );
});

export default function MapScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const focused = useIsFocused();
  const mapRef = useRef(null);
  const { routes, stations, routesById, plan, setPlan, mapFocus, setMapFocus } = useData();
  const [region, setRegion] = useState(METZ);
  const [layers, setLayers] = useState({ network: true, school: false, stops: true, vehicles: true, bikes: false });
  const [showLayers, setShowLayers] = useState(false);

  const vehicles = useApi(focused && layers.vehicles ? '/vehicles' : null, 10_000);
  const bikes = useApi(focused && layers.bikes ? '/bikes' : null, 60_000);
  const selectedRouteId = mapFocus?.routeId || null;
  const routeDetail = useApi(selectedRouteId ? `/routes/${encodeURIComponent(selectedRouteId)}` : null);
  const itinerary = mapFocus?.itinerary || null;
  const picking = mapFocus?.picking || null;

  // Tracés simplifiés, calculés une seule fois.
  const network = useMemo(
    () => (routes.data || []).map((r) => ({ route: r, lines: r.shapes.map((s) => simplify(s).map(toCoord)) })),
    [routes.data],
  );
  const networkById = useMemo(() => new Map(network.map((n) => [n.route.id, n])), [network]);

  const selectedStops = useMemo(() => {
    if (!routeDetail.data) return null;
    return new Set(routeDetail.data.directions.flatMap((d) => d.stops.map((s) => s.id)));
  }, [routeDetail.data]);

  // Recentrage de la carte selon ce qui est mis en avant. La carte doit être visible
  // (et avoir fini sa mise en page après le changement d'onglet) pour être recentrée.
  useEffect(() => {
    if (!mapFocus || !focused) return;
    const pad = { top: 140, right: 50, bottom: 200, left: 50 };
    const t = setTimeout(() => {
      const map = mapRef.current;
      if (!map) return;
      if (mapFocus.routeId) {
        const coords = networkById.get(mapFocus.routeId)?.lines.flat();
        if (coords?.length) map.fitToCoordinates(coords, { edgePadding: pad, animated: true });
      } else if (mapFocus.stationId) {
        const s = stations.data?.find((x) => x.id === mapFocus.stationId);
        if (s) map.animateToRegion({ latitude: s.lat, longitude: s.lon, latitudeDelta: 0.008, longitudeDelta: 0.008 }, 500);
      } else if (mapFocus.itinerary) {
        const coords = mapFocus.itinerary.legs.flatMap((l) => l.geometry).map(toCoord);
        if (coords.length) map.fitToCoordinates(coords, { edgePadding: pad, animated: true });
      }
    }, 350);
    return () => clearTimeout(t);
  }, [mapFocus, networkById, stations.data, focused]);

  const zoomedIn = region.latitudeDelta <= STOPS_MAX_DELTA;
  const visibleStops = useMemo(() => {
    if (!layers.stops || !stations.data) return [];
    const list = stations.data.filter((s) =>
      (zoomedIn || selectedStops?.has(s.id) || s.id === mapFocus?.stationId) && inRegion(region, s.lat, s.lon));
    return list.slice(0, MAX_STOP_MARKERS);
  }, [layers.stops, stations.data, zoomedIn, selectedStops, mapFocus, region]);

  // Avec une ligne ou un itinéraire affiché, on ne montre que les bus concernés.
  const itineraryRoutes = itinerary ? new Set(itinerary.legs.filter((l) => l.route).map((l) => l.route.id)) : null;
  const visibleVehicles = (vehicles.data?.vehicles || []).filter(
    (v) => (!selectedRouteId || v.routeId === selectedRouteId)
      && (!itineraryRoutes || itineraryRoutes.has(v.routeId))
      && inRegion(region, v.lat, v.lon, 0.5),
  );
  const dimmed = !!(selectedRouteId || itinerary);

  function setPoint(key, coordinate, name) {
    const point = {
      name: name || `Point sur la carte (${coordinate.latitude.toFixed(4)}, ${coordinate.longitude.toFixed(4)})`,
      lat: coordinate.latitude,
      lon: coordinate.longitude,
    };
    setPlan((p) => ({ ...p, results: null, [key]: point }));
    setMapFocus(null);
    router.navigate('/plan');
  }

  function onMapPress(e) {
    if (picking) setPoint(picking, e.nativeEvent.coordinate);
  }

  function onLongPress(e) {
    const coord = e.nativeEvent.coordinate;
    Alert.alert('Point sélectionné', 'Utiliser ce point pour un itinéraire ?', [
      { text: 'Partir d’ici', onPress: () => setPoint('from', coord) },
      { text: 'Aller ici', onPress: () => setPoint('to', coord) },
      { text: 'Annuler', style: 'cancel' },
    ]);
  }

  let banner = null;
  if (picking) banner = `Touchez la carte pour placer le point ${picking === 'from' ? 'de départ' : 'd’arrivée'}`;
  else if (selectedRouteId) {
    const r = routesById.get(selectedRouteId);
    banner = r ? prettyName(r.longName) : 'Ligne';
  } else if (itinerary) banner = 'Itinéraire affiché';

  return (
    <View style={{ flex: 1 }}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        initialRegion={METZ}
        onRegionChangeComplete={setRegion}
        onPress={onMapPress}
        onLongPress={onLongPress}
        showsUserLocation
        showsMyLocationButton
        showsCompass={false}
        toolbarEnabled={false}
        userInterfaceStyle={c.dark ? 'dark' : 'light'}
        mapPadding={{ top: insets.top + 56, right: 0, bottom: 0, left: 0 }}
      >
        {/* Réseau complet */}
        {layers.network && network
          .filter(({ route }) => layers.school || route.category.id !== 'scolaires')
          .flatMap(({ route, lines }) => lines.map((coords, i) => (
            <Polyline
              key={`${route.id}-${i}`}
              coordinates={coords}
              strokeColor={route.color + (dimmed ? '26' : 'C0')}
              strokeWidth={route.category.id === 'mettis' ? 5 : 3}
              tappable={!dimmed}
              onPress={() => router.push(`/route/${encodeURIComponent(route.id)}`)}
              zIndex={1}
            />
          )))}

        {/* Ligne sélectionnée */}
        {selectedRouteId && networkById.get(selectedRouteId)?.lines.map((coords, i) => (
          <Polyline key={`sel-${i}`} coordinates={coords} strokeWidth={7} zIndex={5}
            strokeColor={networkById.get(selectedRouteId).route.color} />
        ))}

        {/* Itinéraire */}
        {itinerary?.legs.map((leg, i) => (
          <Polyline
            key={`leg-${i}`}
            coordinates={leg.geometry.map(toCoord)}
            strokeColor={leg.mode === 'walk' ? '#475569' : leg.route.color}
            strokeWidth={leg.mode === 'walk' ? 4 : 7}
            lineDashPattern={leg.mode === 'walk' ? [2, 8] : undefined}
            zIndex={6}
          />
        ))}
        {itinerary && plan.from && <Marker coordinate={toCoord([plan.from.lat, plan.from.lon])} pinColor="green" title="Départ" />}
        {itinerary && plan.to && <Marker coordinate={toCoord([plan.to.lat, plan.to.lon])} pinColor="red" title="Arrivée" />}

        {/* Arrêts */}
        {visibleStops.map((s) => {
          const onRoute = selectedStops?.has(s.id);
          const selected = s.id === mapFocus?.stationId;
          const color = selected ? c.text
            : onRoute ? routeDetail.data.color
            : routesById.get(s.routes[0])?.color || '#555';
          return <StopMarker key={s.id} station={s} color={color} size={selected ? 18 : onRoute ? 13 : 10} />;
        })}

        {/* Vélos */}
        {layers.bikes && (bikes.data?.stations || [])
          .filter((s) => inRegion(region, s.lat, s.lon))
          .map((s) => <BikeMarker key={s.id} s={s} />)}

        {/* Bus en temps réel */}
        {layers.vehicles && visibleVehicles.map((v) => <VehicleMarker key={v.id} v={v} />)}
      </MapView>

      {/* En-tête */}
      <View style={[styles.top, { top: insets.top + 8 }]} pointerEvents="box-none">
        <View style={[styles.brand, { backgroundColor: c.card }]}>
          <Text style={{ fontSize: 18 }}>🚌</Text>
          <View style={{ marginLeft: 8 }}>
            <Text style={{ color: c.text, fontWeight: '800' }}>Metz Transport</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <LiveDot />
              <Text style={{ color: c.muted, fontSize: 12 }}>
                {routes.error ? 'Serveur injoignable'
                  : vehicles.data ? `${vehicles.data.vehicles.length} bus en direct` : 'Réseau LE MET’'}
              </Text>
            </View>
          </View>
        </View>
        <Pressable onPress={() => setShowLayers((x) => !x)} style={[styles.layersBtn, { backgroundColor: c.card }]}>
          <Text style={{ fontSize: 18 }}>🗂️</Text>
        </Pressable>
      </View>

      {showLayers && (
        <View style={[styles.layers, { top: insets.top + 64, backgroundColor: c.card }]}>
          {LAYERS.map((l) => (
            <View key={l.id} style={styles.layerRow}>
              <Text style={{ color: c.text, flex: 1 }}>{l.label}</Text>
              <Switch value={layers[l.id]} onValueChange={(v) => setLayers((s) => ({ ...s, [l.id]: v }))} />
            </View>
          ))}
          {layers.stops && !zoomedIn && (
            <Text style={{ color: c.muted, fontSize: 11, marginTop: 4 }}>Zoomez pour voir les arrêts.</Text>
          )}
        </View>
      )}

      {banner && (
        <View style={[styles.banner, { backgroundColor: c.card }]}>
          {selectedRouteId && (
            <View style={{ marginRight: 8 }}><RouteBadge route={routesById.get(selectedRouteId)} small /></View>
          )}
          <Text style={{ color: c.text, flex: 1, fontWeight: '600' }} numberOfLines={2}>{banner}</Text>
          {selectedRouteId && (
            <Pressable onPress={() => router.push(`/route/${encodeURIComponent(selectedRouteId)}`)} hitSlop={8}>
              <Text style={{ color: c.primary, fontWeight: '700', marginRight: 14 }}>Détails</Text>
            </Pressable>
          )}
          <Pressable onPress={() => setMapFocus(null)} hitSlop={10}>
            <Text style={{ color: c.muted, fontSize: 18 }}>✕</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const shadow = {
  shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 4,
};

const styles = StyleSheet.create({
  top: { position: 'absolute', left: 12, right: 12, flexDirection: 'row', alignItems: 'center' },
  brand: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14, ...shadow },
  layersBtn: { marginLeft: 'auto', width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', ...shadow },
  layers: { position: 'absolute', right: 12, width: 230, borderRadius: 14, padding: 12, ...shadow },
  layerRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4 },
  banner: {
    position: 'absolute', left: 12, right: 12, bottom: 16, flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 12, borderRadius: 14, ...shadow,
  },
  stop: { backgroundColor: '#fff', borderWidth: 2.5 },
  vehWrap: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  vehArrowBox: { position: 'absolute', width: 40, height: 40, alignItems: 'center' },
  vehArrow: {
    width: 0, height: 0, borderLeftWidth: 6, borderRightWidth: 6, borderBottomWidth: 8,
    borderLeftColor: 'transparent', borderRightColor: 'transparent',
  },
  veh: {
    minWidth: 28, height: 22, paddingHorizontal: 4, borderRadius: 11, alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#fff',
  },
  vehText: { fontSize: 10, fontWeight: '800' },
  bike: { paddingHorizontal: 6, paddingVertical: 3, borderRadius: 10, borderWidth: 2, borderColor: '#fff' },
  bikeText: { color: '#fff', fontSize: 11, fontWeight: '800' },
});

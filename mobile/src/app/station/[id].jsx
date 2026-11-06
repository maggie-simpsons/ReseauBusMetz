import { useEffect, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View, Pressable } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useApi } from '../../lib/api';
import { useData } from '../../lib/data';
import { useColors } from '../../lib/theme';
import { formatTime, formatWait, prettyName } from '../../lib/format';
import AlertCard from '../../components/AlertCard';
import { Chip, Empty, ErrorState, LiveDot, Loading, RouteBadge, SectionTitle } from '../../components/common';

const REFRESH_MS = 20_000;

export default function StationScreen() {
  const c = useColors();
  const { id } = useLocalSearchParams();
  const { routesById, activeAlerts, setPlan, setMapFocus } = useData();
  const { data, error, loading, reload } = useApi(`/stations/${encodeURIComponent(id)}/departures?limit=40`, REFRESH_MS);
  const [filter, setFilter] = useState(null);
  const [, tick] = useState(0);

  // Rafraîchit l'affichage des minutes restantes entre deux requêtes.
  useEffect(() => {
    const t = setInterval(() => tick((x) => x + 1), 15_000);
    return () => clearInterval(t);
  }, []);

  const station = data?.station;
  const departures = useMemo(
    () => (data?.departures || []).filter((d) => !filter || d.routeId === filter),
    [data, filter],
  );
  const stationAlerts = activeAlerts.filter(
    (a) => a.stations.includes(id) || a.routes.some((r) => station?.routes.includes(r)),
  );

  function planWith(key) {
    setPlan((p) => ({ ...p, results: null, [key]: { name: prettyName(station.name), lat: station.lat, lon: station.lon } }));
    router.navigate('/plan');
  }

  function showOnMap() {
    setMapFocus({ stationId: station.id });
    router.navigate('/');
  }

  return (
    <ScrollView
      contentContainerStyle={{ paddingBottom: 32 }}
      refreshControl={<RefreshControl refreshing={false} onRefresh={reload} tintColor={c.primary} />}
    >
      <Stack.Screen options={{ title: station ? prettyName(station.name) : 'Arrêt' }} />
      {loading && !data && <Loading />}
      {error && !data && <ErrorState error={error} onRetry={reload} />}
      {station && (
        <>
          <View style={styles.head}>
            <Text style={{ fontSize: 30 }}>🚏</Text>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={[styles.title, { color: c.text }]}>{prettyName(station.name)}</Text>
              <Text style={{ color: c.muted }}>
                {station.routes.length} ligne{station.routes.length > 1 ? 's' : ''}
                {station.wheelchair ? ' · ♿ Accessible' : ''}
              </Text>
            </View>
          </View>

          <View style={styles.wrap}>
            <Chip label="Partir d’ici" onPress={() => planWith('from')} />
            <Chip label="Aller ici" onPress={() => planWith('to')} />
            <Chip label="🗺️ Carte" onPress={showOnMap} />
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
            <Chip label="Toutes" active={!filter} onPress={() => setFilter(null)} />
            {station.routes.map((rid) => (
              <Pressable
                key={rid}
                onPress={() => setFilter(filter === rid ? null : rid)}
                onLongPress={() => router.push(`/route/${encodeURIComponent(rid)}`)}
                style={[styles.badgeBtn, { borderColor: filter === rid ? c.text : 'transparent' }]}
              >
                <RouteBadge route={routesById.get(rid)} />
              </Pressable>
            ))}
          </ScrollView>
          <Text style={[styles.hint, { color: c.muted }]}>Appui long sur une ligne pour voir son parcours</Text>

          {stationAlerts.map((a) => <AlertCard key={a.id} alert={a} routesById={routesById} />)}

          <SectionTitle>Prochains passages</SectionTitle>
          {departures.map((d) => {
            const off = d.canceled || d.skipped;
            return (
              <View key={`${d.tripId}-${d.scheduled}`} style={[styles.dep, { borderColor: c.border, backgroundColor: c.card, opacity: off ? 0.55 : 1 }]}>
                <RouteBadge route={{ shortName: d.shortName, color: d.color, textColor: d.textColor }} />
                <View style={{ flex: 1, marginHorizontal: 12 }}>
                  <Text style={{ color: c.text, fontSize: 15, fontWeight: '600', textDecorationLine: off ? 'line-through' : 'none' }} numberOfLines={1}>
                    {prettyName(d.headsign)}
                  </Text>
                  <Text style={{ color: c.muted, fontSize: 12, marginTop: 2 }}>
                    {d.canceled ? 'Supprimé' : d.skipped ? 'Arrêt non desservi' : (
                      <>
                        {formatTime(d.expected)}
                        {d.realtime && d.delay >= 60 && (
                          <Text style={{ color: c.late }}> · retard {Math.round(d.delay / 60)} min (prévu {formatTime(d.scheduled)})</Text>
                        )}
                        {d.realtime && d.delay <= -60 && <Text style={{ color: c.live }}> · en avance</Text>}
                        {!d.realtime && ' · horaire théorique'}
                      </>
                    )}
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  {d.realtime && <LiveDot />}
                  <Text style={{ color: d.realtime ? c.live : c.text, fontWeight: '800', fontSize: 15 }}>{formatWait(d.expected)}</Text>
                </View>
              </View>
            );
          })}
          {!departures.length && <Empty text="Aucun passage prévu dans les 4 prochaines heures." />}
          <View style={[styles.legend]}>
            <LiveDot />
            <Text style={{ color: c.muted, fontSize: 12 }}>Temps réel · sinon horaire théorique · actualisé toutes les 20 s</Text>
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', padding: 16 },
  title: { fontSize: 19, fontWeight: '700' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16 },
  filters: { paddingHorizontal: 16, alignItems: 'center', paddingTop: 4 },
  badgeBtn: { borderWidth: 2, borderRadius: 8, padding: 1, marginRight: 6, marginBottom: 8 },
  hint: { fontSize: 11, paddingHorizontal: 16 },
  dep: {
    flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginBottom: 8,
    padding: 12, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth,
  },
  legend: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, marginTop: 12 },
});

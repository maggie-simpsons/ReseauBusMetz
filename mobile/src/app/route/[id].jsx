import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useApi } from '../../lib/api';
import { useData } from '../../lib/data';
import { useColors } from '../../lib/theme';
import { prettyName } from '../../lib/format';
import AlertCard from '../../components/AlertCard';
import { Chip, ErrorState, LiveDot, Loading, RouteBadge } from '../../components/common';

export default function RouteScreen() {
  const c = useColors();
  const { id } = useLocalSearchParams();
  const { routesById, activeAlerts, setMapFocus } = useData();
  const detail = useApi(`/routes/${encodeURIComponent(id)}`);
  const vehicles = useApi('/vehicles', 10_000);
  const [dirIndex, setDirIndex] = useState(0);

  const route = detail.data;
  const head = route || routesById.get(id);
  const routeAlerts = activeAlerts.filter((a) => a.routes.includes(id));
  const liveCount = (vehicles.data?.vehicles || []).filter((v) => v.routeId === id).length;
  const dir = route?.directions[dirIndex] || route?.directions[0];

  function showOnMap() {
    setMapFocus({ routeId: id });
    router.navigate('/');
  }

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
      <Stack.Screen options={{ title: head ? `Ligne ${head.shortName}` : 'Ligne' }} />
      {head && (
        <View style={styles.head}>
          <RouteBadge route={head} />
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={[styles.title, { color: c.text }]}>{prettyName(head.longName)}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
              <Text style={{ color: c.muted }}>{head.category?.name} · </Text>
              <LiveDot />
              <Text style={{ color: c.muted }}>{liveCount} bus en circulation</Text>
            </View>
          </View>
        </View>
      )}

      <View style={styles.toolbar}>
        <Chip label="🗺️ Voir sur la carte" onPress={showOnMap} />
      </View>

      {routeAlerts.map((a) => <AlertCard key={a.id} alert={a} />)}

      {!route && !detail.error && <Loading />}
      {detail.error && <ErrorState error={detail.error} onRetry={detail.reload} />}

      {route && route.directions.length > 1 && (
        <View style={[styles.segmented, { backgroundColor: c.chip }]}>
          {route.directions.map((d, i) => (
            <Pressable
              key={d.direction}
              onPress={() => setDirIndex(i)}
              style={[styles.segment, i === dirIndex && { backgroundColor: c.card }]}
            >
              <Text style={{ color: c.text, fontWeight: i === dirIndex ? '700' : '500', fontSize: 13 }} numberOfLines={2}>
                → {prettyName(d.headsign)}
              </Text>
            </Pressable>
          ))}
        </View>
      )}

      {dir && (
        <View style={{ marginTop: 8 }}>
          {dir.stops.map((s, i) => {
            const first = i === 0, last = i === dir.stops.length - 1;
            const others = s.routes.length - 1;
            return (
              <Pressable
                key={`${s.id}-${i}`}
                onPress={() => router.push(`/station/${encodeURIComponent(s.id)}`)}
                style={({ pressed }) => [styles.stop, pressed && { backgroundColor: c.chip }]}
              >
                <View style={styles.rail}>
                  <View style={[styles.line, { backgroundColor: route.color, top: first ? 22 : 0, bottom: last ? 22 : 0 }]} />
                  <View style={[styles.dot, { borderColor: route.color, backgroundColor: c.card }, (first || last) && styles.dotEnd]} />
                </View>
                <Text style={{ flex: 1, color: c.text, fontSize: 15, fontWeight: first || last ? '700' : '400' }}>
                  {prettyName(s.name)}
                  {s.wheelchair && <Text style={{ color: c.muted }}> ♿</Text>}
                </Text>
                {others > 0 && <Text style={{ color: c.muted, fontSize: 12 }}>+{others} ligne{others > 1 ? 's' : ''}</Text>}
              </Pressable>
            );
          })}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', padding: 16 },
  title: { fontSize: 18, fontWeight: '700' },
  toolbar: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16 },
  segmented: { flexDirection: 'row', marginHorizontal: 16, marginTop: 8, borderRadius: 10, padding: 3 },
  segment: { flex: 1, paddingVertical: 8, paddingHorizontal: 6, borderRadius: 8, alignItems: 'center' },
  stop: { flexDirection: 'row', alignItems: 'center', paddingRight: 16, minHeight: 44 },
  rail: { width: 48, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center' },
  line: { position: 'absolute', width: 4 },
  dot: { width: 12, height: 12, borderRadius: 6, borderWidth: 3 },
  dotEnd: { width: 16, height: 16, borderRadius: 8, borderWidth: 4 },
});

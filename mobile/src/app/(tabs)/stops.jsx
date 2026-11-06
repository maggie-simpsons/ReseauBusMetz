import { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useData } from '../../lib/data';
import { useColors } from '../../lib/theme';
import { getPosition } from '../../lib/location';
import { distanceM, formatDistance, normalize, prettyName } from '../../lib/format';
import { Chip, ErrorState, Loading, RouteBadge, SearchInput } from '../../components/common';

const MAX_RESULTS = 80;

export default function StopsScreen() {
  const c = useColors();
  const { stations, routesById } = useData();
  const [query, setQuery] = useState('');
  const [position, setPosition] = useState(null);
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState(null);

  const results = useMemo(() => {
    if (!stations.data) return [];
    const q = normalize(query);
    let list = q ? stations.data.filter((s) => normalize(s.name).includes(q)) : stations.data;
    if (position) {
      list = list.map((s) => ({ ...s, dist: distanceM(position, s) })).sort((a, b) => a.dist - b.dist);
    }
    return list.slice(0, MAX_RESULTS);
  }, [stations.data, query, position]);

  async function locate() {
    setGeoError(null);
    setLocating(true);
    try {
      setPosition(await getPosition());
    } catch (e) {
      setGeoError(e.message);
    } finally {
      setLocating(false);
    }
  }

  if (stations.error && !stations.data) return <ErrorState error={stations.error} onRetry={stations.reload} />;
  if (!stations.data) return <Loading />;

  return (
    <FlatList
      data={results}
      keyExtractor={(s) => s.id}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ paddingBottom: 24 }}
      ListHeaderComponent={
        <View style={{ padding: 16, paddingBottom: 8 }}>
          <SearchInput placeholder="Rechercher un arrêt…" value={query} onChangeText={setQuery} />
          <View style={styles.toolbar}>
            {position ? (
              <Chip label="📍 Triés par distance ✕" active onPress={() => setPosition(null)} />
            ) : (
              <Chip label={locating ? '📍 Localisation…' : '📍 Arrêts autour de moi'} onPress={locate} />
            )}
            <Text style={{ color: c.muted, fontSize: 12, marginBottom: 8 }}>{stations.data.length} arrêts</Text>
          </View>
          {geoError && <Text style={{ color: c.danger }}>{geoError}</Text>}
        </View>
      }
      renderItem={({ item: s }) => (
        <Pressable
          onPress={() => router.push(`/station/${encodeURIComponent(s.id)}`)}
          style={({ pressed }) => [styles.row, { backgroundColor: pressed ? c.chip : c.card, borderColor: c.border }]}
        >
          <View style={{ flex: 1 }}>
            <Text style={{ color: c.text, fontSize: 15 }}>
              {prettyName(s.name)}
              {s.dist != null && <Text style={{ color: c.muted, fontSize: 13 }}> · {formatDistance(s.dist)}</Text>}
            </Text>
            <View style={styles.badges}>
              {s.routes.slice(0, 10).map((id) => (
                <View key={id} style={{ marginRight: 4, marginTop: 4 }}>
                  <RouteBadge route={routesById.get(id)} small />
                </View>
              ))}
              {s.routes.length > 10 && <Text style={{ color: c.muted, fontSize: 12, marginTop: 4 }}>+{s.routes.length - 10}</Text>}
            </View>
          </View>
          <Text style={{ color: c.muted, fontSize: 18 }}>›</Text>
        </Pressable>
      )}
      ListEmptyComponent={<Text style={{ color: c.muted, textAlign: 'center', padding: 24 }}>Aucun arrêt trouvé.</Text>}
    />
  );
}

const styles = StyleSheet.create({
  toolbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 },
  row: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  badges: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' },
});

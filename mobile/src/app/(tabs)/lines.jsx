import { useMemo, useState } from 'react';
import { Pressable, SectionList, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useData } from '../../lib/data';
import { useColors } from '../../lib/theme';
import { normalize, prettyName } from '../../lib/format';
import { ErrorState, Loading, RouteBadge, SearchInput, SectionTitle } from '../../components/common';

export default function LinesScreen() {
  const c = useColors();
  const { routes, activeAlerts } = useData();
  const [query, setQuery] = useState('');

  const disrupted = useMemo(() => new Set(activeAlerts.flatMap((a) => a.routes)), [activeAlerts]);

  const sections = useMemo(() => {
    if (!routes.data) return [];
    const q = normalize(query);
    const map = new Map();
    for (const r of routes.data) {
      if (q && !normalize(`${r.shortName} ${r.longName}`).includes(q)) continue;
      if (!map.has(r.category.id)) map.set(r.category.id, { ...r.category, data: [] });
      map.get(r.category.id).data.push(r);
    }
    return [...map.values()].sort((a, b) => a.order - b.order);
  }, [routes.data, query]);

  if (routes.error && !routes.data) return <ErrorState error={routes.error} onRetry={routes.reload} />;
  if (!routes.data) return <Loading />;

  return (
    <SectionList
      sections={sections}
      keyExtractor={(r) => r.id}
      keyboardShouldPersistTaps="handled"
      stickySectionHeadersEnabled={false}
      contentContainerStyle={{ paddingBottom: 24 }}
      ListHeaderComponent={
        <View style={{ padding: 16, paddingBottom: 0 }}>
          <SearchInput placeholder="Rechercher une ligne (ex. MA, L5, Woippy…)" value={query} onChangeText={setQuery} />
        </View>
      }
      renderSectionHeader={({ section }) => <SectionTitle>{section.name}</SectionTitle>}
      renderItem={({ item: r }) => (
        <Pressable
          onPress={() => router.push(`/route/${encodeURIComponent(r.id)}`)}
          style={({ pressed }) => [styles.row, { backgroundColor: pressed ? c.chip : c.card, borderColor: c.border }]}
        >
          <RouteBadge route={r} />
          <Text style={[styles.text, { color: c.text }]} numberOfLines={2}>{prettyName(r.longName)}</Text>
          {disrupted.has(r.id) && <Text style={{ color: c.warn, fontSize: 16 }}>⚠</Text>}
          <Text style={{ color: c.muted, fontSize: 18, marginLeft: 6 }}>›</Text>
        </Pressable>
      )}
      ListEmptyComponent={<Text style={{ color: c.muted, textAlign: 'center', padding: 24 }}>Aucune ligne ne correspond.</Text>}
    />
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  text: { flex: 1, marginLeft: 12, fontSize: 15 },
});

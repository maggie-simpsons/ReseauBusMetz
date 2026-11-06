import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useColors } from '../lib/theme';
import { formatDateTime } from '../lib/format';
import { RouteBadge } from './common';

export default function AlertCard({ alert, routesById }) {
  const c = useColors();
  const period = alert.periods.find((p) => p.start || p.end);
  return (
    <View style={[styles.card, { backgroundColor: c.warnBg, borderColor: c.warn, opacity: alert.active ? 1 : 0.75 }]}>
      <Text style={[styles.title, { color: c.text }]}>
        <Text style={{ color: c.warn }}>⚠ </Text>
        {alert.title || 'Perturbation'}
      </Text>
      {routesById && alert.routes.length > 0 && (
        <View style={styles.badges}>
          {alert.routes.map((id) => (
            <View key={id} style={{ marginRight: 4, marginBottom: 4 }}>
              <RouteBadge route={routesById.get(id)} small />
            </View>
          ))}
        </View>
      )}
      {!!alert.description && <Text style={{ color: c.text, marginTop: 4, lineHeight: 19 }}>{alert.description}</Text>}
      {period && (
        <Text style={{ color: c.muted, fontSize: 12, marginTop: 6 }}>
          {period.start ? `Du ${formatDateTime(period.start * 1000)}` : ''}
          {period.end ? ` au ${formatDateTime(period.end * 1000)}` : ''}
        </Text>
      )}
      {!!alert.url && (
        <Pressable onPress={() => Linking.openURL(alert.url)} hitSlop={6}>
          <Text style={{ color: c.primary, marginTop: 6, fontWeight: '600' }}>En savoir plus ›</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderLeftWidth: 4, borderRadius: 10, padding: 12, marginHorizontal: 16, marginBottom: 10 },
  title: { fontWeight: '700', fontSize: 15 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 6 },
});

import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useColors } from '../lib/theme';

export function RouteBadge({ route, small }) {
  if (!route) return null;
  return (
    <View style={[styles.badge, small && styles.badgeSm, { backgroundColor: route.color }]}>
      <Text style={[styles.badgeText, small && styles.badgeTextSm, { color: route.textColor }]} numberOfLines={1}>
        {route.shortName}
      </Text>
    </View>
  );
}

export function Loading({ text = 'Chargement…' }) {
  const c = useColors();
  return (
    <View style={styles.state}>
      <ActivityIndicator color={c.primary} />
      <Text style={{ color: c.muted, marginLeft: 8 }}>{text}</Text>
    </View>
  );
}

export function ErrorState({ error, onRetry }) {
  const c = useColors();
  return (
    <View style={[styles.state, { flexDirection: 'column' }]}>
      <Text style={{ color: c.danger, textAlign: 'center' }}>{error?.message || 'Une erreur est survenue'}</Text>
      {onRetry && (
        <Pressable onPress={onRetry} hitSlop={8}>
          <Text style={{ color: c.primary, marginTop: 8, fontWeight: '600' }}>Réessayer</Text>
        </Pressable>
      )}
    </View>
  );
}

export function Empty({ icon, text }) {
  const c = useColors();
  return (
    <View style={[styles.state, { flexDirection: 'column', paddingVertical: 40 }]}>
      {icon && <Text style={{ fontSize: 36, marginBottom: 8 }}>{icon}</Text>}
      <Text style={{ color: c.muted, textAlign: 'center' }}>{text}</Text>
    </View>
  );
}

export function LiveDot() {
  const c = useColors();
  return <View style={[styles.live, { backgroundColor: c.live }]} />;
}

export function Chip({ label, active, onPress, onLongPress, style }) {
  const c = useColors();
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => [
        styles.chip,
        { backgroundColor: active ? c.primary : c.chip, opacity: pressed ? 0.7 : 1 },
        style,
      ]}
    >
      <Text style={{ color: active ? c.primaryText : c.text, fontWeight: '600', fontSize: 13 }}>{label}</Text>
    </Pressable>
  );
}

export function PrimaryButton({ label, onPress, disabled }) {
  const c = useColors();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.primary,
        { backgroundColor: c.primary, opacity: disabled ? 0.45 : pressed ? 0.8 : 1 },
      ]}
    >
      <Text style={{ color: c.primaryText, fontWeight: '700', fontSize: 15 }}>{label}</Text>
    </Pressable>
  );
}

export function SearchInput(props) {
  const c = useColors();
  return (
    <TextInput
      placeholderTextColor={c.muted}
      clearButtonMode="while-editing"
      autoCorrect={false}
      {...props}
      style={[styles.search, { backgroundColor: c.card, color: c.text, borderColor: c.border }, props.style]}
    />
  );
}

export function SectionTitle({ children }) {
  const c = useColors();
  return <Text style={[styles.section, { color: c.muted }]}>{children}</Text>;
}

export function Card({ children, style, onPress }) {
  const c = useColors();
  const s = [styles.card, { backgroundColor: c.card, borderColor: c.border }, style];
  if (!onPress) return <View style={s}>{children}</View>;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s, pressed && { opacity: 0.75 }]}>
      {children}
    </Pressable>
  );
}

export const styles = StyleSheet.create({
  badge: { minWidth: 34, paddingHorizontal: 7, height: 26, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  badgeSm: { minWidth: 24, paddingHorizontal: 4, height: 18, borderRadius: 4 },
  badgeText: { fontWeight: '800', fontSize: 13 },
  badgeTextSm: { fontSize: 10 },
  state: { padding: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  live: { width: 7, height: 7, borderRadius: 4, marginRight: 4 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16, marginRight: 8, marginBottom: 8 },
  primary: { paddingVertical: 13, borderRadius: 10, alignItems: 'center', marginTop: 4 },
  search: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  section: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 18, marginBottom: 6, marginHorizontal: 16 },
  card: { borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, padding: 12 },
});

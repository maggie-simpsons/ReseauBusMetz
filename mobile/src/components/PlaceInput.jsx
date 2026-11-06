import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { api } from '../lib/api';
import { getPosition } from '../lib/location';
import { useColors } from '../lib/theme';
import { normalize, prettyName } from '../lib/format';

// Champ de saisie d'un lieu : arrêts du réseau + adresses (géocodage national),
// position GPS ou point choisi sur la carte.
export default function PlaceInput({ label, marker, value, onChange, stations, onPickOnMap }) {
  const c = useColors();
  const [text, setText] = useState(value?.name || '');
  const [focused, setFocused] = useState(false);
  const [addresses, setAddresses] = useState([]);
  const [geoError, setGeoError] = useState(null);
  const timer = useRef();

  useEffect(() => setText(value?.name || ''), [value]);

  useEffect(() => {
    clearTimeout(timer.current);
    if (!focused || text.trim().length < 3 || text === value?.name) {
      setAddresses([]);
      return;
    }
    timer.current = setTimeout(() => {
      api(`/geocode?q=${encodeURIComponent(text)}`).then(setAddresses).catch(() => setAddresses([]));
    }, 300);
    return () => clearTimeout(timer.current);
  }, [text, focused, value]);

  const q = normalize(text);
  const stopMatches = focused && q.length >= 2 && text !== value?.name
    ? (stations || []).filter((s) => normalize(s.name).includes(q)).slice(0, 5)
    : [];

  function choose(place) {
    onChange(place);
    setFocused(false);
    setAddresses([]);
  }

  async function locate() {
    setGeoError(null);
    try {
      choose({ name: 'Ma position', ...(await getPosition()) });
    } catch (e) {
      setGeoError(e.message);
    }
  }

  const color = marker === 'from' ? '#16a34a' : '#dc2626';
  const suggestions = [
    ...stopMatches.map((s) => ({ key: 's' + s.id, label: `🚏 ${prettyName(s.name)}`, place: { name: prettyName(s.name), lat: s.lat, lon: s.lon } })),
    ...addresses.map((a, i) => ({ key: 'a' + i, label: `📌 ${a.label}`, place: { name: a.label, lat: a.lat, lon: a.lon } })),
  ];

  return (
    <View style={{ marginBottom: 8 }}>
      <View style={styles.row}>
        <View style={[styles.marker, { backgroundColor: color }]}>
          <Text style={styles.markerText}>{marker === 'from' ? 'A' : 'B'}</Text>
        </View>
        <TextInput
          value={text}
          placeholder={label}
          placeholderTextColor={c.muted}
          autoCorrect={false}
          onChangeText={setText}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 150)}
          style={[styles.input, { backgroundColor: c.card, color: c.text, borderColor: c.border }]}
        />
        <Pressable onPress={onPickOnMap} hitSlop={6} style={[styles.icon, { backgroundColor: c.chip }]}>
          <Text>🗺️</Text>
        </Pressable>
        <Pressable onPress={locate} hitSlop={6} style={[styles.icon, { backgroundColor: c.chip }]}>
          <Text>📍</Text>
        </Pressable>
      </View>
      {geoError && <Text style={{ color: c.danger, marginLeft: 38, marginTop: 4 }}>{geoError}</Text>}
      {suggestions.length > 0 && (
        <View style={[styles.suggestions, { backgroundColor: c.card, borderColor: c.border }]}>
          {suggestions.map((s) => (
            <Pressable key={s.key} onPress={() => choose(s.place)}
              style={({ pressed }) => [styles.suggestion, { borderColor: c.border }, pressed && { backgroundColor: c.chip }]}>
              <Text style={{ color: c.text }} numberOfLines={1}>{s.label}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  marker: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', marginRight: 8 },
  markerText: { color: '#fff', fontWeight: '800' },
  input: { flex: 1, borderWidth: StyleSheet.hairlineWidth, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  icon: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginLeft: 6 },
  suggestions: { marginLeft: 34, marginTop: 4, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  suggestion: { paddingHorizontal: 12, paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth },
});

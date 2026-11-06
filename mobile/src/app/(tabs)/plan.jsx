import { useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { api } from '../../lib/api';
import { useData } from '../../lib/data';
import { useColors } from '../../lib/theme';
import { formatDelay, formatDistance, formatDuration, formatTime, parisDateTime, prettyName } from '../../lib/format';
import PlaceInput from '../../components/PlaceInput';
import { Card, Chip, ErrorState, LiveDot, Loading, PrimaryButton, RouteBadge } from '../../components/common';

const dateLabel = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export default function PlanScreen() {
  const c = useColors();
  const { plan, setPlan, stations, setMapFocus } = useData();
  const [later, setLater] = useState(false);
  const [when, setWhen] = useState(() => new Date());
  const [state, setState] = useState({ loading: false, error: null });
  const [expanded, setExpanded] = useState(0);
  const { from, to, results, selected } = plan;

  const update = (patch) => setPlan((p) => ({ ...p, results: null, ...patch }));

  function pickOnMap(key) {
    setMapFocus({ picking: key });
    router.navigate('/');
  }

  function openAndroidPicker() {
    DateTimePickerAndroid.open({
      value: when, mode: 'date', minimumDate: new Date(),
      onChange: (e, date) => {
        if (e.type !== 'set' || !date) return;
        DateTimePickerAndroid.open({
          value: date, mode: 'time', is24Hour: true,
          onChange: (e2, time) => e2.type === 'set' && time && setWhen(time),
        });
      },
    });
  }

  async function search() {
    if (!from || !to) return;
    setState({ loading: true, error: null });
    const params = [
      `from=${from.lat},${from.lon}`, `to=${to.lat},${to.lon}`,
      `fromName=${encodeURIComponent(from.name || '')}`, `toName=${encodeURIComponent(to.name || '')}`,
    ];
    if (later) {
      const dt = parisDateTime(when);
      params.push(`date=${dt.date}`, `time=${dt.time}`);
    }
    try {
      const data = await api(`/plan?${params.join('&')}`, { timeout: 30000 });
      setPlan((p) => ({ ...p, results: data.itineraries, selected: 0 }));
      setExpanded(0);
      setState({ loading: false, error: null });
    } catch (error) {
      setState({ loading: false, error });
    }
  }

  function showOnMap(it, i) {
    setPlan((p) => ({ ...p, selected: i }));
    setMapFocus({ itinerary: it });
    router.navigate('/');
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
      <PlaceInput label="Départ" marker="from" value={from} stations={stations.data}
        onChange={(v) => update({ from: v })} onPickOnMap={() => pickOnMap('from')} />
      <PlaceInput label="Arrivée" marker="to" value={to} stations={stations.data}
        onChange={(v) => update({ to: v })} onPickOnMap={() => pickOnMap('to')} />

      <View style={styles.options}>
        <Chip label="⇅ Inverser" onPress={() => update({ from: to, to: from })} />
        <Chip label="Maintenant" active={!later} onPress={() => setLater(false)} />
        <Chip label="Partir à…" active={later} onPress={() => setLater(true)} />
      </View>
      {later && (
        Platform.OS === 'ios' ? (
          <View style={{ alignItems: 'flex-start', marginBottom: 8 }}>
            <DateTimePicker value={when} mode="datetime" display="compact" locale="fr-FR"
              minimumDate={new Date()} onChange={(e, d) => d && setWhen(d)} />
          </View>
        ) : (
          <Chip label={`📅 ${dateLabel.format(when)}`} onPress={openAndroidPicker} style={{ alignSelf: 'flex-start' }} />
        )
      )}
      <PrimaryButton label="Rechercher un itinéraire" onPress={search} disabled={!from || !to || state.loading} />

      {state.loading && <Loading text="Calcul de l’itinéraire…" />}
      {state.error && <ErrorState error={state.error} />}
      {results && !results.length && (
        <Text style={{ color: c.muted, textAlign: 'center', padding: 20 }}>
          Aucun itinéraire trouvé. Essayez un autre horaire ou des points plus proches d’un arrêt.
        </Text>
      )}

      {results?.map((it, i) => (
        <Card key={i} style={[styles.it, selected === i && { borderColor: c.primary, borderWidth: 2 }]}
          onPress={() => { setPlan((p) => ({ ...p, selected: i })); setExpanded(expanded === i ? -1 : i); }}>
          <View style={styles.summary}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.times, { color: c.text }]}>{formatTime(it.start)} → {formatTime(it.end)}</Text>
              <View style={styles.chain}>
                {it.legs.map((l, j) => (
                  <View key={j} style={styles.step}>
                    {j > 0 && <Text style={{ color: c.muted, marginHorizontal: 3 }}>›</Text>}
                    {l.mode === 'walk' ? <Text>🚶</Text> : <RouteBadge route={l.route} small />}
                  </View>
                ))}
              </View>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={{ color: c.text, fontWeight: '800', fontSize: 16 }}>{formatDuration(it.duration)}</Text>
              <Text style={{ color: c.muted, fontSize: 12 }}>
                {it.walkOnly ? 'à pied' : it.transfers === 0 ? 'direct' : `${it.transfers} corresp.`}
              </Text>
            </View>
          </View>

          {expanded === i && (
            <View style={{ marginTop: 12 }}>
              {it.legs.map((l, j) => (
                <View key={j} style={styles.leg}>
                  <Text style={[styles.legTime, { color: c.text }]}>{formatTime(l.start)}</Text>
                  <View style={[styles.legBar, l.mode === 'walk'
                    ? { borderColor: c.muted, borderStyle: 'dotted', borderLeftWidth: 3 }
                    : { backgroundColor: l.route.color, width: 5 }]} />
                  <View style={{ flex: 1, paddingBottom: 14 }}>
                    <Text style={{ color: c.text, fontWeight: '700' }}>{prettyName(l.from.name)}</Text>
                    {l.mode === 'walk' ? (
                      <Text style={{ color: c.muted, fontSize: 13, marginTop: 2 }}>
                        🚶 Marcher {formatDuration(l.duration)} ({formatDistance(l.distance)}) jusqu’à {prettyName(l.to.name)}
                      </Text>
                    ) : (
                      <>
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                          <RouteBadge route={l.route} small />
                          <Text style={{ color: c.text, marginLeft: 6, flex: 1 }}>direction {prettyName(l.headsign)}</Text>
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
                          <Text style={{ color: c.muted, fontSize: 13 }}>
                            {l.stops.length - 1} arrêt{l.stops.length > 2 ? 's' : ''} · {formatDuration((l.end - l.start) / 1000)}
                            {l.delay != null ? ' · ' : ''}
                          </Text>
                          {l.delay != null && <><LiveDot /><Text style={{ color: c.muted, fontSize: 13 }}>{formatDelay(l.delay)}</Text></>}
                        </View>
                        <Text style={{ color: c.muted, fontSize: 13, marginTop: 2 }}>
                          Descendre à <Text style={{ fontWeight: '700', color: c.text }}>{prettyName(l.to.name)}</Text> ({formatTime(l.end)})
                        </Text>
                      </>
                    )}
                  </View>
                </View>
              ))}
              <View style={styles.leg}>
                <Text style={[styles.legTime, { color: c.text }]}>{formatTime(it.end)}</Text>
                <View style={{ width: 5, marginHorizontal: 10 }} />
                <Text style={{ color: c.text, fontWeight: '700', flex: 1 }}>{prettyName(it.legs[it.legs.length - 1].to.name)}</Text>
              </View>
              <Pressable onPress={() => showOnMap(it, i)} style={{ marginTop: 10 }} hitSlop={6}>
                <Text style={{ color: c.primary, fontWeight: '700' }}>🗺️ Voir sur la carte ›</Text>
              </Pressable>
            </View>
          )}
        </Card>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  options: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 4 },
  it: { marginTop: 12 },
  summary: { flexDirection: 'row', alignItems: 'center' },
  times: { fontSize: 17, fontWeight: '800' },
  chain: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', marginTop: 6 },
  step: { flexDirection: 'row', alignItems: 'center' },
  leg: { flexDirection: 'row' },
  legTime: { width: 46, fontWeight: '700', fontVariant: ['tabular-nums'] },
  legBar: { marginHorizontal: 10, borderRadius: 3 },
});

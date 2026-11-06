import { Text } from 'react-native';
import { Tabs } from 'expo-router/tabs';
import { useData } from '../../lib/data';

const icon = (emoji) => ({ focused }) => (
  <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.55 }}>{emoji}</Text>
);

export default function TabsLayout() {
  const { activeAlerts } = useData();
  return (
    <Tabs screenOptions={{ tabBarLabelStyle: { fontSize: 11, fontWeight: '600' } }}>
      <Tabs.Screen name="index" options={{ title: 'Carte', headerShown: false, tabBarIcon: icon('🗺️') }} />
      <Tabs.Screen name="lines" options={{ title: 'Lignes', tabBarIcon: icon('🚌') }} />
      <Tabs.Screen name="stops" options={{ title: 'Arrêts', tabBarIcon: icon('🚏') }} />
      <Tabs.Screen name="plan" options={{ title: 'Itinéraire', tabBarIcon: icon('🧭') }} />
      <Tabs.Screen
        name="alerts"
        options={{
          title: 'Infos trafic',
          tabBarIcon: icon('⚠️'),
          tabBarBadge: activeAlerts.length || undefined,
        }}
      />
    </Tabs>
  );
}

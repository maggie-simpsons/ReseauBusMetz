import { RefreshControl, ScrollView } from 'react-native';
import { useData } from '../../lib/data';
import { useColors } from '../../lib/theme';
import AlertCard from '../../components/AlertCard';
import { Empty, ErrorState, Loading, SectionTitle } from '../../components/common';

export default function AlertsScreen() {
  const c = useColors();
  const { alerts, routesById } = useData();

  if (alerts.error && !alerts.data) return <ErrorState error={alerts.error} onRetry={alerts.reload} />;
  if (!alerts.data) return <Loading />;

  const active = alerts.data.filter((a) => a.active);
  const upcoming = alerts.data.filter((a) => !a.active);

  return (
    <ScrollView
      contentContainerStyle={{ paddingBottom: 24 }}
      refreshControl={<RefreshControl refreshing={false} onRefresh={alerts.reload} tintColor={c.primary} />}
    >
      {!alerts.data.length && <Empty icon="✅" text="Aucune perturbation signalée sur le réseau." />}
      {active.length > 0 && <SectionTitle>En cours</SectionTitle>}
      {active.map((a) => <AlertCard key={a.id} alert={a} routesById={routesById} />)}
      {upcoming.length > 0 && <SectionTitle>À venir</SectionTitle>}
      {upcoming.map((a) => <AlertCard key={a.id} alert={a} routesById={routesById} />)}
    </ScrollView>
  );
}

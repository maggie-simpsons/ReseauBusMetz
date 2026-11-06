import { createContext, useContext, useMemo, useState } from 'react';
import { useApi } from './api';

// Données partagées par tous les écrans : lignes, arrêts, perturbations,
// état de l'itinéraire et ce que la carte doit mettre en avant.
const DataContext = createContext(null);

export function DataProvider({ children }) {
  const routes = useApi('/routes');
  const stations = useApi('/stations');
  const alerts = useApi('/alerts', 60_000);

  // Itinéraire en cours de saisie (partagé entre l'onglet Itinéraire, la carte et les arrêts).
  const [plan, setPlan] = useState({ from: null, to: null, results: null, selected: 0 });
  // Ce que la carte affiche en surbrillance : { routeId } | { stationId } | { itinerary } | null
  const [mapFocus, setMapFocus] = useState(null);

  const value = useMemo(() => {
    const routesById = new Map((routes.data || []).map((r) => [r.id, r]));
    const stationsById = new Map((stations.data || []).map((s) => [s.id, s]));
    const activeAlerts = (alerts.data || []).filter((a) => a.active);
    return {
      routes, stations, alerts, routesById, stationsById, activeAlerts,
      plan, setPlan, mapFocus, setMapFocus,
    };
  }, [routes, stations, alerts, plan, mapFocus]);

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export const useData = () => useContext(DataContext);

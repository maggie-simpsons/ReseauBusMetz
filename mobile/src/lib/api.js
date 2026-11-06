import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import Constants from 'expo-constants';

// Adresse du backend Express.
// - EXPO_PUBLIC_API_URL (ex. https://transport.example.fr) si elle est définie ;
// - sinon, en développement, la machine qui sert le bundle Expo, sur le port 3001.
function apiBase() {
  const env = process.env.EXPO_PUBLIC_API_URL;
  if (env) return env.replace(/\/+$/, '') + '/api';
  const host = Constants.expoConfig?.hostUri?.split(':')[0] || 'localhost';
  return `http://${host}:3001/api`;
}

export const API_URL = apiBase();

export async function api(path, { timeout = 15000 } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  let res;
  try {
    res = await fetch(API_URL + path, { signal: ctrl.signal });
  } catch {
    throw new Error(`Serveur injoignable (${API_URL})`);
  } finally {
    clearTimeout(timer);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Erreur ${res.status}`);
  return data;
}

// Charge une ressource de l'API, et la recharge toutes les `interval` ms si précisé
// (uniquement quand l'application est au premier plan). `path = null` désactive la requête.
export function useApi(path, interval = 0) {
  const [state, setState] = useState({ data: null, error: null, loading: !!path });
  const pathRef = useRef(path);
  pathRef.current = path;

  const load = useCallback(async () => {
    const p = pathRef.current;
    if (!p) return;
    try {
      const data = await api(p);
      if (pathRef.current === p) setState({ data, error: null, loading: false });
    } catch (error) {
      if (pathRef.current === p) setState((s) => ({ ...s, error, loading: false }));
    }
  }, []);

  useEffect(() => {
    if (!path) {
      setState({ data: null, error: null, loading: false });
      return;
    }
    setState({ data: null, error: null, loading: true });
    load();
    if (!interval) return;
    const id = setInterval(() => {
      if (AppState.currentState === 'active') load();
    }, interval);
    // Recharge dès le retour au premier plan.
    const sub = AppState.addEventListener('change', (s) => s === 'active' && load());
    return () => {
      clearInterval(id);
      sub.remove();
    };
  }, [path, interval, load]);

  return { ...state, reload: load };
}

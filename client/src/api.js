import { useCallback, useEffect, useRef, useState } from 'react';

export async function api(path) {
  const res = await fetch('/api' + path);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Erreur ${res.status}`);
  return data;
}

// Charge une ressource de l'API, et la recharge toutes les `interval` ms si précisé.
// Passer `path = null` désactive la requête.
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
      if (!document.hidden) load();
    }, interval);
    return () => clearInterval(id);
  }, [path, interval, load]);

  return { ...state, reload: load };
}

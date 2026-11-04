import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { normalize, prettyName } from '../format.js';

// Champ de saisie d'un lieu : arrêts du réseau + adresses (géocodage national).
export default function PlaceInput({ label, marker, value, onChange, stations, picking, onPick }) {
  const [text, setText] = useState(value?.name || '');
  const [open, setOpen] = useState(false);
  const [addresses, setAddresses] = useState([]);
  const timer = useRef();

  useEffect(() => setText(value?.name || ''), [value]);

  useEffect(() => {
    clearTimeout(timer.current);
    if (!open || text.trim().length < 3 || text === value?.name) {
      setAddresses([]);
      return;
    }
    timer.current = setTimeout(() => {
      api(`/geocode?q=${encodeURIComponent(text)}`).then(setAddresses).catch(() => setAddresses([]));
    }, 300);
    return () => clearTimeout(timer.current);
  }, [text, open, value]);

  const q = normalize(text);
  const stopMatches = q.length >= 2 && text !== value?.name
    ? (stations || []).filter((s) => normalize(s.name).includes(q)).slice(0, 5)
    : [];

  function choose(place) {
    onChange(place);
    setOpen(false);
  }

  function locate() {
    navigator.geolocation?.getCurrentPosition(
      (p) => choose({ name: 'Ma position', lat: p.coords.latitude, lon: p.coords.longitude }),
      () => alert('Impossible d’obtenir votre position.'),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  return (
    <div className="place">
      <span className={`place-marker place-${marker}`}>{marker === 'from' ? 'A' : 'B'}</span>
      <div className="place-field">
        <input
          type="text"
          aria-label={label}
          placeholder={label}
          value={text}
          onChange={(e) => { setText(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 200)}
        />
        {open && (stopMatches.length > 0 || addresses.length > 0 || !text) && (
          <ul className="suggestions">
            {!text && (
              <li><button onMouseDown={locate}>📍 Ma position</button></li>
            )}
            {stopMatches.map((s) => (
              <li key={s.id}>
                <button onMouseDown={() => choose({ name: prettyName(s.name), lat: s.lat, lon: s.lon })}>
                  🚏 {prettyName(s.name)}
                </button>
              </li>
            ))}
            {addresses.map((a, i) => (
              <li key={i}>
                <button onMouseDown={() => choose({ name: a.label, lat: a.lat, lon: a.lon })}>📌 {a.label}</button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <button className={`icon-btn ${picking ? 'active' : ''}`} title="Choisir sur la carte" onClick={onPick}>🗺️</button>
      <button className="icon-btn" title="Ma position" onClick={locate}>📍</button>
    </div>
  );
}

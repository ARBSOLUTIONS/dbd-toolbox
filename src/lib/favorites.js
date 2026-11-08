// Favourites are stored in your browser (localStorage) on this PC.
// They survive restarts and data refreshes. Use Export to make a backup file.
import { useCallback, useEffect, useState } from 'react';

const KEY = 'dbd-build-helper:favorites:v1';
const EMPTY = { curated: [], custom: [] };

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : EMPTY;
    return { curated: parsed.curated ?? [], custom: parsed.custom ?? [] };
  } catch {
    return EMPTY; // storage blocked or corrupt: start empty
  }
}

function save(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // storage blocked (private window): favourites only last this session
  }
}

export function useFavorites() {
  const [state, setState] = useState(load);
  useEffect(() => save(state), [state]);

  const isFavorite = useCallback(
    (id) => state.curated.includes(id) || state.custom.some((b) => b.id === id),
    [state],
  );

  const toggle = useCallback((id) => {
    setState((s) => {
      if (s.custom.some((b) => b.id === id)) return { ...s, custom: s.custom.filter((b) => b.id !== id) };
      return s.curated.includes(id)
        ? { ...s, curated: s.curated.filter((x) => x !== id) }
        : { ...s, curated: [...s.curated, id] };
    });
  }, []);

  const saveCustom = useCallback((build) => {
    setState((s) => ({ ...s, custom: [...s.custom.filter((b) => b.id !== build.id), build] }));
  }, []);

  const exportFile = useCallback(() => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `dbd-favorites-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }, [state]);

  /** Merges a previously exported file into the current favourites. */
  const importText = useCallback((text) => {
    const data = JSON.parse(text);
    if (!Array.isArray(data.curated) || !Array.isArray(data.custom)) throw new Error('Not a favourites file');
    setState((s) => ({
      curated: [...new Set([...s.curated, ...data.curated])],
      custom: [...s.custom.filter((b) => !data.custom.some((d) => d.id === b.id)), ...data.custom],
    }));
  }, []);

  return { ...state, isFavorite, toggle, saveCustom, exportFile, importText };
}

// Stores your challenges (active + history) and unlocked achievements in this
// browser (localStorage). Export/Import makes a backup file.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { buildStats, evaluateAchievements } from './achievements.js';

const KEY = 'dbd-build-helper:challenges:v1';
const EMPTY = { active: [], history: [], unlocked: {} };

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    const s = raw ? JSON.parse(raw) : EMPTY;
    return { active: s.active ?? [], history: s.history ?? [], unlocked: s.unlocked ?? {} };
  } catch {
    return EMPTY;
  }
}

function save(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* storage blocked: progress only lasts this session */
  }
}

export function useChallenges({ killerCount = 45, customBuilds = 0 } = {}) {
  const [state, setState] = useState(load);
  const [toasts, setToasts] = useState([]);
  useEffect(() => save(state), [state]);

  const stats = useMemo(() => buildStats(state.history, { killerCount, customBuilds }), [state.history, killerCount, customBuilds]);
  const achievements = useMemo(
    () => evaluateAchievements(stats).map((a) => ({ ...a, unlockedAt: state.unlocked[a.id] ?? null })),
    [stats, state.unlocked],
  );

  // Record newly unlocked achievements (with date) and show a toast.
  useEffect(() => {
    const fresh = achievements.filter((a) => a.unlocked && !state.unlocked[a.id]);
    if (!fresh.length) return;
    const now = new Date().toISOString();
    setState((s) => ({ ...s, unlocked: { ...s.unlocked, ...Object.fromEntries(fresh.map((a) => [a.id, now])) } }));
    setToasts((t) => [...t, ...fresh]);
  }, [achievements, state.unlocked]);

  const dismissToast = useCallback((id) => setToasts((t) => t.filter((a) => a.id !== id)), []);

  const accept = useCallback((challenge) => {
    setState((s) =>
      s.active.some((c) => c.id === challenge.id) || s.history.some((h) => h.challenge.id === challenge.id)
        ? s
        : { ...s, active: [challenge, ...s.active] },
    );
  }, []);

  const finish = useCallback((id, status) => {
    setState((s) => {
      const challenge = s.active.find((c) => c.id === id);
      if (!challenge) return s;
      return {
        ...s,
        active: s.active.filter((c) => c.id !== id),
        history: [{ challenge, status, finishedAt: new Date().toISOString() }, ...s.history],
      };
    });
  }, []);

  const abandon = useCallback((id) => setState((s) => ({ ...s, active: s.active.filter((c) => c.id !== id) })), []);

  const exportFile = useCallback(() => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `dbd-challenges-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }, [state]);

  const importText = useCallback((text) => {
    const d = JSON.parse(text);
    if (!Array.isArray(d.history) || !Array.isArray(d.active)) throw new Error('Not a challenges file');
    setState((s) => {
      const known = new Set(s.history.map((h) => h.challenge.id));
      return {
        active: [...s.active, ...d.active.filter((c) => !s.active.some((x) => x.id === c.id))],
        history: [...s.history, ...d.history.filter((h) => !known.has(h.challenge.id))],
        unlocked: { ...d.unlocked, ...s.unlocked },
      };
    });
  }, []);

  const isKnown = useCallback(
    (id) => state.active.some((c) => c.id === id) || state.history.find((h) => h.challenge.id === id)?.status,
    [state],
  );

  return { ...state, stats, achievements, toasts, dismissToast, accept, finish, abandon, exportFile, importText, isKnown };
}

import { useEffect } from 'react';

export default function Achievements({ store }) {
  const unlocked = store.achievements.filter((a) => a.unlocked).length;
  const sorted = [...store.achievements].sort(
    (a, b) => Number(b.unlocked) - Number(a.unlocked) || b.current / b.target - a.current / a.target,
  );
  return (
    <section>
      <p className="muted">
        {unlocked} of {store.achievements.length} unlocked. Complete challenges in the Challenges tab to earn them.
      </p>
      <div className="achievement-grid">
        {sorted.map((a) => (
          <div key={a.id} className={`card achievement ${a.unlocked ? 'unlocked' : ''}`}>
            <div className="achievement-icon">{a.unlocked ? a.icon : '🔒'}</div>
            <div className="grow">
              <h3>{a.name}</h3>
              <div className="small muted">{a.description}</div>
              <div className="progress" aria-label={`${a.current} of ${a.target}`}>
                <div style={{ width: `${(a.current / a.target) * 100}%` }} />
              </div>
              <div className="small muted">
                {a.unlocked
                  ? `Unlocked${a.unlockedAt ? ` on ${new Date(a.unlockedAt).toLocaleDateString()}` : ''}`
                  : `${a.current} / ${a.target}`}
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/** Pop-up when you unlock an achievement. Disappears after 6 seconds. */
export function AchievementToasts({ store }) {
  const first = store.toasts[0];
  const { dismissToast } = store;
  useEffect(() => {
    if (!first) return;
    const t = setTimeout(() => dismissToast(first.id), 6000);
    return () => clearTimeout(t);
  }, [first, dismissToast]);
  if (!first) return null;
  return (
    <div className="toast" role="status" onClick={() => store.dismissToast(first.id)}>
      <div className="achievement-icon">{first.icon}</div>
      <div>
        <div className="small muted">Achievement unlocked!</div>
        <strong>{first.name}</strong>
        <div className="small">{first.description}</div>
      </div>
    </div>
  );
}

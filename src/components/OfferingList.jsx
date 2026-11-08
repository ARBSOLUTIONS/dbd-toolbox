import { useMemo, useState } from 'react';
import { EntityCard, RARITY_LABEL } from './PerkCard.jsx';
import { stars } from '../lib/offeringRatings.js';

const ROLE_LABEL = { survivor: 'Survivor', killer: 'Killer', both: 'Both roles' };

// Two ways to rate: how much an offering helps you WIN, or how good it is for FARMING Bloodpoints.
const MODES = {
  win: {
    label: 'Winning',
    score: (o) => o.rating.stars,
    tiers: [
      [5, 'S tier — game changers'],
      [4, 'A tier — strong'],
      [3, 'B tier — good in the right situation'],
      [2, 'C tier — small effect'],
      [1, 'D tier — barely any effect / Bloodpoints only'],
    ],
    intro: 'Rated 1–5 stars for how much they help you win the match (not for Bloodpoints).',
  },
  bp: {
    label: 'Bloodpoint farming',
    score: (o) => o.rating.bp?.stars ?? 0,
    tiers: [
      [5, 'S tier — +100% in every category'],
      [4, 'A tier — big bonus in every category'],
      [3, 'B tier — +100% in one category, or team bonus'],
      [2, 'C tier — medium bonus'],
      [1, 'D tier — small bonus'],
    ],
    intro:
      'Rated 1–5 stars for how many extra Bloodpoints they give. Tip: Bloodpoint offerings stack, and Bloody Party Streamers boost everyone in the match.',
  },
};

function OfferingCard({ o, mode }) {
  const r = o.rating;
  const isBp = mode === 'bp';
  return (
    <EntityCard
      entity={o}
      subtitle={[RARITY_LABEL[o.rarity] ?? o.rarity, ROLE_LABEL[o.role], o.subcategory].filter(Boolean).join(' · ')}
      note={
        <>
          {/* Both ratings are always shown; the one for the chosen mode comes first. */}
          {[isBp ? 'bp' : 'win', isBp ? 'win' : 'bp'].map((m, i) => {
            const v = m === 'bp' ? r.bp?.stars ?? 0 : r.stars;
            return (
              <div key={m} className={`rating-line ${i === 0 ? 'primary' : 'secondary'}`}>
                <span className="rating-label">{m === 'bp' ? '🩸 Farming' : '🏆 Winning'}</span>
                <span className={`stars stars-${v}`} title={`${v} of 5`}>
                  {stars(v)}
                </span>
                {i === 0 && <div className="small">{m === 'bp' ? r.bp?.why : r.why}</div>}
              </div>
            );
          })}
          {r.legacy && <div className="small muted">Legacy: no longer in the Bloodweb, only if you still have some.</div>}
        </>
      }
    />
  );
}

export default function OfferingList({ offerings, initialMode = 'win' }) {
  const [role, setRole] = useState('all');
  const [view, setView] = useState('tiers');
  const [mode, setMode] = useState(initialMode);
  const [showBp, setShowBp] = useState(false);
  const M = MODES[mode];

  const shown = useMemo(
    () =>
      offerings
        .filter((o) => role === 'all' || o.role === role || o.role === 'both')
        .filter((o) => o.rating.available)
        // Winning mode hides pure Bloodpoint offerings unless asked; farming mode only shows offerings that give Bloodpoints.
        .filter((o) => (mode === 'bp' ? M.score(o) > 0 : showBp || o.rating.kind !== 'bloodpoints'))
        .sort((a, b) => M.score(b) - M.score(a) || a.name.localeCompare(b.name)),
    [offerings, role, showBp, mode, M],
  );

  const byCategory = useMemo(() => {
    const map = new Map();
    for (const o of shown) {
      const key = o.subcategory === 'All Categories' ? 'Bonus Bloodpoints (all categories)' : o.category;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(o);
    }
    return [...map.entries()];
  }, [shown]);

  const retired = offerings.filter((o) => !o.rating.available).length;

  return (
    <section>
      <div className="mode-bar" role="tablist" aria-label="Rate offerings for">
        {Object.entries(MODES).map(([id, m]) => (
          <button
            key={id}
            role="tab"
            aria-selected={mode === id}
            className={`mode-button ${mode === id ? 'active' : ''}`}
            onClick={() => setMode(id)}
          >
            <span className="mode-icon">{id === 'bp' ? '🩸' : '🏆'}</span>
            <span>
              <strong>{id === 'bp' ? 'Best for farming Bloodpoints' : 'Best for winning'}</strong>
              <span className="small muted">
                {id === 'bp' ? 'Which offerings give the most Bloodpoints' : 'Which offerings help you win the match'}
              </span>
            </span>
          </button>
        ))}
      </div>
      <div className="toolbar">
        <div className="segmented">
          {['all', 'survivor', 'killer'].map((r) => (
            <button key={r} className={role === r ? 'active' : ''} onClick={() => setRole(r)}>
              {r === 'all' ? 'All' : ROLE_LABEL[r]}
            </button>
          ))}
        </div>
        <div className="segmented">
          <button className={view === 'tiers' ? 'active' : ''} onClick={() => setView('tiers')}>
            Tier list
          </button>
          <button className={view === 'category' ? 'active' : ''} onClick={() => setView('category')}>
            By category
          </button>
        </div>
        {mode === 'win' && (
          <label className="small">
            <input type="checkbox" checked={showBp} onChange={(e) => setShowBp(e.target.checked)} /> Show Bloodpoint
            offerings
          </label>
        )}
      </div>
      <p className="muted small">
        {M.intro} {retired} retired offerings are hidden.
      </p>

      {view === 'tiers'
        ? M.tiers.map(([n, label]) => {
            const list = shown.filter((o) => M.score(o) === n);
            return list.length ? (
              <div key={n}>
                <h3 className={`section-title tier tier-${n}`}>{label}</h3>
                <div className="grid">
                  {list.map((o) => (
                    <OfferingCard key={o.id} o={o} mode={mode} />
                  ))}
                </div>
              </div>
            ) : null;
          })
        : byCategory.map(([category, list]) => (
            <div key={category}>
              <h3 className="section-title">{category}</h3>
              <div className="grid">
                {list.map((o) => (
                  <OfferingCard key={o.id} o={o} mode={mode} />
                ))}
              </div>
            </div>
          ))}
    </section>
  );
}

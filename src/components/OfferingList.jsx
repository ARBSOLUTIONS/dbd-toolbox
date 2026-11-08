import { useMemo, useState } from 'react';
import { EntityCard, RARITY_LABEL } from './PerkCard.jsx';
import { KIND_LABEL, stars } from '../lib/offeringRatings.js';

const ROLE_LABEL = { survivor: 'Survivor', killer: 'Killer', both: 'Both roles' };
const TIERS = [
  [5, 'S tier — game changers'],
  [4, 'A tier — strong'],
  [3, 'B tier — good in the right situation'],
  [2, 'C tier — small effect'],
  [1, 'D tier — barely any effect / Bloodpoints only'],
];

function OfferingCard({ o }) {
  const r = o.rating;
  return (
    <EntityCard
      entity={o}
      subtitle={[RARITY_LABEL[o.rarity] ?? o.rarity, ROLE_LABEL[o.role], o.subcategory].filter(Boolean).join(' · ')}
      note={
        <>
          <span className={`stars stars-${r.stars}`} title={`${r.stars} of 5`}>
            {stars(r.stars)}
          </span>{' '}
          <span className={`badge kind-${r.kind}`}>{KIND_LABEL[r.kind]}</span>
          <div className="small">{r.why}</div>
        </>
      }
    />
  );
}

export default function OfferingList({ offerings }) {
  const [role, setRole] = useState('all');
  const [view, setView] = useState('tiers');
  const [showBp, setShowBp] = useState(false);

  const shown = useMemo(
    () =>
      offerings
        .filter((o) => role === 'all' || o.role === role || o.role === 'both')
        .filter((o) => o.rating.available)
        .filter((o) => showBp || o.rating.kind !== 'bloodpoints')
        .sort((a, b) => b.rating.stars - a.rating.stars || a.name.localeCompare(b.name)),
    [offerings, role, showBp],
  );

  const byCategory = useMemo(() => {
    const map = new Map();
    for (const o of shown) {
      if (!map.has(o.category)) map.set(o.category, []);
      map.get(o.category).push(o);
    }
    return [...map.entries()];
  }, [shown]);

  const retired = offerings.filter((o) => !o.rating.available).length;

  return (
    <section>
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
        <label className="small">
          <input type="checkbox" checked={showBp} onChange={(e) => setShowBp(e.target.checked)} /> Show Bloodpoint
          offerings
        </label>
      </div>
      <p className="muted small">
        Rated 1–5 stars for how much they help you <strong>win</strong> (not for Bloodpoints). {retired} retired
        offerings are hidden.
      </p>

      {view === 'tiers'
        ? TIERS.map(([n, label]) => {
            const list = shown.filter((o) => o.rating.stars === n);
            return list.length ? (
              <div key={n}>
                <h3 className={`section-title tier tier-${n}`}>{label}</h3>
                <div className="grid">
                  {list.map((o) => (
                    <OfferingCard key={o.id} o={o} />
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
                  <OfferingCard key={o.id} o={o} />
                ))}
              </div>
            </div>
          ))}
    </section>
  );
}

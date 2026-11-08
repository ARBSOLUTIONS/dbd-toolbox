import { useMemo, useState } from 'react';
import PerkCard from './PerkCard.jsx';
import { makeQuery } from '../lib/search.js';

export default function PerkList({ perks }) {
  const [role, setRole] = useState('all');
  const [query, setQuery] = useState('');

  const shown = useMemo(() => {
    const q = makeQuery(query);
    // Best name matches first; then character and description hits.
    const rank = (p) =>
      Math.min(q.rank(p.name), q.rank(p.character ?? '') + 3, q.matches(p.description, { fuzzy: false }) ? 6 : Infinity);
    return perks
      .filter((p) => role === 'all' || p.role === role)
      .map((p) => [p, q.empty ? 0 : rank(p)])
      .filter(([, r]) => r !== Infinity)
      .sort(([a, ra], [b, rb]) => ra - rb || a.name.localeCompare(b.name))
      .map(([p]) => p);
  }, [perks, role, query]);

  return (
    <section>
      <div className="toolbar">
        <div className="segmented">
          {['all', 'survivor', 'killer'].map((r) => (
            <button key={r} className={role === r ? 'active' : ''} onClick={() => setRole(r)}>
              {r[0].toUpperCase() + r.slice(1)}
            </button>
          ))}
        </div>
        <input
          type="search"
          placeholder="Search perks, characters or effects (e.g. “exhausted”)…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <span className="muted small">{shown.length} perks</span>
      </div>
      <div className="grid">
        {shown.map((p) => (
          <PerkCard key={p.id} perk={p} />
        ))}
      </div>
    </section>
  );
}

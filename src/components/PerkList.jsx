import { useMemo, useState } from 'react';
import PerkCard from './PerkCard.jsx';

export default function PerkList({ perks }) {
  const [role, setRole] = useState('all');
  const [query, setQuery] = useState('');

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return perks
      .filter((p) => role === 'all' || p.role === role)
      .filter(
        (p) =>
          !q ||
          p.name.toLowerCase().includes(q) ||
          (p.character ?? '').toLowerCase().includes(q) ||
          p.description.toLowerCase().includes(q),
      )
      .sort((a, b) => a.name.localeCompare(b.name));
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

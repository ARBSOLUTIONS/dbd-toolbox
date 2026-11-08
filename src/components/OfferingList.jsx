import { useMemo, useState } from 'react';
import { EntityCard, RARITY_LABEL } from './PerkCard.jsx';

const ROLE_LABEL = { survivor: 'Survivor', killer: 'Killer', both: 'Both roles' };

export default function OfferingList({ offerings }) {
  const [role, setRole] = useState('all');

  const groups = useMemo(() => {
    const map = new Map();
    for (const o of offerings) {
      if (role !== 'all' && o.role !== role && o.role !== 'both') continue;
      if (!map.has(o.category)) map.set(o.category, []);
      map.get(o.category).push(o);
    }
    return [...map.entries()];
  }, [offerings, role]);

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
      </div>
      {groups.map(([category, list]) => (
        <div key={category}>
          <h3 className="section-title">{category}</h3>
          <div className="grid">
            {list.map((o) => (
              <EntityCard
                key={o.id}
                entity={o}
                subtitle={[RARITY_LABEL[o.rarity] ?? o.rarity, ROLE_LABEL[o.role], o.subcategory]
                  .filter(Boolean)
                  .join(' · ')}
              />
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}

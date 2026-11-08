import { useMemo, useState } from 'react';
import BuildCard from './BuildCard.jsx';
import { PLAYSTYLES } from '../lib/tags.js';
import { makeQuery } from '../lib/search.js';

export default function BuildList({ builds, killers, favorites, initial = {} }) {
  const [role, setRole] = useState(initial.role ?? 'survivor');
  const [type, setType] = useState(initial.type ?? 'all');
  const [killer, setKiller] = useState('all');
  const [styles, setStyles] = useState([]);
  const [query, setQuery] = useState('');
  const [onlyNew, setOnlyNew] = useState(false);
  const [showStyles, setShowStyles] = useState(false);
  const anyNew = builds.some((b) => b.newPerks?.length);

  const toggleStyle = (s) => setStyles(styles.includes(s) ? styles.filter((x) => x !== s) : [...styles, s]);
  const changeRole = (r) => {
    setRole(r);
    setStyles([]);
    setKiller('all');
  };

  const shown = useMemo(() => {
    const q = makeQuery(query);
    return builds
      .filter((b) => b.role === role)
      .filter((b) => type === 'all' || b.type === type)
      // "New perks" filter: only builds that use perks added in the latest patch.
      .filter((b) => !onlyNew || b.newPerks?.length)
      // "Any killer" builds are shown for every killer.
      .filter((b) => role !== 'killer' || killer === 'all' || !b.killer || b.killer === killer)
      .filter((b) => !styles.length || styles.some((s) => b.playstyles.includes(s)))
      .filter(
        (b) =>
          q.empty ||
          q.matches(b.name) ||
          b.perks.some((p) => q.matches(p)) ||
          q.matches(b.item ?? '') ||
          q.matches(b.killer ?? ''),
      )
      .sort((a, b) => b.rating.score - a.rating.score);
  }, [builds, role, type, killer, styles, query, onlyNew]);

  return (
    <section>
      <div className="toolbar">
        <div className="segmented">
          {['survivor', 'killer'].map((r) => (
            <button key={r} className={role === r ? 'active' : ''} onClick={() => changeRole(r)}>
              {r === 'survivor' ? 'Survivor' : 'Killer'}
            </button>
          ))}
        </div>
        <div className="segmented">
          {[
            ['all', 'All'],
            ['beginner', '🌱 Beginner'],
            ['meta', 'Strong / meta'],
            ['fun', 'Fun'],
            ['auto', 'Auto'],
          ].map(([id, label]) => (
            <button key={id} className={type === id ? 'active' : ''} onClick={() => setType(id)}>
              {label}
            </button>
          ))}
        </div>
        {role === 'killer' && (
          <select value={killer} onChange={(e) => setKiller(e.target.value)}>
            <option value="all">All killers</option>
            {killers.map((k) => (
              <option key={k.id} value={k.name}>
                {k.name}
              </option>
            ))}
          </select>
        )}
        <input
          type="search"
          placeholder="Search by build name, perk or item…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div className="list-meta">
        <span className="muted small">
          {shown.length} build{shown.length === 1 ? '' : 's'} · best score first
        </span>
        <button className={`chip ${styles.length ? 'active' : ''}`} onClick={() => setShowStyles(!showStyles)}>
          Playstyle{styles.length ? ` (${styles.length})` : ''} {showStyles ? '▴' : '▾'}
        </button>
        {anyNew && (
          <button className={`chip chip-new ${onlyNew ? 'active' : ''}`} onClick={() => setOnlyNew(!onlyNew)}>
            ✨ Uses new perks
          </button>
        )}
      </div>
      {showStyles && (
        <div className="chips">
          {Object.entries(PLAYSTYLES[role]).map(([id, label]) => (
            <button key={id} className={`chip ${styles.includes(id) ? 'active' : ''}`} onClick={() => toggleStyle(id)}>
              {label}
            </button>
          ))}
          {styles.length > 0 && (
            <button className="link-button small" onClick={() => setStyles([])}>
              Clear
            </button>
          )}
        </div>
      )}

      {shown.length ? (
        <div className="build-grid">
          {shown.map((b) => (
            <BuildCard key={b.id} build={b} favorites={favorites} />
          ))}
        </div>
      ) : (
        <p className="muted">
          No builds match these filters{role === 'killer' && killer !== 'all' ? ` for ${killer} yet` : ''}.
        </p>
      )}
    </section>
  );
}

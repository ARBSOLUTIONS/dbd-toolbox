import { useMemo, useState } from 'react';
import PerkCard from './PerkCard.jsx';
import { makeQuery } from '../lib/search.js';
import { iconSrc } from '../lib/format.js';
import { PERK_VERDICTS } from '../lib/nlStats.js';

// Perks without NightLight numbers always go last.
const SORTS = {
  name: { label: 'Name', fn: null },
  usage: { label: 'Most used', fn: (a, b) => (b.nl?.usage ?? -1) - (a.nl?.usage ?? -1) },
  rate: { label: 'Best kill / escape rate', fn: (a, b) => (b.nl?.rate ?? -1) - (a.nl?.rate ?? -1) },
  delta: {
    label: 'Most above average',
    fn: (a, b) => (b.nl && b.nl.verdict !== 'few' ? b.nl.delta : -99) - (a.nl && a.nl.verdict !== 'few' ? a.nl.delta : -99),
  },
  worst: {
    label: 'Most below average',
    fn: (a, b) => (a.nl && a.nl.verdict !== 'few' ? a.nl.delta : 99) - (b.nl && b.nl.verdict !== 'few' ? b.nl.delta : 99),
  },
};

const fmt = (v) => (v == null ? '–' : `${v.toFixed(1)}%`);

/** All perks with their NightLight numbers in one sortable table. */
function PerkStatsTable({ perks, sort, setSort }) {
  const head = (id, label) => (
    <th>
      <button className={`link-button ${sort === id ? 'active' : ''}`} onClick={() => setSort(id)}>
        {label}
        {sort === id ? ' ▾' : ''}
      </button>
    </th>
  );
  return (
    <div className="table-scroll">
      <table className="stats-table perk-table">
        <thead>
          <tr>
            {head('name', 'Perk')}
            <th>Role</th>
            {head('usage', 'Used in')}
            <th>Games</th>
            {head('rate', 'Kill / escape rate')}
            {head('delta', 'vs average')}
            <th>Verdict</th>
          </tr>
        </thead>
        <tbody>
          {perks.map((p) => {
            const nl = p.nl;
            const v = nl ? PERK_VERDICTS[nl.verdict] : null;
            return (
              <tr key={p.id} className={nl ? `verdict-${nl.verdict}` : ''}>
                <td>
                  <img src={iconSrc(p.icon)} alt="" loading="lazy" />
                  {p.name}
                </td>
                <td className="muted">{p.role === 'killer' ? 'Killer' : 'Survivor'}</td>
                <td>{fmt(nl?.usage)}</td>
                <td>{nl?.count?.toLocaleString() ?? '–'}</td>
                <td>{fmt(nl?.rate)}</td>
                <td className={nl?.delta == null ? '' : nl.delta >= 0 ? 'good' : 'bad'}>
                  {nl?.delta == null ? '–' : `${nl.delta >= 0 ? '+' : ''}${nl.delta.toFixed(1)}`}
                </td>
                <td className="perk-verdict">{v ? `${v.short} ${v.label}` : 'No data'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function PerkList({ perks, stats = null }) {
  const [role, setRole] = useState('all');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('name');
  const [verdict, setVerdict] = useState('all');
  const [view, setView] = useState('cards');
  const hasStats = perks.some((p) => p.nl);

  const shown = useMemo(() => {
    const q = makeQuery(query);
    // Best name matches first; then character and description hits.
    const rank = (p) =>
      Math.min(q.rank(p.name), q.rank(p.character ?? '') + 3, q.matches(p.description, { fuzzy: false }) ? 6 : Infinity);
    const sortFn = SORTS[sort].fn;
    return perks
      .filter((p) => role === 'all' || p.role === role)
      .filter((p) => verdict === 'all' || (verdict === 'none' ? !p.nl : p.nl?.verdict === verdict))
      .map((p) => [p, q.empty ? 0 : rank(p)])
      .filter(([, r]) => r !== Infinity)
      .sort(([a, ra], [b, rb]) => ra - rb || (sortFn ? sortFn(a, b) : 0) || a.name.localeCompare(b.name))
      .map(([p]) => p);
  }, [perks, role, query, sort, verdict]);

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

      {hasStats && (
        <div className="toolbar perk-stats-toolbar">
          <div className="segmented">
            {[
              ['cards', 'Cards'],
              ['table', 'Stats table'],
            ].map(([id, label]) => (
              <button key={id} className={view === id ? 'active' : ''} onClick={() => setView(id)}>
                {label}
              </button>
            ))}
          </div>
          <label>
            Sort:{' '}
            <select value={sort} onChange={(e) => setSort(e.target.value)}>
              {Object.entries(SORTS).map(([id, s]) => (
                <option key={id} value={id}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Show:{' '}
            <select value={verdict} onChange={(e) => setVerdict(e.target.value)}>
              <option value="all">All perks</option>
              {Object.entries(PERK_VERDICTS).map(([id, v]) => (
                <option key={id} value={id}>
                  {v.short} {v.label}
                </option>
              ))}
              <option value="none">No NightLight data</option>
            </select>
          </label>
          <p className="muted small">
            Community stats from matches uploaded to{' '}
            <a href={stats?.source?.url ?? 'https://nightlight.gg'} target="_blank" rel="noreferrer">
              NightLight.gg
            </a>{' '}
            (last 28 days). “Above / below average” compares a perk’s kill or escape rate with the average perk of
            its role ({stats?.perkAverage?.killer ?? '?'}% kill, {stats?.perkAverage?.survivor ?? '?'}% escape); under{' '}
            100 games is too few to judge. Popular perks are not always the strongest: a guide, not official numbers.
          </p>
        </div>
      )}

      {view === 'table' && hasStats ? (
        <PerkStatsTable perks={shown} sort={sort} setSort={setSort} />
      ) : (
        <div className="grid">
          {shown.map((p) => (
            <PerkCard key={p.id} perk={p} />
          ))}
        </div>
      )}
    </section>
  );
}

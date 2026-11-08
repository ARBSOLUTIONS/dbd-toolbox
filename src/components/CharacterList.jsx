import { useState } from 'react';
import PerkCard, { EntityCard, RARITY_LABEL, sortByRarity } from './PerkCard.jsx';
import { iconSrc } from '../lib/format.js';

const SORTS = {
  release: { label: 'Release order', fn: null },
  name: { label: 'A–Z', fn: (a, b) => a.name.replace(/^The /, '').localeCompare(b.name.replace(/^The /, '')) },
  pick: { label: 'Pick rate', fn: (a, b, s) => (s[b.id]?.pickRate ?? -1) - (s[a.id]?.pickRate ?? -1) },
  kill: { label: 'Kill rate', fn: (a, b, s) => (s[b.id]?.killRate ?? -1) - (s[a.id]?.killRate ?? -1) },
};

const fmt = (v, digits = 1) => (v == null ? '–' : `${v.toFixed(digits)}%`);
const day = (iso) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : '?');

/** Pick rate, kill rate and kill distribution for one killer (NightLight data). */
function KillerStats({ entry, stats }) {
  if (!entry) return <p className="muted small">No community stats for this killer yet.</p>;
  const avg = stats.average;
  const diff = entry.killRate != null && avg?.killRate != null ? entry.killRate - avg.killRate : null;
  return (
    <div className="killer-stats">
      <div className="stat-row">
        <div className="stat">
          <span className="stat-value">{fmt(entry.pickRate, 2)}</span>
          <span className="stat-label">Pick rate</span>
        </div>
        <div className="stat">
          <span className="stat-value">{fmt(entry.killRate)}</span>
          <span className="stat-label">
            Kill rate
            {diff != null && (
              <span className={diff >= 0 ? 'good' : 'bad'}> ({diff >= 0 ? '+' : ''}{diff.toFixed(1)} vs avg)</span>
            )}
          </span>
        </div>
        <div className="stat">
          <span className="stat-value">{entry.matches?.toLocaleString() ?? '–'}</span>
          <span className="stat-label">Games</span>
        </div>
      </div>
      <div className="kill-dist" aria-label="Kill distribution">
        {entry.kills.map((v, n) => (
          <div key={n} className="kill-col" title={`${n} kills: ${fmt(v)}`}>
            <div className="kill-bar-wrap">
              <div className="kill-bar" style={{ height: `${Math.min(100, (v ?? 0) * 2)}%` }} />
            </div>
            <span className="small">{fmt(v, 0)}</span>
            <span className="small muted">{n}K</span>
          </div>
        ))}
      </div>
      {entry.matches != null && entry.matches < 150 && (
        <p className="muted small">Small sample: treat these numbers as a rough guide.</p>
      )}
    </div>
  );
}

function StatsCredit({ stats }) {
  return (
    <p className="muted small">
      Stats: {stats.games?.toLocaleString()} games from {day(stats.period.start)} – {day(stats.period.end)}, from{' '}
      <a href={stats.source.url} target="_blank" rel="noreferrer">
        NightLight.gg
      </a>{' '}
      (matches uploaded by players, not official numbers).
    </p>
  );
}

/**
 * Grid of character portraits (killers or survivors). Clicking one shows its
 * unique perks and, for killers, its power add-ons and community stats.
 */
export default function CharacterList({ characters, perksById, addons = [], stats = null }) {
  const [selected, setSelected] = useState(null);
  const [sort, setSort] = useState('release');
  const character = characters.find((c) => c.id === selected);
  const charAddons = character
    ? sortByRarity(addons.filter((a) => a.killer === character.name))
    : [];
  const power = charAddons[0]?.power;
  const byId = stats?.killers ?? {};
  const sortFn = SORTS[sort].fn;
  const shown = sortFn ? [...characters].sort((a, b) => sortFn(a, b, byId)) : characters;

  return (
    <section>
      {stats && (
        <div className="toolbar">
          <label>
            Sort:{' '}
            <select value={sort} onChange={(e) => setSort(e.target.value)}>
              {Object.entries(SORTS).map(([k, s]) => (
                <option key={k} value={k}>{s.label}</option>
              ))}
            </select>
          </label>
          <StatsCredit stats={stats} />
        </div>
      )}
      <div className="killer-grid">
        {shown.map((c) => (
          <button
            key={c.id}
            className={`killer-tile ${c.id === selected ? 'active' : ''}`}
            onClick={() => setSelected(c.id === selected ? null : c.id)}
          >
            <img src={iconSrc(c.portrait)} alt="" loading="lazy" />
            <span>{c.name.replace(/^The /, '')}</span>
            {stats && byId[c.id] && (
              <span className="tile-stat small muted">
                {sort === 'pick' ? `${fmt(byId[c.id].pickRate, 2)} picks` : `${fmt(byId[c.id].killRate)} kills`}
              </span>
            )}
          </button>
        ))}
      </div>

      {character && (
        <div className="killer-detail">
          <h2>
            {character.name}{' '}
            <a className="small" href={character.wikiUrl} target="_blank" rel="noreferrer">
              wiki ↗
            </a>
          </h2>
          {power && <p className="muted">Power: {power}</p>}

          {stats && (
            <>
              <h3 className="section-title">Community stats (last 28 days)</h3>
              <KillerStats entry={byId[character.id]} stats={stats} />
            </>
          )}

          <h3 className="section-title">Unique perks</h3>
          <div className="grid">
            {character.perks.map((id) => perksById[id] && <PerkCard key={id} perk={perksById[id]} />)}
          </div>

          {charAddons.length > 0 && (
            <>
              <h3 className="section-title">Add-ons ({charAddons.length})</h3>
              <div className="grid">
                {charAddons.map((a) => (
                  <EntityCard key={a.id} entity={a} subtitle={RARITY_LABEL[a.rarity] ?? a.rarity} />
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}

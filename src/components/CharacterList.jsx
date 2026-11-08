import { useState } from 'react';
import PerkCard, { EntityCard, RARITY_LABEL, sortByRarity } from './PerkCard.jsx';
import { iconSrc } from '../lib/format.js';
import { baselineRate, periodLabel, MIN_SAMPLES } from '../lib/nlStats.js';

const fmt = (v, digits = 1) => (v == null ? '–' : `${v.toFixed(digits)}%`);

function sorts(role) {
  const rate = role === 'killer' ? 'killRate' : 'escapeRate';
  return {
    release: { label: 'Release order', fn: null },
    name: { label: 'A–Z', fn: (a, b) => a.name.replace(/^The /, '').localeCompare(b.name.replace(/^The /, '')) },
    pick: { label: 'Pick rate', fn: (a, b, s) => (s[b.id]?.pickRate ?? -1) - (s[a.id]?.pickRate ?? -1) },
    rate: {
      label: role === 'killer' ? 'Kill rate' : 'Escape rate',
      fn: (a, b, s) => (s[b.id]?.[rate] ?? -1) - (s[a.id]?.[rate] ?? -1),
    },
  };
}

/** Pick rate, kill/escape rate and (killers) kill distribution for one character. */
function CharacterStats({ entry, stats, role }) {
  if (!entry) return <p className="muted small">No community stats for this character yet.</p>;
  const rate = role === 'killer' ? entry.killRate : entry.escapeRate;
  const avg = baselineRate(stats, role);
  const diff = rate != null && avg != null ? rate - avg : null;
  return (
    <div className="killer-stats">
      <div className="stat-row">
        <div className="stat">
          <span className="stat-value">{fmt(entry.pickRate, 2)}</span>
          <span className="stat-label">Pick rate</span>
        </div>
        <div className="stat">
          <span className="stat-value">{fmt(rate)}</span>
          <span className="stat-label">
            {role === 'killer' ? 'Kill rate' : 'Escape rate'}
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
      {entry.kills && (
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
      )}
      {entry.matches != null && entry.matches < 150 && (
        <p className="muted small">Small sample: treat these numbers as a rough guide.</p>
      )}
    </div>
  );
}

/** The character's most used perks and builds on NightLight. */
function TopUsage({ entry, perksById, role }) {
  const label = role === 'killer' ? 'kill rate' : 'escape rate';
  const topPerks = (entry?.topPerks ?? []).slice(0, 10);
  const topBuilds = (entry?.topBuilds ?? []).filter((b) => b.samples >= MIN_SAMPLES / (role === 'killer' ? 1 : 4)).slice(0, 5);
  if (!topPerks.length && !topBuilds.length) return null;
  const perkName = (id) => perksById[id]?.name ?? id;
  return (
    <div className="top-usage">
      {topPerks.length > 0 && (
        <div>
          <h4>Most used perks{entry.since ? ` (since ${entry.since})` : ''}</h4>
          <table className="stats-table">
            <thead>
              <tr>
                <th>Perk</th>
                <th>Used</th>
                <th>{label}</th>
              </tr>
            </thead>
            <tbody>
              {topPerks.map((p) => (
                <tr key={p.perk}>
                  <td>
                    {perksById[p.perk] && <img src={iconSrc(perksById[p.perk].icon)} alt="" loading="lazy" />}
                    {perkName(p.perk)}
                  </td>
                  <td>{fmt(p.usage)}</td>
                  <td>{fmt(p.rate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {topBuilds.length > 0 && (
        <div>
          <h4>Most used builds</h4>
          <table className="stats-table">
            <thead>
              <tr>
                <th>Build</th>
                <th>Used</th>
                <th>{label}</th>
              </tr>
            </thead>
            <tbody>
              {topBuilds.map((b) => (
                <tr key={b.perks.join('|')}>
                  <td className="build-perks">
                    {b.perks.map((id) =>
                      perksById[id] ? (
                        <img key={id} src={iconSrc(perksById[id].icon)} alt={perkName(id)} title={perkName(id)} loading="lazy" />
                      ) : (
                        <span key={id}>{id}</span>
                      ),
                    )}
                  </td>
                  <td>{fmt(b.usage)}</td>
                  <td title={`${b.wins}/${b.samples}`}>{fmt(b.rate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function StatsCredit({ stats }) {
  return (
    <p className="muted small">
      Stats: {stats.games?.toLocaleString()} killer games, {periodLabel(stats)}, from{' '}
      <a href={stats.source.url} target="_blank" rel="noreferrer">
        NightLight.gg
      </a>{' '}
      (matches uploaded by players, not official numbers).
    </p>
  );
}

/**
 * Grid of character portraits (killers or survivors). Clicking one shows its
 * unique perks, for killers its power add-ons, and community stats.
 */
export default function CharacterList({ characters, perksById, addons = [], stats = null, role = 'killer' }) {
  const [selected, setSelected] = useState(null);
  const [sort, setSort] = useState('release');
  const character = characters.find((c) => c.id === selected);
  const charAddons = character
    ? sortByRarity(addons.filter((a) => a.killer === character.name))
    : [];
  const power = charAddons[0]?.power;
  const byId = (role === 'killer' ? stats?.killers : stats?.survivors) ?? {};
  const hasStats = Object.keys(byId).length > 0;
  const SORTS = sorts(role);
  const sortFn = SORTS[sort].fn;
  const shown = sortFn ? [...characters].sort((a, b) => sortFn(a, b, byId)) : characters;
  const tileRate = (s) => (role === 'killer' ? `${fmt(s.killRate)} kills` : `${fmt(s.escapeRate)} escapes`);

  return (
    <section>
      {hasStats && (
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
            <span>{role === 'killer' ? c.name.replace(/^The /, '') : c.name}</span>
            {byId[c.id] && (
              <span className="tile-stat small muted">
                {sort === 'pick' ? `${fmt(byId[c.id].pickRate, 2)} picks` : tileRate(byId[c.id])}
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

          {hasStats && (
            <>
              <h3 className="section-title">Community stats (last 28 days)</h3>
              <CharacterStats entry={byId[character.id]} stats={stats} role={role} />
              <TopUsage entry={byId[character.id]} perksById={perksById} role={role} />
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

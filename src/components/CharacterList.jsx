import { useEffect, useRef, useState } from 'react';
import { EntityCard, PerkText, RARITY_LABEL, sortByRarity } from './PerkCard.jsx';
import { iconSrc } from '../lib/format.js';
import { baselineRate, periodLabel, MIN_SAMPLES } from '../lib/nlStats.js';
import { PLAYSTYLES } from '../lib/tags.js';

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

const list = (words) => (words.length < 2 ? words.join('') : `${words.slice(0, -1).join(', ')} and ${words.at(-1)}`);

/**
 * A few plain facts about how a character plays, worked out from the data:
 * what their unique perks do, how they do in community stats, and which
 * build this site rates highest for them.
 */
function glance({ character, role, perks, entry, byId, stats, best }) {
  const out = [];
  const counts = {};
  for (const p of perks) for (const t of p.tags ?? []) counts[t] = (counts[t] ?? 0) + 1;
  const tags = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([t]) => (PLAYSTYLES[role]?.[t] ?? t).toLowerCase());
  if (tags.length) out.push(`${character.name}'s unique perks are about ${list(tags)}.`);
  const key = role === 'killer' ? 'killRate' : 'escapeRate';
  const rate = entry?.[key];
  const avg = baselineRate(stats, role);
  if (rate != null && avg != null && (entry.matches ?? 0) >= 150) {
    const ranked = Object.values(byId)
      .filter((e) => e[key] != null && (e.matches ?? 0) >= 150)
      .sort((a, b) => b[key] - a[key]);
    const place = ranked.indexOf(entry) + 1;
    const diff = rate - avg;
    const strength = Math.abs(diff) < 1 ? 'about average' : diff > 0 ? 'above average' : 'below average';
    out.push(
      `${role === 'killer' ? 'Kill' : 'Escape'} rate ${rate.toFixed(1)}% in community matches this patch: ${strength}${place ? `, #${place} of ${ranked.length}` : ''}.`,
    );
  }
  if (entry?.pickRate != null) {
    const byPick = Object.values(byId)
      .filter((e) => e.pickRate != null)
      .sort((a, b) => b.pickRate - a.pickRate);
    const place = byPick.indexOf(entry) + 1;
    if (place) out.push(`#${place} most played of ${byPick.length} (${entry.pickRate.toFixed(2)}% of games).`);
  }
  if (best) out.push(`Highest rated build on this site ${role === 'killer' ? 'for them' : 'with their perks'}: ${best.name} (${best.rating.score}/100).`);
  return out;
}

/** Pop-up with everything about one killer or survivor. */
function CharacterModal({ character, role, perksById, addons, stats, byId, builds, onShowBuild, onClose }) {
  const closeRef = useRef(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e) => {
      // A build pop-up opened from here sits on top and closes first.
      if (e.key === 'Escape' && document.querySelectorAll('.modal-backdrop').length < 2) onClose();
    };
    window.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

  const perks = (character.perks ?? []).map((id) => perksById[id]).filter(Boolean);
  const charAddons = role === 'killer' ? sortByRarity(addons.filter((a) => a.killer === character.name)) : [];
  const power = charAddons[0]?.power;
  const entry = byId[character.id];
  const own = new Set(character.perks ?? []);
  const related = builds
    .filter((b) =>
      role === 'killer'
        ? b.killer === character.name
        : b.role === 'survivor' && b.resolved?.perks?.some((p) => p && own.has(p.id)),
    )
    .sort((a, b) => b.rating.score - a.rating.score)
    .slice(0, 4);
  const facts = glance({ character, role, perks, entry, byId, stats, best: related[0] });

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal char-modal"
        role="dialog"
        aria-modal="true"
        aria-label={character.name}
        onClick={(e) => e.stopPropagation()}
      >
        <button ref={closeRef} className="modal-close" onClick={onClose} aria-label="Close">
          ✕
        </button>
        <header className="char-head">
          <img src={iconSrc(character.portrait)} alt="" width="112" height="112" />
          <div>
            <p className="eyebrow">{role === 'killer' ? 'Killer' : 'Survivor'}</p>
            <h2>{character.name}</h2>
            {power && <p className="muted">Power: {power}</p>}
            <p className="char-links small">
              <a href={`/${role}s/${character.id}/`}>Full page</a>
              <a href={character.wikiUrl} target="_blank" rel="noreferrer">
                Wiki ↗
              </a>
            </p>
          </div>
        </header>

        {facts.length > 0 && (
          <section>
            <h3>At a glance</h3>
            <ul className="char-facts">
              {facts.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          </section>
        )}

        <section>
          <h3>Unique perks</h3>
          <ul className="char-perks">
            {perks.map((p) => (
              <li key={p.id}>
                <img src={iconSrc(p.icon)} alt="" width="48" height="48" loading="lazy" />
                <div>
                  <strong>{p.name}</strong>
                  {p.tags?.length > 0 && (
                    <span className="small muted"> · {p.tags.map((t) => PLAYSTYLES[role]?.[t] ?? t).join(', ')}</span>
                  )}
                  <div className="small">
                    <PerkText perk={p} full={false} />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>

        {related.length > 0 && (
          <section>
            <h3>{role === 'killer' ? `Best builds for ${character.name}` : 'Builds with their perks'}</h3>
            <ul className="char-builds">
              {related.map((b) => (
                <li key={b.id}>
                  <button type="button" onClick={() => onShowBuild?.(b)}>
                    <span className="char-build-perks">
                      {b.resolved.perks.filter(Boolean).map((p) => (
                        <img key={p.id} src={iconSrc(p.icon)} alt="" title={p.name} width="36" height="36" loading="lazy" />
                      ))}
                    </span>
                    <span className="char-build-name">{b.name}</span>
                    <span className="char-build-score">{b.rating.score}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {Object.keys(byId).length > 0 && (
          <details className="char-more">
            <summary>Community stats (current patch)</summary>
            <CharacterStats entry={entry} stats={stats} role={role} />
            <TopUsage entry={entry} perksById={perksById} role={role} />
          </details>
        )}

        {charAddons.length > 0 && (
          <details className="char-more">
            <summary>
              {power ?? 'Power'} add-ons ({charAddons.length})
            </summary>
            <div className="grid">
              {charAddons.map((a) => (
                <EntityCard key={a.id} entity={a} subtitle={RARITY_LABEL[a.rarity] ?? a.rarity} />
              ))}
            </div>
          </details>
        )}
      </div>
    </div>
  );
}

/**
 * Grid of character portraits (killers or survivors). Clicking one opens a
 * pop-up with its unique perks, a short summary, best builds, community stats
 * and (killers) its power add-ons.
 */
export default function CharacterList({
  characters,
  perksById,
  addons = [],
  stats = null,
  role = 'killer',
  builds = [],
  onShowBuild,
}) {
  const [selected, setSelected] = useState(null);
  const [sort, setSort] = useState('release');
  const character = characters.find((c) => c.id === selected);
  const byId = (role === 'killer' ? stats?.killers : stats?.survivors) ?? {};
  const hasStats = Object.keys(byId).length > 0;
  const SORTS = sorts(role);
  const sortFn = SORTS[sort].fn;
  const shown = sortFn ? [...characters].sort((a, b) => sortFn(a, b, byId)) : characters;
  const tileRate = (s) => (role === 'killer' ? `${fmt(s.killRate)} kills` : `${fmt(s.escapeRate)} escapes`);
  const close = useRef(() => setSelected(null)).current;

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
            onClick={() => setSelected(c.id)}
            aria-haspopup="dialog"
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
        <CharacterModal
          character={character}
          role={role}
          perksById={perksById}
          addons={addons}
          stats={stats}
          byId={byId}
          builds={builds}
          onShowBuild={onShowBuild}
          onClose={close}
        />
      )}
    </section>
  );
}

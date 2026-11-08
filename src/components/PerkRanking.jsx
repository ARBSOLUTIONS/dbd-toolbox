import { useMemo, useState } from 'react';
import PerkCard from './PerkCard.jsx';
import { iconSrc } from '../lib/format.js';
import { rankPerks, TIERS, PRIOR_GAMES, MIN_PERK_GAMES, periodLabel } from '../lib/nlStats.js';

const fmt = (v) => (v == null ? '–' : `${v.toFixed(1)}%`);
const signed = (v) => (v == null ? '–' : `${v >= 0 ? '+' : ''}${v.toFixed(1)}`);

function Movement({ value }) {
  if (value == null || value === 0) return null;
  if (value === 'new') return <span className="rank-move new" title="Not ranked in the previous import">new</span>;
  return (
    <span className={`rank-move ${value > 0 ? 'up' : 'down'}`} title={`${Math.abs(value)} place(s) ${value > 0 ? 'up' : 'down'} since the previous import`}>
      {value > 0 ? '▲' : '▼'}
      {Math.abs(value)}
    </span>
  );
}

function PerkChip({ e, by, selected, onSelect }) {
  return (
    <button
      className={`rank-chip ${selected ? 'active' : ''}`}
      onClick={() => onSelect(selected ? null : e.perk.id)}
      title={`${e.perk.name}: ${fmt(e.rate)} ${e.rateLabel} (${signed(e.delta)} vs average), used in ${fmt(e.usage)} of games, ${e.count} games`}
    >
      <span className="rank-place">#{e.place}</span>
      <img src={iconSrc(e.perk.icon)} alt="" loading="lazy" />
      <span className="rank-name">{e.perk.name}</span>
      <span className="rank-num">{by === 'popularity' ? fmt(e.usage) : fmt(e.rate)}</span>
      <Movement value={e.movement} />
    </button>
  );
}

/**
 * Perk ranking from NightLight community stats. Everything is calculated from
 * data/nightlight.json when the page loads, so a new stats import updates the
 * ranking (and its movement arrows) without any other change.
 */
export default function PerkRanking({ perks, stats }) {
  const [role, setRole] = useState('survivor');
  const [by, setBy] = useState('strength');
  const [view, setView] = useState('tiers');
  const [selected, setSelected] = useState(null);
  const [showHow, setShowHow] = useState(false);
  const ranking = useMemo(() => rankPerks(perks, stats, { role, by }), [perks, stats, role, by]);
  const selectedPerk = perks.find((p) => p.id === selected);

  if (!stats?.perks || !Object.keys(stats.perks).length) {
    return <p className="muted">No NightLight perk stats imported yet. See “Community stats” in the README.</p>;
  }
  const label = role === 'killer' ? 'kill rate' : 'escape rate';
  const period = ranking.period?.start ? periodLabel({ period: ranking.period }) : periodLabel(stats);
  const tierOf = Object.fromEntries(TIERS.map((t) => [t.id, t]));

  return (
    <section className="perk-ranking">
      <div className="toolbar">
        <div className="segmented">
          {['survivor', 'killer'].map((r) => (
            <button key={r} className={role === r ? 'active' : ''} onClick={() => { setRole(r); setSelected(null); }}>
              {r === 'survivor' ? 'Survivor perks' : 'Killer perks'}
            </button>
          ))}
        </div>
        <div className="segmented">
          {[
            ['strength', 'Best ' + label],
            ['popularity', 'Most used'],
          ].map(([id, l]) => (
            <button key={id} className={by === id ? 'active' : ''} onClick={() => setBy(id)}>
              {l}
            </button>
          ))}
        </div>
        <div className="segmented">
          {[
            ['tiers', 'Tiers'],
            ['list', 'List'],
          ].map(([id, l]) => (
            <button key={id} className={view === id ? 'active' : ''} onClick={() => setView(id)}>
              {l}
            </button>
          ))}
        </div>
      </div>

      <p className="muted small rank-source">
        {ranking.ranked.length} ranked {role} perks · {period} · average {label} {ranking.average}% · from{' '}
        <a href={stats.source?.url ?? 'https://nightlight.gg'} target="_blank" rel="noreferrer">
          NightLight.gg
        </a>
        {stats.importedAt && ` · updated ${new Date(stats.importedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`}
        {' · '}
        <button className="link-button small" onClick={() => setShowHow(!showHow)}>
          How is this ranked? {showHow ? '▴' : '▾'}
        </button>
      </p>
      {showHow && (
        <div className="rank-how small">
          <p>
            <strong>Best {label}:</strong> each perk’s {label} minus the average perk of its role, shrunk for small
            samples: difference × games ÷ (games + {PRIOR_GAMES}). So a perk with 20 games and a wild {label} stays near
            the middle, and a perk with thousands of games keeps its full difference. Tiers: S ≥ +3, A ≥ +1.25, B
            about average, C ≤ −1.25, D ≤ −3.
          </p>
          <p>
            <strong>Most used:</strong> the share of {role} games that use the perk. Perks with fewer than{' '}
            {MIN_PERK_GAMES} games are listed apart. ▲▼ show places gained or lost since the previous import.
          </p>
          <p>
            Community numbers from players who upload their matches: a strong hint, not proof. A perk can win often
            because good players pick it. The ranking recalculates by itself whenever new stats are imported.
          </p>
        </div>
      )}

      {view === 'tiers' && by === 'strength' ? (
        <div className="tier-list">
          {ranking.tiers.map((t) => (
            <div key={t.id} className={`tier-row tier-${t.id}`}>
              <div className="tier-label" title={t.label}>
                <span>{t.id}</span>
                <small>{t.perks.length}</small>
              </div>
              <div className="tier-perks">
                {t.perks.length ? (
                  t.perks.map((e) => <PerkChip key={e.perk.id} e={e} by={by} selected={selected === e.perk.id} onSelect={setSelected} />)
                ) : (
                  <span className="muted small">No perks</span>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="table-scroll">
          <table className="stats-table perk-table rank-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Perk</th>
                <th>Tier</th>
                <th>Used in</th>
                <th>{label[0].toUpperCase() + label.slice(1)}</th>
                <th>vs average</th>
                <th>Games</th>
                <th>Change</th>
              </tr>
            </thead>
            <tbody>
              {ranking.ranked.map((e) => (
                <tr key={e.perk.id} className={selected === e.perk.id ? 'active' : ''} onClick={() => setSelected(selected === e.perk.id ? null : e.perk.id)}>
                  <td>{e.place}</td>
                  <td>
                    <img src={iconSrc(e.perk.icon)} alt="" loading="lazy" />
                    {e.perk.name}
                  </td>
                  <td>
                    <span className={`tier-badge tier-${e.tier}`} title={tierOf[e.tier].label}>
                      {e.tier}
                    </span>
                  </td>
                  <td>{fmt(e.usage)}</td>
                  <td>{fmt(e.rate)}</td>
                  <td className={e.delta >= 0 ? 'good' : 'bad'}>{signed(e.delta)}</td>
                  <td>{e.count?.toLocaleString()}</td>
                  <td>
                    <Movement value={e.movement} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selectedPerk && (
        <div className="rank-detail">
          <PerkCard perk={selectedPerk} />
        </div>
      )}

      {ranking.unranked.length > 0 && (
        <details className="rank-unranked">
          <summary>
            Not enough games to rank ({ranking.unranked.length} perks under {MIN_PERK_GAMES} games)
          </summary>
          <div className="tier-perks">
            {ranking.unranked.map((e) => (
              <button key={e.perk.id} className="rank-chip muted-chip" onClick={() => setSelected(e.perk.id)} title={`${e.count} games`}>
                <img src={iconSrc(e.perk.icon)} alt="" loading="lazy" />
                <span className="rank-name">{e.perk.name}</span>
                <span className="rank-num">{e.count} games</span>
              </button>
            ))}
          </div>
        </details>
      )}
    </section>
  );
}

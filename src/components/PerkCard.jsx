import { useState } from 'react';
import { iconSrc } from '../lib/format.js';
import { useNav } from '../lib/nav.js';
import { PERK_VERDICTS } from '../lib/nlStats.js';

const cap = (s) => s[0].toUpperCase() + s.slice(1);

/**
 * NightLight numbers for one perk: how often it is used (bar relative to the
 * most used perk of its role) and how often it wins (bar with a tick at the
 * average), plus a verdict. See perkStatsTable in nlStats.js.
 */
export function PerkStats({ nl }) {
  const v = PERK_VERDICTS[nl.verdict] ?? PERK_VERDICTS.few;
  const usageWidth = nl.maxUsage ? Math.max(2, (nl.usage / nl.maxUsage) * 100) : 0;
  return (
    <div
      className={`perk-stats verdict-${nl.verdict}`}
      title="Community stats from matches uploaded to NightLight.gg (last 28 days)"
    >
      <div className="perk-stats-head">
        <span className="perk-verdict">
          {v.short} {v.label}
        </span>
        {nl.rank && (
          <span className="muted">
            #{nl.rank} of {nl.of} most used
          </span>
        )}
      </div>
      <div className="perk-stat-row">
        <span className="perk-stat-label">Used in</span>
        <span className="perk-bar">
          <span style={{ width: `${usageWidth}%` }} />
        </span>
        <strong>{nl.usage.toFixed(1)}%</strong>
      </div>
      {nl.rate != null && (
        <div className="perk-stat-row">
          <span className="perk-stat-label">{cap(nl.rateLabel)}</span>
          <span className="perk-bar perk-bar-rate">
            <span style={{ width: `${nl.rate}%` }} />
            {nl.average != null && <i style={{ left: `${nl.average}%` }} title={`Average ${nl.average}%`} />}
          </span>
          <strong>{nl.rate.toFixed(1)}%</strong>
        </div>
      )}
      <div className="muted small">
        {nl.delta != null && (
          <span className={nl.delta >= 0 ? 'good' : 'bad'}>
            {nl.delta >= 0 ? '+' : ''}
            {nl.delta.toFixed(1)} vs average ({nl.average}%)
          </span>
        )}
        {' · '}
        {nl.count?.toLocaleString() ?? '?'} {nl.role} games
        {nl.borrowedFrom && ' · numbers of the identical perk'}
      </div>
    </div>
  );
}

/**
 * Card for anything with an icon, name and description:
 * perks, add-ons, items and offerings. `subtitle` is the grey line under the name.
 */
export function EntityCard({ entity, subtitle, note, isPerk = false }) {
  const [open, setOpen] = useState(false);
  const { showCombos, favorites } = useNav();
  const rarity = entity.rarity ? `rarity-${entity.rarity}` : '';
  return (
    <article className={`card perk-card ${rarity} ${open ? 'open' : ''}`} onClick={() => setOpen(!open)}>
      <img className="perk-icon" src={iconSrc(entity.icon)} alt="" loading="lazy" />
      <div className="card-body">
        <h3>
          {entity.name}
          {isPerk && favorites && (
            <button
              className={`star small-star ${favorites.isFavoritePerk(entity.id) ? 'on' : ''}`}
              title={favorites.isFavoritePerk(entity.id) ? 'Remove from favourite perks' : 'Save as favourite perk'}
              onClick={(e) => {
                e.stopPropagation();
                favorites.togglePerk(entity.id);
              }}
            >
              {favorites.isFavoritePerk(entity.id) ? '★' : '☆'}
            </button>
          )}
        </h3>
        {subtitle && <div className="muted small">{subtitle}</div>}
        {note && <div className="entity-note">{note}</div>}
        {entity.nl?.usage != null && <PerkStats nl={entity.nl} />}
        <p className="description">{entity.description}</p>
        {open && entity.quote && <p className="quote small">{entity.quote}</p>}
        {entity.tags?.length > 0 && (
          <div className="badges">
            {entity.tags.map((t) => (
              <span key={t} className="badge badge-style">
                {t}
              </span>
            ))}
          </div>
        )}
        {open && isPerk && showCombos && (
          <button
            className="link-button small combo-link"
            onClick={(e) => {
              e.stopPropagation();
              showCombos(entity.id);
            }}
          >
            Best combos →
          </button>
        )}
        {open && entity.wikiUrl && (
          <a
            className="small"
            href={entity.wikiUrl}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
          >
            View on wiki ↗
          </a>
        )}
      </div>
    </article>
  );
}

export const RARITY_LABEL = {
  common: 'Common',
  uncommon: 'Uncommon',
  rare: 'Rare',
  'very-rare': 'Very Rare',
  iridescent: 'Iridescent',
  event: 'Event',
  limited: 'Limited',
};

export const RARITY_ORDER = ['common', 'uncommon', 'rare', 'very-rare', 'iridescent', 'event', 'limited'];

export function sortByRarity(list) {
  return [...list].sort(
    (a, b) =>
      RARITY_ORDER.indexOf(a.rarity) - RARITY_ORDER.indexOf(b.rarity) || a.name.localeCompare(b.name),
  );
}

export default function PerkCard({ perk }) {
  return (
    <EntityCard
      isPerk
      entity={perk}
      subtitle={`${perk.role === 'killer' ? 'Killer' : 'Survivor'} · ${perk.character ?? 'General perk'}${
        perk.identicalTo ? ` · same effect as ${perk.identicalTo}` : ''
      }`}
    />
  );
}

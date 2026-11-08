import { useState } from 'react';
import { iconSrc } from '../lib/format.js';
import { useNav } from '../lib/nav.js';

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

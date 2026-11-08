import { useState } from 'react';
import PerkCard, { EntityCard, RARITY_LABEL, sortByRarity } from './PerkCard.jsx';
import { iconSrc } from '../lib/format.js';

/**
 * Grid of character portraits (killers or survivors). Clicking one shows its
 * unique perks and, for killers, its power add-ons.
 */
export default function CharacterList({ characters, perksById, addons = [] }) {
  const [selected, setSelected] = useState(null);
  const character = characters.find((c) => c.id === selected);
  const charAddons = character
    ? sortByRarity(addons.filter((a) => a.killer === character.name))
    : [];
  const power = charAddons[0]?.power;

  return (
    <section>
      <div className="killer-grid">
        {characters.map((c) => (
          <button
            key={c.id}
            className={`killer-tile ${c.id === selected ? 'active' : ''}`}
            onClick={() => setSelected(c.id === selected ? null : c.id)}
          >
            <img src={iconSrc(c.portrait)} alt="" loading="lazy" />
            <span>{c.name.replace(/^The /, '')}</span>
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

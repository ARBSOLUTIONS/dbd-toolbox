import { useState } from 'react';
import { EntityCard, RARITY_LABEL, sortByRarity } from './PerkCard.jsx';

export const ITEM_TYPE_LABEL = {
  toolbox: 'Toolboxes',
  medkit: 'Med-Kits',
  flashlight: 'Flashlights',
  map: 'Maps',
  key: 'Keys',
  'fog-vial': 'Fog Vials',
  firecracker: 'Firecrackers',
};

export default function ItemList({ items, addons }) {
  const [type, setType] = useState('toolbox');
  const shownItems = sortByRarity(items.filter((i) => i.type === type));
  const shownAddons = sortByRarity(addons.filter((a) => a.itemType === type));

  return (
    <section>
      <div className="toolbar">
        <div className="segmented">
          {Object.entries(ITEM_TYPE_LABEL).map(([id, label]) => (
            <button key={id} className={type === id ? 'active' : ''} onClick={() => setType(id)}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <h3 className="section-title">Items</h3>
      <div className="grid">
        {shownItems.map((i) => (
          <EntityCard key={i.id} entity={i} subtitle={RARITY_LABEL[i.rarity] ?? i.rarity} />
        ))}
      </div>

      <h3 className="section-title">Add-ons ({shownAddons.length})</h3>
      {shownAddons.length ? (
        <div className="grid">
          {shownAddons.map((a) => (
            <EntityCard key={a.id} entity={a} subtitle={RARITY_LABEL[a.rarity] ?? a.rarity} />
          ))}
        </div>
      ) : (
        <p className="muted">This item type has no add-ons.</p>
      )}
    </section>
  );
}

import { useMemo, useState } from 'react';
import Picker from './Picker.jsx';
import PerkCard, { EntityCard, RARITY_LABEL, sortByRarity } from './PerkCard.jsx';
import BuildCard from './BuildCard.jsx';
import { ITEM_TYPE_LABEL } from './ItemList.jsx';
import { iconSrc } from '../lib/format.js';
import { suggestPerks, suggestItemTypes, suggestAddons } from '../lib/combos.js';

/** "What goes well with this perk?" */
export default function Combos({ data, builds, perkId, setPerkId, favorites }) {
  const [role, setRole] = useState('survivor');
  const perk = data.perks.find((p) => p.id === perkId) ?? null;
  const activeRole = perk?.role ?? role;
  const [killerName, setKillerName] = useState('');

  const suggestions = useMemo(
    // Only hand-picked builds count as evidence; auto-generated ones are derived from these suggestions.
    () => (perk ? suggestPerks([perk], data.perks, builds.filter((b) => b.type !== 'auto'), { limit: 12 }) : []),
    [perk, data.perks, builds],
  );
  const usedIn = perk ? builds.filter((b) => b.resolved.perks.some((p) => p?.id === perk.id)) : [];

  // Killer perks that belong to a killer: suggest that killer by default.
  const killer = perk?.role === 'killer' ? killerName || perk.character || '' : '';
  const itemTypes = perk?.role === 'survivor' ? suggestItemTypes([perk]) : [];
  const killerAddons = killer
    ? suggestAddons([perk], data.addons.filter((a) => a.killer === killer), 4)
    : [];

  return (
    <section>
      <div className="toolbar">
        <div className="segmented">
          {['survivor', 'killer'].map((r) => (
            <button
              key={r}
              className={activeRole === r ? 'active' : ''}
              onClick={() => {
                setRole(r);
                setPerkId(null);
              }}
            >
              {r === 'survivor' ? 'Survivor' : 'Killer'}
            </button>
          ))}
        </div>
        <div className="grow">
          <Picker
            options={data.perks.filter((p) => p.role === activeRole)}
            value={perk}
            onPick={(p) => setPerkId(p?.id ?? null)}
            placeholder="Type a perk name to see what it works well with…"
          />
        </div>
      </div>

      {!perk && (
        <p className="muted">
          Choose a perk. You will see the perks, items and add-ons that work best with it, and the builds that use it.
        </p>
      )}

      {perk && (
        <>
          <div className="grid one">
            <PerkCard perk={perk} />
          </div>

          <h3 className="section-title">Works well with</h3>
          {suggestions.length ? (
            <ul className="combo-list">
              {suggestions.map(({ perk: p, score, reasons }) => (
                <li key={p.id} className="card combo-row">
                  <img src={iconSrc(p.icon)} alt="" loading="lazy" />
                  <div className="grow">
                    <button className="link-button combo-name" onClick={() => setPerkId(p.id)}>
                      {p.name}
                    </button>
                    <span className="muted small"> · {p.character ?? 'General perk'}</span>
                    <div className="small">{reasons.join(' ')}</div>
                  </div>
                  <span className={`combo-score ${score >= 10 ? 'strong' : ''}`} title="Combo points">
                    {score >= 10 ? 'Strong' : 'Good'}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">No clear partners found for this perk.</p>
          )}

          {perk.role === 'survivor' && itemTypes.length > 0 && (
            <>
              <h3 className="section-title">Suggested items</h3>
              <div className="grid">
                {itemTypes.slice(0, 2).map(({ type }) => {
                  const best = sortByRarity(data.items.filter((i) => i.type === type && i.rarity !== 'event')).at(-1);
                  return best ? (
                    <EntityCard
                      key={type}
                      entity={best}
                      subtitle={`${ITEM_TYPE_LABEL[type]} · fits the ${perk.tags.join('/')} style`}
                    />
                  ) : null;
                })}
              </div>
            </>
          )}

          {perk.role === 'killer' && (
            <>
              <h3 className="section-title">
                Add-ons that fit, for{' '}
                <select value={killer} onChange={(e) => setKillerName(e.target.value)}>
                  <option value="">choose a killer…</option>
                  {data.killers.map((k) => (
                    <option key={k.id} value={k.name}>
                      {k.name}
                    </option>
                  ))}
                </select>
              </h3>
              {killerAddons.length > 0 && (
                <div className="grid">
                  {killerAddons.map(({ addon, shared }) => (
                    <EntityCard
                      key={addon.id}
                      entity={addon}
                      subtitle={`${RARITY_LABEL[addon.rarity] ?? addon.rarity}${shared.length ? ` · also ${shared.join(', ')}` : ''}`}
                    />
                  ))}
                </div>
              )}
            </>
          )}

          <h3 className="section-title">Builds that use {perk.name} ({usedIn.length})</h3>
          {usedIn.length ? (
            <div className="build-grid">
              {usedIn.map((b) => (
                <BuildCard key={b.id} build={b} favorites={favorites} />
              ))}
            </div>
          ) : (
            <p className="muted">No hand-picked build uses this perk yet. Try it in the Build maker!</p>
          )}
        </>
      )}
    </section>
  );
}


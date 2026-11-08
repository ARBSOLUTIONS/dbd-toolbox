import { useMemo, useState } from 'react';
import Picker from './Picker.jsx';
import { ScoreBadge } from './BuildCard.jsx';
import { ITEM_TYPE_LABEL } from './ItemList.jsx';
import { RARITY_LABEL } from './PerkCard.jsx';
import { iconSrc } from '../lib/format.js';
import { PLAYSTYLES } from '../lib/tags.js';
import { scoreBuild } from '../lib/builds.js';
import { suggestPerks, suggestItemTypes, suggestAddons } from '../lib/combos.js';

const EMPTY = {
  role: 'survivor',
  killer: '',
  perks: [null, null, null, null],
  item: null,
  addons: [null, null],
  offering: null,
  playstyles: [],
  name: '',
};

/** Make your own build and get a live rating, explanation and suggestions. */
export default function BuildMaker({ data, builds, favorites, initial }) {
  const [b, setB] = useState(initial ?? EMPTY);
  const [saved, setSaved] = useState(false);
  const set = (patch) => {
    setB((old) => ({ ...old, ...patch }));
    setSaved(false);
  };

  const byId = (list, id) => list.find((x) => x.id === id) ?? null;
  const perks = b.perks.map((id) => byId(data.perks, id));
  const chosen = perks.filter(Boolean);
  const item = byId(data.items, b.item);
  const addonPool =
    b.role === 'survivor'
      ? data.addons.filter((a) => item && a.itemType === item.type)
      : data.addons.filter((a) => a.killer === b.killer);
  const addons = b.addons.map((id) => byId(addonPool, id));
  const offering = byId(data.offerings, b.offering);

  const rating = useMemo(() => scoreBuild(chosen, b.role, b.playstyles), [chosen, b.role, b.playstyles]);

  // Extra notes about add-ons that support the perks.
  const addonNotes = useMemo(() => {
    const picked = addons.filter(Boolean);
    if (!picked.length || !chosen.length) return [];
    return suggestAddons(chosen, picked, 2)
      .filter((x) => x.shared.length)
      .map((x) => `${x.addon.name} supports your ${x.shared.join(' / ')} perks.`);
  }, [addons, chosen]);

  const perkSuggestions = useMemo(
    () => (chosen.length && chosen.length < 4 ? suggestPerks(chosen, data.perks, builds, { focus: b.playstyles, limit: 6 }) : []),
    [chosen, data.perks, builds, b.playstyles],
  );
  const itemSuggestion = b.role === 'survivor' && !item && chosen.length ? suggestItemTypes(chosen)[0] : null;
  const addonSuggestions =
    chosen.length && addons.some((a) => !a) && addonPool.length
      ? suggestAddons(chosen, addonPool.filter((a) => !b.addons.includes(a.id)), 3)
      : [];

  const perkOptions = data.perks.filter((p) => p.role === b.role && !b.perks.includes(p.id));
  const exhaustionCount = chosen.filter((p) => p.exhaustion && p.id !== 'adrenaline').length;

  function setPerk(i, perk) {
    const next = [...b.perks];
    next[i] = perk?.id ?? null;
    set({ perks: next });
  }
  function addSuggested(perk) {
    const i = b.perks.indexOf(null);
    if (i >= 0) setPerk(i, perk);
  }
  function setAddon(i, addon) {
    const next = [...b.addons];
    next[i] = addon?.id ?? null;
    set({ addons: next });
  }
  function addAddon(addon) {
    const i = b.addons.indexOf(null);
    if (i >= 0) setAddon(i, addon);
  }

  function toBuildObject() {
    return {
      id: `custom-${Date.now()}`,
      name: b.name.trim() || 'My build',
      role: b.role,
      type: 'custom',
      killer: b.role === 'killer' ? b.killer || null : undefined,
      playstyles: b.playstyles,
      perks: chosen.map((p) => p.name),
      item: item?.name ?? null,
      itemAddons: b.role === 'survivor' ? addons.filter(Boolean).map((a) => a.name) : undefined,
      addons: b.role === 'killer' ? addons.filter(Boolean).map((a) => a.name) : undefined,
      offering: offering?.name ?? null,
      why: [...rating.pros, ...addonNotes].slice(0, 3).join(' '),
    };
  }

  function saveFavorite() {
    favorites.saveCustom(toBuildObject());
    setSaved(true);
  }

  return (
    <section className="maker">
      <div className="maker-main">
        <div className="toolbar">
          <div className="segmented">
            {['survivor', 'killer'].map((r) => (
              <button key={r} className={b.role === r ? 'active' : ''} onClick={() => set({ ...EMPTY, role: r })}>
                {r === 'survivor' ? 'Survivor' : 'Killer'}
              </button>
            ))}
          </div>
          {b.role === 'killer' && (
            <select value={b.killer} onChange={(e) => set({ killer: e.target.value, addons: [null, null] })}>
              <option value="">Choose a killer…</option>
              {data.killers.map((k) => (
                <option key={k.id} value={k.name}>
                  {k.name}
                </option>
              ))}
            </select>
          )}
          <input
            type="text"
            placeholder="Build name (optional)"
            value={b.name}
            onChange={(e) => set({ name: e.target.value })}
          />
          <button onClick={() => set({ ...EMPTY, role: b.role })}>Clear</button>
        </div>

        <h3 className="section-title">Playstyle (optional — the rating checks if your perks fit it)</h3>
        <div className="chips">
          {Object.entries(PLAYSTYLES[b.role]).map(([id, label]) => (
            <button
              key={id}
              className={`chip ${b.playstyles.includes(id) ? 'active' : ''}`}
              onClick={() =>
                set({
                  playstyles: b.playstyles.includes(id)
                    ? b.playstyles.filter((x) => x !== id)
                    : [...b.playstyles, id],
                })
              }
            >
              {label}
            </button>
          ))}
        </div>

        <h3 className="section-title">Perks</h3>
        <div className="maker-slots">
          {perks.map((p, i) => (
            <Picker
              key={i}
              options={p ? [...perkOptions, p] : perkOptions}
              value={p}
              onPick={(perk) => setPerk(i, perk)}
              placeholder={`Perk ${i + 1}…`}
            />
          ))}
        </div>
        {exhaustionCount > 1 && (
          <p className="warning small">⚠ You have {exhaustionCount} Exhaustion perks. Only one can be used at a time.</p>
        )}

        {b.role === 'survivor' ? (
          <>
            <h3 className="section-title">Item & add-ons</h3>
            <div className="maker-slots">
              <Picker
                options={data.items.filter((i) => i.type !== 'firecracker')}
                value={item}
                onPick={(it) => set({ item: it?.id ?? null, addons: [null, null] })}
                placeholder="Item…"
              />
              {[0, 1].map((i) => (
                <Picker
                  key={i}
                  options={addonPool.filter((a) => !b.addons.includes(a.id) || a.id === b.addons[i])}
                  value={addons[i]}
                  onPick={(a) => setAddon(i, a)}
                  placeholder={item ? `Add-on ${i + 1}…` : 'Choose an item first'}
                />
              ))}
            </div>
          </>
        ) : (
          <>
            <h3 className="section-title">Add-ons {b.killer ? `for ${b.killer}` : ''}</h3>
            <div className="maker-slots">
              {[0, 1].map((i) => (
                <Picker
                  key={i}
                  options={addonPool.filter((a) => !b.addons.includes(a.id) || a.id === b.addons[i])}
                  value={addons[i]}
                  onPick={(a) => setAddon(i, a)}
                  placeholder={b.killer ? `Add-on ${i + 1}…` : 'Choose a killer first'}
                />
              ))}
            </div>
          </>
        )}

        <h3 className="section-title">Offering (optional)</h3>
        <div className="maker-slots">
          <Picker
            options={data.offerings.filter((o) => o.role === b.role || o.role === 'both')}
            value={offering}
            onPick={(o) => set({ offering: o?.id ?? null })}
            placeholder="Offering…"
          />
        </div>
      </div>

      <aside className="maker-side card">
        <div className="build-head">
          <div>
            <h3>{b.name.trim() || 'Your build'}</h3>
            <div className="muted small">{chosen.length}/4 perks</div>
          </div>
          <ScoreBadge score={rating.score} />
        </div>

        {chosen.length === 0 ? (
          <p className="muted small">Pick perks on the left to get a rating and explanation.</p>
        ) : (
          <ul className="reasons">
            {[...rating.pros, ...addonNotes].map((r, i) => (
              <li key={`p${i}`} className="pro">
                {r}
              </li>
            ))}
            {rating.cons.map((r, i) => (
              <li key={`c${i}`} className="con">
                {r}
              </li>
            ))}
          </ul>
        )}

        {perkSuggestions.length > 0 && (
          <>
            <h4>Suggested perks</h4>
            <ul className="suggestions">
              {perkSuggestions.map(({ perk, reasons }) => (
                <li key={perk.id}>
                  <button onClick={() => addSuggested(perk)} title={reasons.join(' ')}>
                    <img src={iconSrc(perk.icon)} alt="" />
                    <span>{perk.name}</span>
                    <span className="plus">+</span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}

        {itemSuggestion && (
          <p className="small">
            <strong>Item tip:</strong> a {ITEM_TYPE_LABEL[itemSuggestion.type].replace(/s$/, '').toLowerCase()} fits these perks.
          </p>
        )}

        {addonSuggestions.length > 0 && (
          <>
            <h4>Suggested add-ons</h4>
            <ul className="suggestions">
              {addonSuggestions.map(({ addon }) => (
                <li key={addon.id}>
                  <button onClick={() => addAddon(addon)} title={addon.description}>
                    <img src={iconSrc(addon.icon)} alt="" />
                    <span>
                      {addon.name} <span className="muted small">({RARITY_LABEL[addon.rarity] ?? addon.rarity})</span>
                    </span>
                    <span className="plus">+</span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}

        <div className="maker-actions">
          <button disabled={!chosen.length} onClick={saveFavorite}>
            {saved ? '★ Saved to favourites' : '☆ Save to favourites'}
          </button>
          <button
            disabled={!chosen.length}
            title="Copy this build in the builds.json format, so you can add it to the hand-picked list"
            onClick={() => navigator.clipboard?.writeText(JSON.stringify(toBuildObject(), null, 2))}
          >
            Copy as JSON
          </button>
        </div>
      </aside>
    </section>
  );
}

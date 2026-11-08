import { useRef, useState } from 'react';
import BuildCard from './BuildCard.jsx';
import PerkCard from './PerkCard.jsx';

export default function Favorites({ builds, customBuilds, favorites, perks = [] }) {
  const fileInput = useRef();
  const [message, setMessage] = useState(null);
  const curated = builds.filter((b) => favorites.curated.includes(b.id));
  const all = [...customBuilds, ...curated];

  async function onImport(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      favorites.importText(await file.text());
      setMessage('Favourites imported.');
    } catch (err) {
      setMessage(`Could not import: ${err.message}`);
    }
    e.target.value = '';
  }

  return (
    <section>
      <div className="toolbar">
        <span className="muted small">
          Saved in this browser on this PC. Use Export to make a backup or move them to another browser.
        </span>
        <div className="grow" />
        <button onClick={favorites.exportFile} disabled={!all.length && !favorites.perks.length}>
          Export
        </button>
        <button onClick={() => fileInput.current.click()}>Import</button>
        <input ref={fileInput} type="file" accept="application/json" hidden onChange={onImport} />
      </div>
      {message && <p className="small">{message}</p>}

      <h3 className="section-title">Favourite perks ({favorites.perks.length})</h3>
      {favorites.perks.length ? (
        <div className="grid">
          {favorites.perks
            .map((id) => perks.find((p) => p.id === id))
            .filter(Boolean)
            .map((p) => (
              <PerkCard key={p.id} perk={p} />
            ))}
        </div>
      ) : (
        <p className="muted">Click ☆ next to a perk name (Perks tab, combos, killers…) to save it. Favourite perks are shown first in the Build maker.</p>
      )}

      <h3 className="section-title">Favourite builds ({all.length})</h3>
      {all.length ? (
        <div className="build-grid">
          {all.map((b) => (
            <BuildCard key={b.id} build={b} favorites={favorites} />
          ))}
        </div>
      ) : (
        <p className="muted">
          No favourites yet. Click ☆ on any build, or make your own in the Build maker and save it.
        </p>
      )}
    </section>
  );
}

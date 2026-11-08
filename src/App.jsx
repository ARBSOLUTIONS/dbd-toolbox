import { useCallback, useEffect, useMemo, useState } from 'react';
import DataStatus from './components/DataStatus.jsx';
import PerkList from './components/PerkList.jsx';
import CharacterList from './components/CharacterList.jsx';
import ItemList from './components/ItemList.jsx';
import OfferingList from './components/OfferingList.jsx';
import BuildList from './components/BuildList.jsx';
import Combos from './components/Combos.jsx';
import BuildMaker from './components/BuildMaker.jsx';
import Favorites from './components/Favorites.jsx';
import Community from './components/Community.jsx';
import { useFavorites } from './lib/favorites.js';
import { NavContext } from './lib/nav.js';
import { loadData, STATIC, SITE_NAME } from './lib/api.js';
import { withTags } from './lib/tags.js';
import { withOfferingRatings } from './lib/offeringRatings.js';
import { resolveBuild, scoreBuild } from './lib/builds.js';
import { repairBuild } from './lib/patchAware.js';
import { generateBuilds } from './lib/generator.js';
import { buildStats } from './lib/nlStats.js';
import PatchNotes from './components/PatchNotes.jsx';
import Home from './components/Home.jsx';
import BuildCard from './components/BuildCard.jsx';
import Challenges from './components/Challenges.jsx';
import Achievements, { AchievementToasts } from './components/Achievements.jsx';
import { useChallenges } from './lib/challengeStore.js';

const TAB_GROUPS = [
  {
    label: 'Start',
    tabs: [
      { id: 'home', icon: '🏠', label: 'Home', desc: 'Overview of everything on the site.' },
      { id: 'patchnotes', icon: '📜', label: 'Patch notes', desc: 'Buffs, nerfs and which builds they affect.' },
    ],
  },
  {
    label: 'Builds',
    tabs: [
      { id: 'builds', icon: '⚔️', label: 'Builds', desc: 'Rated meta, fun, beginner and generated builds.' },
      { id: 'combos', icon: '🔗', label: 'Combos', desc: 'Pick a perk and find what pairs best with it.' },
      { id: 'maker', icon: '🛠️', label: 'Build maker', desc: 'Make a build and get an instant score.' },
      { id: 'community', icon: '👥', label: 'Community', desc: 'Builds shared and voted on by players.' },
      { id: 'favorites', icon: '★', label: 'Favourites', desc: 'Your saved builds and perks.' },
    ],
  },
  {
    label: 'Play',
    tabs: [
      { id: 'challenges', icon: '🎲', label: 'Challenges', desc: 'Random, daily and weekly build challenges.' },
      { id: 'achievements', icon: '🏆', label: 'Achievements', desc: 'Unlock badges by completing challenges.' },
    ],
  },
  {
    label: 'Game data',
    tabs: [
      { id: 'perks', icon: '✦', label: 'Perks', desc: 'Every perk with its full description.' },
      { id: 'killers', icon: '🔪', label: 'Killers', desc: 'All killers, their perks and add-ons.' },
      { id: 'survivors', icon: '🏃', label: 'Survivors', desc: 'All survivors and their perks.' },
      { id: 'items', icon: '🔦', label: 'Items', desc: 'Items and item add-ons.' },
      { id: 'offerings', icon: '🕯️', label: 'Offerings', desc: 'Offerings rated from 1 to 5 stars.' },
    ],
  },
];

// Link every perk to the character it comes from (name + portrait), for the build cards.
function withOwners(perks, d) {
  const chars = {};
  for (const c of [...(d.killers ?? []), ...(d.survivors ?? [])]) {
    chars[c.name] = c;
    for (const a of c.aliases ?? []) chars[a] ??= c;
  }
  return perks.map((p) => {
    const c = p.character && chars[p.character];
    return { ...p, owner: c ? { name: c.name, portrait: c.portrait } : null };
  });
}

// NightLight usage / win rate on every perk (shown on perk cards), if imported.
const withPerkStats = (perks, stats) =>
  stats?.perks ? perks.map((p) => ({ ...p, nl: stats.perks[p.id] ?? null })) : perks;

// Offerings get a rating (1-5 stars + reason); the rating also corrects the role.
const rateOfferings = (list) => withOfferingRatings(list).map((o) => ({ ...o, role: o.rating.role ?? o.role }));

export default function App() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [tab, setTabState] = useState('home');
  const [buildFilter, setBuildFilter] = useState({});
  const [focusBuild, setFocusBuild] = useState(null);
  const [showBanner, setShowBanner] = useState(true);
  useEffect(() => {
    if (!focusBuild) return undefined;
    const close = (e) => e.key === 'Escape' && setFocusBuild(null);
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [focusBuild]);
  const setTab = useCallback((id, filter) => {
    if (id === 'builds') setBuildFilter({ ...(filter ?? {}), key: Date.now() });
    setTabState(id);
    window.scrollTo(0, 0);
  }, []);
  const [comboPerk, setComboPerk] = useState(null);
  const favorites = useFavorites();
  const challenges = useChallenges({
    killerCount: data?.killers?.length || 45,
    customBuilds: favorites.custom.length,
  });
  const nav = useMemo(
    () => ({
      showCombos: (perkId) => {
        setComboPerk(perkId);
        setTab('combos');
        window.scrollTo(0, 0);
      },
      favorites,
    }),
    [favorites],
  );

  const load = useCallback(() => {
    loadData()
      // Add playstyle tags to every perk once, right after loading.
      .then((d) =>
        setData({ ...d, perks: withPerkStats(withOwners(withTags(d.perks), d), d.stats), offerings: rateOfferings(d.offerings) }),
      )
      .catch(() =>
        setError(STATIC ? 'Could not load the data. Please reload the page.' : 'Could not reach the local server. Is “npm run dev” running?'),
      );
  }, []);

  useEffect(load, [load]);

  const perksById = useMemo(
    () => Object.fromEntries((data?.perks ?? []).map((p) => [p.id, p])),
    [data],
  );

  // Hand-picked builds, linked to the real data and rated.
  const builds = useMemo(() => {
    if (!data) return [];
    const fresh = new Set(data.changes?.newPerkIds ?? []);
    return (data.curated?.builds ?? []).map((b) => {
      const r = repairBuild(resolveBuild(b, data), data, data.changes);
      const build = {
        ...r,
        rating: scoreBuild(r.resolved.perks, b.role, b.playstyles),
        newPerks: r.resolved.perks.filter((p) => p && fresh.has(p.id)).map((p) => p.name),
      };
      return { ...build, nl: buildStats(build, data.stats) };
    });
  }, [data]);

  // Automatically generated builds: recalculated from the current data, so they
  // follow every patch. Hand-picked builds come first, generated ones after.
  const allBuilds = useMemo(() => {
    if (!data) return [];
    const generated = generateBuilds(data, builds, data.changes).map((b) => ({ ...b, nl: buildStats(b, data.stats) }));
    return [...builds, ...generated];
  }, [data, builds]);

  // Your own builds from the Build maker, rated the same way.
  const customBuilds = useMemo(() => {
    if (!data) return [];
    return favorites.custom.map((b) => {
      const r = resolveBuild(b, data);
      const build = { ...r, rating: scoreBuild(r.resolved.perks, b.role, b.playstyles) };
      return { ...build, nl: buildStats(build, data.stats) };
    });
  }, [data, favorites.custom]);

  const patch = data?.meta?.patch;

  return (
    <NavContext.Provider value={nav}>
    {patch && showBanner && (
      <div className="announce">
        <button className="announce-link" onClick={() => setTab('patchnotes')}>
          Patch {patch} is live. See which builds got buffed and nerfed <span aria-hidden="true">→</span>
        </button>
        <button className="announce-close" onClick={() => setShowBanner(false)} aria-label="Hide this message">
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
        </button>
      </div>
    )}
    <div className="app">
      <header className="topbar">
        <h1>
          <button className="logo-button" onClick={() => setTab('home')} title="Home">
            <img className="logo-mark" src="/logo.svg" alt="" width="36" height="36" />
            <span className="logo-word">
              DBD<span>Toolbox</span>
            </span>
          </button>
        </h1>
        <DataStatus meta={data?.meta} onRefreshed={load} />
        <nav className="tabs" aria-label="Main menu">
          {TAB_GROUPS.map((g) => (
            <div key={g.label} className="tab-group">
              <span className="tab-group-label">{g.label}</span>
              <div className="tab-group-items">
                {g.tabs.map((t) => (
                  <button
                    key={t.id}
                    className={`tab ${tab === t.id ? 'active' : ''}`}
                    aria-current={tab === t.id ? 'page' : undefined}
                    onClick={() => setTab(t.id)}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </nav>
      </header>

      <main>
        {error && <p className="error">{error}</p>}
        {!data && !error && <p className="muted">Loading…</p>}
        {data && tab === 'home' && (
          <Home data={data} builds={allBuilds} onOpen={setTab} onShowBuild={setFocusBuild} />
        )}
        {data && tab === 'patchnotes' && <PatchNotes data={data} builds={allBuilds} onShowBuild={setFocusBuild} />}
        {data && tab === 'builds' && (
          <BuildList key={buildFilter.key} initial={buildFilter} builds={allBuilds} killers={data.killers} favorites={favorites} />
        )}
        {data && tab === 'combos' && (
          <Combos data={data} builds={allBuilds} perkId={comboPerk} setPerkId={setComboPerk} favorites={favorites} />
        )}
        {data && tab === 'maker' && (
          <BuildMaker data={data} builds={builds} favorites={favorites} onShared={() => setTab('community')} />
        )}
        {data && tab === 'community' && (
          <Community data={data} favorites={favorites} onOpenMaker={() => setTab('maker')} />
        )}
        {data && tab === 'challenges' && <Challenges data={data} curated={builds} store={challenges} />}
        {tab === 'achievements' && <Achievements store={challenges} />}
        {data && tab === 'favorites' && (
          <Favorites builds={allBuilds} customBuilds={customBuilds} favorites={favorites} perks={data.perks} />
        )}
        {data && tab === 'perks' && <PerkList perks={data.perks} />}
        {data && tab === 'killers' && (
          <CharacterList characters={data.killers} perksById={perksById} addons={data.addons} stats={data.stats} role="killer" />
        )}
        {data && tab === 'survivors' && (
          <CharacterList characters={data.survivors} perksById={perksById} stats={data.stats} role="survivor" />
        )}
        {data && tab === 'items' && <ItemList items={data.items} addons={data.addons} />}
        {data && tab === 'offerings' && <OfferingList offerings={data.offerings} />}
      </main>

      {focusBuild && (
        <div className="modal-backdrop" onClick={() => setFocusBuild(null)}>
          <div className="modal" role="dialog" aria-modal="true" aria-label={focusBuild.name} onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setFocusBuild(null)} aria-label="Close">
              ✕
            </button>
            <BuildCard build={focusBuild} favorites={favorites} />
          </div>
        </div>
      )}

      <AchievementToasts store={challenges} />

    </div>
      <footer className="site-footer">
        <div className="footer-inner">
          <img className="footer-mark" src="/logo.svg" alt="" width="44" height="44" />
          <div className="footer-cols">
            {TAB_GROUPS.map((g) => (
              <div key={g.label} className="footer-col">
                <span className="footer-col-label">{g.label}</span>
                {g.tabs.map((t) => (
                  <button key={t.id} className="footer-link" onClick={() => setTab(t.id)}>
                    {t.label}
                  </button>
                ))}
              </div>
            ))}
            {STATIC && (
              <div className="footer-col">
                <span className="footer-col-label">Pages</span>
                <a className="footer-link" href="/about/">About &amp; privacy</a>
                <a className="footer-link" href="/perks/">All perks</a>
                <a className="footer-link" href="/killers/">All killers</a>
                <a className="footer-link" href="/builds/">All builds</a>
              </div>
            )}
          </div>
          <p className="footer-legal">
            Game data and icons from the{' '}
            <a href="https://deadbydaylight.wiki.gg" target="_blank" rel="noreferrer">
              Dead by Daylight Wiki
            </a>{' '}
            (CC BY-NC-SA 3.0). {SITE_NAME} is a free, non-commercial fan project and is not affiliated with or endorsed
            by Behaviour Interactive. Dead by Daylight is a trademark of Behaviour Interactive Inc.
          </p>
        </div>
        <div className="footer-word" aria-hidden="true">DBD Toolbox</div>
      </footer>
    </NavContext.Provider>
  );
}

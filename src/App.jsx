import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import DataStatus from './components/DataStatus.jsx';
import { useFavorites } from './lib/favorites.js';
import { NavContext } from './lib/nav.js';
import { loadData, loadExtraData, STATIC, SITE_NAME } from './lib/api.js';
import { withTags } from './lib/tags.js';
import { resolveBuild, scoreBuild } from './lib/builds.js';
import { buildStats, perkStatsTable, periodLabel } from './lib/nlStats.js';
import { buildAppUrl, readUrlState } from './lib/urlState.js';
import Home from './components/Home.jsx';
import Achievements, { AchievementToasts } from './components/Achievements.jsx';
import { useChallenges } from './lib/challengeStore.js';

const BuildCard = lazy(() => import('./components/BuildCard.jsx'));
const PerkList = lazy(() => import('./components/PerkList.jsx'));
const PerkRanking = lazy(() => import('./components/PerkRanking.jsx'));
const CharacterList = lazy(() => import('./components/CharacterList.jsx'));
const ItemList = lazy(() => import('./components/ItemList.jsx'));
const OfferingList = lazy(() => import('./components/OfferingList.jsx'));
const BuildList = lazy(() => import('./components/BuildList.jsx'));
const Combos = lazy(() => import('./components/Combos.jsx'));
const BuildMaker = lazy(() => import('./components/BuildMaker.jsx'));
const Favorites = lazy(() => import('./components/Favorites.jsx'));
const Community = lazy(() => import('./components/Community.jsx'));
const PatchNotes = lazy(() => import('./components/PatchNotes.jsx'));
const Challenges = lazy(() => import('./components/Challenges.jsx'));

/** Always visible in the header; the rest sits under "More". */
const PRIMARY_TABS = ['builds', 'maker', 'community', 'ranking', 'patchnotes'];

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
      { id: 'ranking', icon: '🏅', label: 'Perk ranking', desc: 'Tier list of perks from community stats.' },
      { id: 'killers', icon: '🔪', label: 'Killers', desc: 'All killers, their perks and add-ons.' },
      { id: 'survivors', icon: '🏃', label: 'Survivors', desc: 'All survivors and their perks.' },
      { id: 'items', icon: '🔦', label: 'Items', desc: 'Items and item add-ons.' },
      { id: 'offerings', icon: '🕯️', label: 'Offerings', desc: 'Offerings rated from 1 to 5 stars.' },
    ],
  },
];
const ALL_TABS = TAB_GROUPS.flatMap((g) => g.tabs);
const VALID_TABS = new Set(ALL_TABS.map((t) => t.id));
const NEEDS_EXTRA = new Set(['offerings', 'items', 'maker', 'challenges']);

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
const withPerkStats = (perks, stats) => {
  const table = perkStatsTable(perks, stats);
  return perks.map((p) => ({ ...p, nl: table[p.id] ?? null }));
};

function mergeExtraStats(stats, extra) {
  if (!stats || !extra) return stats;
  const mergeGroup = (base, details) => {
    if (!base) return base;
    if (!details) return base;
    return Object.fromEntries(
      Object.entries(base).map(([id, entry]) => [id, details[id] ? { ...entry, ...details[id] } : entry]),
    );
  };
  return {
    ...stats,
    killers: mergeGroup(stats.killers, extra.killerStatsDetails),
    survivors: mergeGroup(stats.survivors, extra.survivorStatsDetails),
  };
}

function HomeSkeleton() {
  return (
    <section className="home-skeleton" aria-label="Loading">
      <div className="skel skel-hero" />
      <div className="skel skel-bar" />
      <div className="skel-cols">
        <div className="skel skel-card" />
        <div className="skel skel-card" />
      </div>
    </section>
  );
}

export default function App() {
  const initialUrl = useMemo(() => readUrlState(VALID_TABS), []);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [tab, setTabState] = useState(initialUrl.tab);
  const [buildFilter, setBuildFilter] = useState(initialUrl.buildFilter);
  const [focusBuildId, setFocusBuildId] = useState(initialUrl.buildId);
  const [focusBuildObj, setFocusBuildObj] = useState(null);
  const [makerInitial, setMakerInitial] = useState(initialUrl.makerInitial);
  const [showBanner, setShowBanner] = useState(true);
  const [moreOpen, setMoreOpen] = useState(false);
  const [comboPerk, setComboPerkState] = useState(initialUrl.comboPerk);
  const liveGeneratedRef = useRef(null);
  const liveRepairRef = useRef(null);

  const pushUrl = useCallback((next) => {
    if (typeof window === 'undefined') return;
    const url = buildAppUrl(next);
    if (window.location.pathname + window.location.search !== url) {
      window.history.pushState(null, '', url);
    }
  }, []);

  const setTab = useCallback(
    (id, filter) => {
      if (id === 'builds') setBuildFilter({ ...(filter ?? {}), key: Date.now() });
      if (id !== 'maker') setMakerInitial(null);
      setFocusBuildId(null);
      setFocusBuildObj(null);
      setTabState(id);
      pushUrl({
        tab: id,
        perkId: id === 'combos' ? comboPerk : null,
        role: filter?.role ?? null,
        type: filter?.type ?? null,
      });
      window.scrollTo(0, 0);
    },
    [comboPerk, pushUrl],
  );

  const setComboPerk = useCallback(
    (perkId) => {
      setComboPerkState(perkId);
      pushUrl({ tab: 'combos', perkId });
    },
    [pushUrl],
  );

  const openBuildModal = useCallback(
    (build) => {
      if (!build) {
        setFocusBuildId(null);
        setFocusBuildObj(null);
        pushUrl({ tab, perkId: tab === 'combos' ? comboPerk : null });
        return;
      }
      setFocusBuildObj(build);
      setFocusBuildId(build.id);
      pushUrl({ tab, buildId: build.id, perkId: tab === 'combos' ? comboPerk : null });
    },
    [tab, comboPerk, pushUrl],
  );

  // Sync browser Back / Forward navigation with app state.
  useEffect(() => {
    const onPop = () => {
      const s = readUrlState(VALID_TABS);
      setTabState(s.tab);
      setComboPerkState(s.comboPerk);
      setFocusBuildId(s.buildId);
      if (!s.buildId) setFocusBuildObj(null);
      if (s.tab === 'builds' && (s.buildFilter.role || s.buildFilter.type)) {
        setBuildFilter({ ...s.buildFilter, key: Date.now() });
      }
      setMakerInitial(s.makerInitial);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const moreActive = tab !== 'home' && !PRIMARY_TABS.includes(tab);
  // Close the "More" menu on a click outside it or on Escape.
  useEffect(() => {
    if (!moreOpen) return undefined;
    const onDown = (e) => !e.target.closest('.mainnav-more') && setMoreOpen(false);
    const onKey = (e) => e.key === 'Escape' && setMoreOpen(false);
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [moreOpen]);

  const favorites = useFavorites();
  const challenges = useChallenges({
    killerCount: data?.killers?.length || 45,
    customBuilds: favorites.custom.length,
  });
  const nav = useMemo(
    () => ({
      showCombos: (perkId) => {
        setComboPerkState(perkId);
        setFocusBuildId(null);
        setFocusBuildObj(null);
        setTabState('combos');
        pushUrl({ tab: 'combos', perkId });
        window.scrollTo(0, 0);
      },
      favorites,
    }),
    [favorites, pushUrl],
  );

  const load = useCallback(() => {
    let cancelled = false;
    loadData()
      .then(async (d) => {
        if (cancelled) return;
        const perks = withPerkStats(withOwners(withTags(d.perks), d), d.stats);
        let offerings = d.offerings ?? [];
        if (offerings.length) {
          const { withOfferingRatings } = await import('./lib/offeringRatings.js');
          offerings = withOfferingRatings(offerings).map((o) => ({ ...o, role: o.rating.role ?? o.role }));
        }
        const baseData = { ...d, perks, offerings, extraLoaded: !d.extraDataUrl };
        // In local dev mode (no precomputed/repaired builds), load repair/generator dynamically.
        if (!d.curatedRepaired) {
          const { repairBuild } = await import('./lib/patchAware.js');
          liveRepairRef.current = repairBuild;
        }
        if (!Array.isArray(d.generatedBuilds)) {
          const { generateBuilds } = await import('./lib/generator.js');
          liveGeneratedRef.current = generateBuilds;
        }
        if (!cancelled) setData(baseData);

        if (d.extraDataUrl) {
          Promise.all([loadExtraData(d.extraDataUrl), import('./lib/offeringRatings.js')])
            .then(([extra, { withOfferingRatings }]) => {
              if (cancelled || !extra) return;
              const ratedOfferings = withOfferingRatings(extra.offerings ?? []).map((o) => ({
                ...o,
                role: o.rating.role ?? o.role,
              }));
              setData((prev) =>
                prev
                  ? {
                      ...prev,
                      addons: extra.addons ?? prev.addons,
                      offerings: ratedOfferings,
                      stats: mergeExtraStats(prev.stats, extra),
                      extraLoaded: true,
                    }
                  : prev,
              );
            })
            .catch(() => {});
        }
      })
      .catch(() =>
        setError(
          STATIC
            ? 'Could not load the data. Please reload the page.'
            : 'Could not reach the local server. Is “npm run dev” running?',
        ),
      );
    return () => {
      cancelled = true;
    };
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
      const repairFn = !data.curatedRepaired ? liveRepairRef.current : null;
      const r = data.extraLoaded && repairFn ? repairFn(resolveBuild(b, data), data, data.changes) : resolveBuild(b, data);
      const missing = data.extraLoaded
        ? r.missing
        : r.missing.filter((m) => !m.startsWith('add-on:') && !m.startsWith('offering:'));
      let rating = scoreBuild(r.resolved.perks, b.role, b.playstyles, {
        stats: data.stats,
        killerId: r.resolved.killer?.id,
      });
      // Before extra-data arrives, use the exact build-time score so Home never shifts numbers.
      const pre = !data.extraLoaded ? data.preScores?.[b.id] : null;
      if (pre) {
        rating = {
          ...rating,
          score: pre[0],
          community: pre[1] != null ? { ...(rating.community ?? {}), points: pre[1] } : rating.community,
        };
      }
      const build = {
        ...r,
        missing,
        rating,
        newPerks: r.resolved.perks.filter((p) => p && fresh.has(p.id)).map((p) => p.name),
      };
      return { ...build, nl: buildStats(build, data.stats) };
    });
  }, [data]);

  // Automatically generated builds: precomputed at build time on the public site,
  // recalculated live in local mode.
  const allBuilds = useMemo(() => {
    if (!data) return [];
    if (Array.isArray(data.generatedBuilds)) {
      const generated = data.generatedBuilds.map((b) => {
        const r = resolveBuild(b, data);
        const missing = data.extraLoaded
          ? r.missing
          : r.missing.filter((m) => !m.startsWith('add-on:') && !m.startsWith('offering:'));
        let rating = scoreBuild(r.resolved.perks, b.role, b.playstyles, {
          stats: data.stats,
          killerId: r.resolved.killer?.id,
        });
        const pre = !data.extraLoaded ? data.preScores?.[b.id] : null;
        if (pre) {
          rating = {
            ...rating,
            score: pre[0],
            community: pre[1] != null ? { ...(rating.community ?? {}), points: pre[1] } : rating.community,
          };
        }
        const build = { ...r, missing, rating };
        return { ...build, nl: buildStats(build, data.stats) };
      });
      return [...builds, ...generated];
    }
    const genFn = liveGeneratedRef.current;
    const generated = genFn ? genFn(data, builds, data.changes).map((b) => ({ ...b, nl: buildStats(b, data.stats) })) : [];
    return [...builds, ...generated];
  }, [data, builds]);

  // Resolve a build modal opened via URL (?build=...) or kept in sync when extra-data finishes loading.
  const focusBuild = useMemo(() => {
    if (!focusBuildId) return focusBuildObj;
    return allBuilds.find((b) => b.id === focusBuildId) ?? focusBuildObj;
  }, [focusBuildId, focusBuildObj, allBuilds]);

  useEffect(() => {
    if (!focusBuild) return undefined;
    const close = (e) => e.key === 'Escape' && openBuildModal(null);
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [focusBuild, openBuildModal]);

  // Your own builds from the Build maker, rated the same way.
  const customBuilds = useMemo(() => {
    if (!data) return [];
    return favorites.custom.map((b) => {
      const r = resolveBuild(b, data);
      const build = {
        ...r,
        rating: scoreBuild(r.resolved.perks, b.role, b.playstyles, { stats: data.stats, killerId: r.resolved.killer?.id }),
      };
      return { ...build, nl: buildStats(build, data.stats) };
    });
  }, [data, favorites.custom]);

  const patch = data?.meta?.patch;
  const waitingExtra = Boolean(data && !data.extraLoaded && NEEDS_EXTRA.has(tab));

  return (
    <NavContext.Provider value={nav}>
      {patch && showBanner && (
        <div className="announce">
          <button className="announce-link" onClick={() => setTab('patchnotes')}>
            Patch {patch} is live. See which builds got buffed and nerfed <span aria-hidden="true">→</span>
          </button>
          <button className="announce-close" onClick={() => setShowBanner(false)} aria-label="Hide this message">
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
              <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
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
          <nav className="mainnav" aria-label="Main menu">
            {PRIMARY_TABS.map((id) => {
              const t = ALL_TABS.find((x) => x.id === id);
              return (
                <button
                  key={id}
                  className={`mainnav-link ${tab === id ? 'active' : ''}`}
                  aria-current={tab === id ? 'page' : undefined}
                  onClick={() => setTab(id)}
                >
                  {t.label}
                </button>
              );
            })}
            <details className="mainnav-more" open={moreOpen} onToggle={(e) => setMoreOpen(e.currentTarget.open)}>
              <summary className={`mainnav-link ${moreActive ? 'active' : ''}`}>
                {moreActive ? ALL_TABS.find((x) => x.id === tab).label : 'More'}
                <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
                  <path d="M1.5 3.5 5 7l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
                </svg>
              </summary>
              <div className="mainnav-menu">
                {TAB_GROUPS.map((g) => {
                  const rest = g.tabs.filter((t) => !PRIMARY_TABS.includes(t.id) && t.id !== 'home');
                  if (!rest.length) return null;
                  return (
                    <div key={g.label} className="mainnav-group">
                      <p className="mainnav-group-label">{g.label}</p>
                      {rest.map((t) => (
                        <button
                          key={t.id}
                          className={`mainnav-item ${tab === t.id ? 'active' : ''}`}
                          aria-current={tab === t.id ? 'page' : undefined}
                          onClick={() => {
                            setTab(t.id);
                            setMoreOpen(false);
                          }}
                        >
                          <strong>{t.label}</strong>
                          <span>{t.desc}</span>
                        </button>
                      ))}
                    </div>
                  );
                })}
              </div>
            </details>
          </nav>
          <DataStatus meta={data?.meta} initialStatus={data?.status} onRefreshed={load} />
        </header>

        <main>
          {error && <p className="error">{error}</p>}
          {!data && !error && <HomeSkeleton />}
          {waitingExtra && <p className="muted">Loading game data…</p>}
          {data && tab === 'home' && (
            <Home data={data} builds={allBuilds} onOpen={setTab} onShowBuild={openBuildModal} />
          )}
          <Suspense fallback={<p className="muted">Loading…</p>}>
            {data && !waitingExtra && tab === 'patchnotes' && (
              <PatchNotes data={data} builds={allBuilds} onShowBuild={openBuildModal} />
            )}
            {data && !waitingExtra && tab === 'builds' && (
              <BuildList key={buildFilter.key} initial={buildFilter} builds={allBuilds} killers={data.killers} favorites={favorites} />
            )}
            {data && !waitingExtra && tab === 'combos' && (
              <Combos data={data} builds={allBuilds} perkId={comboPerk} setPerkId={setComboPerk} favorites={favorites} />
            )}
            {data && !waitingExtra && tab === 'maker' && (
              <BuildMaker
                key={makerInitial ? JSON.stringify(makerInitial.perks) : 'maker'}
                data={data}
                builds={builds}
                favorites={favorites}
                initial={makerInitial}
                onShared={() => setTab('community')}
              />
            )}
            {data && !waitingExtra && tab === 'community' && (
              <Community
                data={data}
                favorites={favorites}
                picks={allBuilds.filter((b) => b.type === 'creator')}
                onOpenMaker={() => setTab('maker')}
              />
            )}
            {data && !waitingExtra && tab === 'challenges' && <Challenges data={data} curated={builds} store={challenges} />}
            {tab === 'achievements' && <Achievements store={challenges} />}
            {data && !waitingExtra && tab === 'favorites' && (
              <Favorites builds={allBuilds} customBuilds={customBuilds} favorites={favorites} perks={data.perks} />
            )}
            {data && !waitingExtra && tab === 'perks' && <PerkList perks={data.perks} stats={data.stats} />}
            {data && !waitingExtra && tab === 'ranking' && <PerkRanking perks={data.perks} stats={data.stats} />}
            {data && !waitingExtra && tab === 'killers' && (
              <CharacterList characters={data.killers} perksById={perksById} addons={data.addons} stats={data.stats} role="killer" />
            )}
            {data && !waitingExtra && tab === 'survivors' && (
              <CharacterList characters={data.survivors} perksById={perksById} stats={data.stats} role="survivor" />
            )}
            {data && !waitingExtra && tab === 'items' && <ItemList items={data.items} addons={data.addons} />}
            {data && !waitingExtra && tab === 'offerings' && <OfferingList offerings={data.offerings} />}
          </Suspense>
        </main>

        {focusBuild && (
          <div className="modal-backdrop" onClick={() => openBuildModal(null)}>
            <div className="modal" role="dialog" aria-modal="true" aria-label={focusBuild.name} onClick={(e) => e.stopPropagation()}>
              <button className="modal-close" onClick={() => openBuildModal(null)} aria-label="Close">
                ✕
              </button>
              <Suspense fallback={<p className="muted">Loading build…</p>}>
                <BuildCard build={focusBuild} favorites={favorites} />
              </Suspense>
            </div>
          </div>
        )}

        <AchievementToasts store={challenges} />
      </div>
      <footer className="site-footer">
        <div className="footer-glow" aria-hidden="true" />
        <div className="footer-inner">
          <div className="footer-brand">
            <div className="footer-brand-row">
              <img className="footer-mark" src="/logo.svg" alt="" width="40" height="40" />
              <span className="footer-name">{SITE_NAME}</span>
            </div>
            <p className="footer-tagline">Builds, perk combos and community stats for Dead by Daylight. Free, no account needed.</p>
            <div className="footer-status">
              {patch && (
                <span className="footer-pill">
                  <span className="footer-dot" aria-hidden="true" /> Patch {patch}
                </span>
              )}
              {data?.stats && <span className="footer-pill">NightLight stats · {periodLabel(data.stats)}</span>}
            </div>
          </div>
          <nav className="footer-cols" aria-label="Footer">
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
          </nav>
        </div>
        <div className="footer-bottom">
          <p className="footer-legal">
            Game data and icons from the{' '}
            <a href="https://deadbydaylight.wiki.gg" target="_blank" rel="noreferrer">
              Dead by Daylight Wiki
            </a>{' '}
            (CC BY-NC-SA 3.0). Community stats from{' '}
            <a href="https://nightlight.gg" target="_blank" rel="noreferrer">NightLight</a>. {SITE_NAME} is a free,
            non-commercial fan project and is not affiliated with or endorsed by Behaviour Interactive. Dead by Daylight
            is a trademark of Behaviour Interactive Inc.
          </p>
          <button className="footer-top" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
            Back to top ↑
          </button>
        </div>
        <div className="footer-word" aria-hidden="true">DBD Toolbox</div>
      </footer>
    </NavContext.Provider>
  );
}

import { useCallback, useEffect, useMemo, useState } from 'react';
import BuildCard from './BuildCard.jsx';
import { resolveBuild, scoreBuild } from '../lib/builds.js';
import { fetchCommunityBuilds, voteOnBuild, reportCommunityBuild, toBuildCardShape } from '../lib/community.js';
import { analyseBuild, analysisSortKey, buildStats, periodLabel } from '../lib/nlStats.js';

const VERDICT_TEXT = { strong: 'Above average', average: 'About average', weak: 'Below average', unknown: 'Not enough data' };
const signed = (v) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}`;

/** NightLight verdict for one community build (see analyseBuild in nlStats.js). */
function StatCheck({ a }) {
  if (!a) return null;
  const k = a.killer;
  return (
    <div className={`stat-check v-${a.verdict}`}>
      <div className="stat-check-head">
        <span className="stat-check-title">NightLight check</span>
        <span className={`stat-verdict ${a.verdict}`}>{VERDICT_TEXT[a.verdict]}</span>
      </div>
      {a.delta != null && (
        <p className="stat-check-main">
          <strong>{a.rate.toFixed(1)}%</strong> {a.rateLabel}{' '}
          <span className={a.delta >= 0 ? 'good' : 'bad'}>
            ({signed(a.delta)} vs {a.vsKiller ? `${k.name}'s average` : 'average'})
          </span>
          <span className="muted">
            {a.source === 'exact' ? ` · this exact build, ${a.games} games` : ' · average of its perks'}
            {a.confidence === 'low' && ' · little data, take with salt'}
          </span>
        </p>
      )}
      {k && (
        <p className="muted small">
          {k.name}: {k.killRate.toFixed(1)}% kill rate
          {k.vsAverage != null && <span className={k.vsAverage >= 0 ? 'good' : 'bad'}> ({signed(k.vsAverage)} vs all killers)</span>}
          {k.pickRate != null && `, picked in ${k.pickRate.toFixed(1)}% of games`}
        </p>
      )}
      {a.swap ? (
        <p className="small stat-swap">
          Weakest perk: <strong>{a.swap.out.name}</strong> ({a.swap.out.rate.toFixed(1)}%). Try{' '}
          <strong>{a.swap.in.name}</strong> instead ({a.swap.in.rate.toFixed(1)}% {a.rateLabel}, used in{' '}
          {a.swap.in.usage.toFixed(0)}% of games).
        </p>
      ) : (
        a.weakest && (
          <p className="small muted">
            Weakest perk: <strong>{a.weakest.name}</strong> ({a.weakest.rate.toFixed(1)}% {a.rateLabel}).
          </p>
        )
      )}
      {a.unrated?.length > 0 && <p className="small muted">Too rare on NightLight to judge: {a.unrated.join(', ')}.</p>}
      {!a.perkData && <p className="small muted">No perk stats imported yet, so only the killer is judged.</p>}
    </div>
  );
}

/** Thumbs up / down buttons with live counts. */
function VoteBar({ build, onChange, favorites }) {
  const [busy, setBusy] = useState(false);
  const [reported, setReported] = useState(false);
  const [confirmReport, setConfirmReport] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(null);

  async function vote(value) {
    setBusy(true);
    setError(null);
    try {
      // Clicking your current vote again removes it.
      onChange(build.id, await voteOnBuild(build.id, build.myVote === value ? 0 : value));
    } catch (err) {
      setError(err.message);
    }
    setBusy(false);
  }

  async function report() {
    try {
      await reportCommunityBuild(build.id);
      setReported(true);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="vote-bar">
      <button className={`vote up ${build.myVote === 1 ? 'on' : ''}`} disabled={busy} onClick={() => vote(1)} title="Thumbs up">
        👍 {build.up}
      </button>
      <button className={`vote down ${build.myVote === -1 ? 'on' : ''}`} disabled={busy} onClick={() => vote(-1)} title="Thumbs down">
        👎 {build.down}
      </button>
      <span className={`vote-score ${build.score > 0 ? 'pos' : build.score < 0 ? 'neg' : ''}`}>
        {build.score > 0 ? '+' : ''}
        {build.score}
      </span>
      <div className="grow" />
      <button
        className="small"
        disabled={saved}
        title="Save a copy in your favourites"
        onClick={() => {
          favorites.saveCustom({
            id: `saved-${build.id}`,
            name: build.name,
            role: build.role,
            type: 'custom',
            killer: build.killer,
            playstyles: build.playstyles,
            perks: build.perks,
            item: build.item,
            itemAddons: build.itemAddons,
            addons: build.addons,
            offering: build.offering,
            why: build.why,
          });
          setSaved(true);
        }}
      >
        {saved ? '★ Saved' : '☆ Save'}
      </button>
      {reported ? (
        <span className="muted small">Reported, thanks</span>
      ) : confirmReport ? (
        <span className="small">
          Report as offensive/spam?{' '}
          <button className="link-button small" onClick={report}>
            Yes
          </button>{' '}
          <button className="link-button small" onClick={() => setConfirmReport(false)}>
            No
          </button>
        </span>
      ) : (
        <button className="link-button small" onClick={() => setConfirmReport(true)} title="Report an offensive or spam build">
          Report
        </button>
      )}
      {error && <span className="error small">{error}</span>}
    </div>
  );
}

export default function Community({ data, favorites, onOpenMaker }) {
  const [role, setRole] = useState('survivor');
  const [killer, setKiller] = useState('');
  const [sort, setSort] = useState('top');
  const [builds, setBuilds] = useState(null);
  const [error, setError] = useState(null);

  // "Best stats" is sorted here in the browser; the server only knows top/new.
  const fetchSort = sort === 'new' ? 'new' : 'top';
  const load = useCallback(() => {
    setError(null);
    fetchCommunityBuilds({ role, killer, sort: fetchSort })
      .then(setBuilds)
      .catch((err) => {
        setBuilds([]);
        setError(err.message);
      });
  }, [role, killer, fetchSort]);
  useEffect(load, [load]);

  const updateVote = (id, result) =>
    setBuilds((list) => list.map((b) => (b.id === id ? { ...b, ...result } : b)).filter((b) => !result.hidden || b.id !== id));

  const perksById = useMemo(() => Object.fromEntries(data.perks.map((p) => [p.id, p])), [data]);

  // Link community builds to the game data, rate them like every other build,
  // and check them against NightLight's community numbers.
  const analysed = useMemo(
    () =>
      (builds ?? []).map((b) => {
        const r = resolveBuild(toBuildCardShape(b), data);
        const build = { ...r, rating: scoreBuild(r.resolved.perks, b.role, b.playstyles) };
        build.nl = buildStats(build, data.stats);
        return { ...build, analysis: analyseBuild(build, data.stats, perksById) };
      }),
    [builds, data, perksById],
  );
  const shown = useMemo(
    () => (sort === 'stats' ? [...analysed].sort((a, b) => analysisSortKey(b.analysis) - analysisSortKey(a.analysis)) : analysed),
    [analysed, sort],
  );
  const judged = analysed.filter((b) => b.analysis?.delta != null);
  const beat = judged.filter((b) => b.analysis.verdict === 'strong').length;

  return (
    <section>
      <div className="community-intro card">
        <div>
          <h2>👥 Community builds</h2>
          <p className="muted small">
            Builds shared by players. Give them a 👍 or 👎 — one vote per person. Share your own from the Build maker.
          </p>
        </div>
        <button className="primary" onClick={onOpenMaker}>
          📤 Share a build
        </button>
      </div>

      <div className="toolbar">
        <div className="segmented">
          {['survivor', 'killer'].map((r) => (
            <button
              key={r}
              className={role === r ? 'active' : ''}
              onClick={() => {
                setRole(r);
                setKiller('');
              }}
            >
              {r === 'survivor' ? 'Survivor' : 'Killer'}
            </button>
          ))}
        </div>
        {role === 'killer' && (
          <select value={killer} onChange={(e) => setKiller(e.target.value)}>
            <option value="">All killers</option>
            {data.killers.map((k) => (
              <option key={k.id} value={k.name}>
                {k.name}
              </option>
            ))}
          </select>
        )}
        <div className="segmented">
          <button className={sort === 'top' ? 'active' : ''} onClick={() => setSort('top')}>
            👍 Top rated
          </button>
          <button className={sort === 'new' ? 'active' : ''} onClick={() => setSort('new')}>
            🆕 Newest
          </button>
          {data.stats && (
            <button
              className={sort === 'stats' ? 'active' : ''}
              onClick={() => setSort('stats')}
              title="Best NightLight numbers first"
            >
              Best stats
            </button>
          )}
        </div>
        <button onClick={load} title="Reload">
          ⟳
        </button>
      </div>

      {error && <p className="error">Could not load community builds: {error}</p>}
      {builds === null && <p className="muted">Loading community builds…</p>}
      {builds && !error && shown.length === 0 && (
        <p className="muted">No community builds here yet. Be the first: make one in the Build maker and share it!</p>
      )}

      {data.stats && shown.length > 0 && (
        <p className="muted small stat-summary">
          {judged.length > 0
            ? `NightLight check: ${beat} of ${judged.length} builds do clearly better than average (${role === 'killer' ? 'kill' : 'escape'} rate).`
            : role === 'killer'
              ? 'NightLight check: only killer kill rates are imported, no perk stats yet.'
              : 'NightLight check: no survivor perk stats imported yet.'}{' '}
          From matches uploaded to NightLight.gg, {periodLabel(data.stats)}. A guide, not official numbers.
        </p>
      )}

      <div className="build-grid">
        {shown.map((b) => (
          <BuildCard
            key={b.id}
            build={b}
            footer={
              <>
                <StatCheck a={b.analysis} />
                <VoteBar build={b} onChange={updateVote} favorites={favorites} />
              </>
            }
          />
        ))}
      </div>
    </section>
  );
}

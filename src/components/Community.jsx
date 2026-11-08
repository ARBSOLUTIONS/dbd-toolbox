import { useCallback, useEffect, useMemo, useState } from 'react';
import BuildCard from './BuildCard.jsx';
import { resolveBuild, scoreBuild } from '../lib/builds.js';
import { fetchCommunityBuilds, voteOnBuild, reportCommunityBuild, toBuildCardShape } from '../lib/community.js';

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

  const load = useCallback(() => {
    setError(null);
    fetchCommunityBuilds({ role, killer, sort })
      .then(setBuilds)
      .catch((err) => {
        setBuilds([]);
        setError(err.message);
      });
  }, [role, killer, sort]);
  useEffect(load, [load]);

  const updateVote = (id, result) =>
    setBuilds((list) => list.map((b) => (b.id === id ? { ...b, ...result } : b)).filter((b) => !result.hidden || b.id !== id));

  // Link community builds to the game data and rate them like every other build.
  const shown = useMemo(
    () =>
      (builds ?? []).map((b) => {
        const r = resolveBuild(toBuildCardShape(b), data);
        return { ...r, rating: scoreBuild(r.resolved.perks, b.role, b.playstyles) };
      }),
    [builds, data],
  );

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

      <div className="build-grid">
        {shown.map((b) => (
          <BuildCard key={b.id} build={b} footer={<VoteBar build={b} onChange={updateVote} favorites={favorites} />} />
        ))}
      </div>
    </section>
  );
}

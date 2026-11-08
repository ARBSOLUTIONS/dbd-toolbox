import { useMemo } from 'react';
import { iconSrc } from '../lib/format.js';
import { analysePatch } from '../lib/patchImpact.js';
import { ScoreBadge } from './BuildCard.jsx';

function MiniBuild({ build, onShow }) {
  return (
    <button className="mini-build" onClick={() => onShow(build)}>
      <div className="mini-build-perks">
        {build.resolved.perks.map((p, i) =>
          p ? <img key={i} src={iconSrc(p.icon)} alt={p.name} title={p.name} loading="lazy" /> : <span key={i} className="slot-empty" />,
        )}
      </div>
      <div className="grow">
        <strong>{build.name}</strong>
        <span className="muted small">{build.role === 'killer' ? build.killer ?? 'Any killer' : 'Survivor'}</span>
      </div>
      <ScoreBadge score={build.rating?.score ?? 0} />
    </button>
  );
}

export default function Home({ data, builds, onOpen, onShowBuild }) {
  const record = data.patchNotes?.[0] ?? data.changes ?? null;
  const analysis = useMemo(() => analysePatch(record, data, builds), [record, data, builds]);

  const top = (role) =>
    builds
      .filter((b) => b.role === role && b.type === 'meta' && !b.missing?.length)
      .sort((a, b) => (b.rating?.score ?? 0) - (a.rating?.score ?? 0))
      .slice(0, 3);
  const beginner = builds.filter((b) => b.type === 'beginner').length;
  const patch = data.meta?.patch;
  const nextChapter = (data.meta?.announcements ?? []).find((a) => a.date >= new Date().toISOString().slice(0, 10));

  const patchSummary = [
    analysis.counts.buff && `${analysis.counts.buff} buff${analysis.counts.buff === 1 ? '' : 's'}`,
    analysis.counts.nerf && `${analysis.counts.nerf} nerf${analysis.counts.nerf === 1 ? '' : 's'}`,
    analysis.counts.rework + analysis.counts.mixed && `${analysis.counts.rework + analysis.counts.mixed} reworked`,
    analysis.newPerks.length && `${analysis.newPerks.length} new perk${analysis.newPerks.length === 1 ? '' : 's'}`,
    record?.killers?.added?.length && `new killer: ${record.killers.added.join(', ')}`,
    record?.offerings?.added?.length && `${record.offerings.added.length} new offerings`,
  ].filter(Boolean);

  const showcase = top('killer')[0] ?? top('survivor')[0];

  return (
    <section className="home">
      <div className="home-hero frame">
        <i className="corner tl" aria-hidden="true" />
        <i className="corner tr" aria-hidden="true" />
        <i className="corner bl" aria-hidden="true" />
        <i className="corner br" aria-hidden="true" />
        <div className="home-hero-text">
          <p className="eyebrow">Dead by Daylight build toolbox{patch ? ` · patch ${patch}` : ''}</p>
          <h2>Find a build that wins. Or one that’s just fun.</h2>
          <p className="home-lead">
            Rated killer and survivor builds, a build maker that scores your perks, community picks, patch impact and
            challenges. Updated with every patch.
          </p>
          <div className="home-cta">
            <button className="primary big" onClick={() => onOpen('builds')}>
              Browse builds
            </button>
            <button className="light big" onClick={() => onOpen('maker')}>
              Make your own
            </button>
            <button className="ghost big" onClick={() => onOpen('challenges')}>
              Random challenge <span aria-hidden="true">→</span>
            </button>
          </div>
        </div>
        {showcase && (
          <button className="home-hero-art" onClick={() => onShowBuild(showcase)} aria-label={`Open build: ${showcase.name}`}>
            <span className="art-label">Top rated · {showcase.killer ?? (showcase.role === 'killer' ? 'Any killer' : 'Survivor')}</span>
            <span className="art-loadout">
              {showcase.resolved.perks.map((p, i) =>
                p ? (
                  <span key={i} className="art-perk">
                    <img src={iconSrc(p.icon)} alt="" width="72" height="72" />
                  </span>
                ) : (
                  <span key={i} className="art-perk empty" />
                ),
              )}
            </span>
            <span className="art-name">{showcase.name}</span>
            <span className="art-score">
              Score <strong>{showcase.rating?.score ?? 0}</strong>
            </span>
          </button>
        )}
      </div>

      <ul className="home-numbers">
        <li>
          <strong>{builds.length}</strong> Builds
        </li>
        <li>
          <strong>{data.perks.length}</strong> Perks
        </li>
        <li>
          <strong>{data.killers.length}</strong> Killers
        </li>
        <li>
          <strong>{data.survivors.length}</strong> Survivors
        </li>
      </ul>

      <div className="home-row">
        <article className="card home-patch" onClick={() => onOpen('patchnotes')} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onOpen('patchnotes')}>
          <p className="eyebrow">Latest patch</p>
          <h3>{record?.toPatch && record.fromPatch !== record.toPatch ? `${record.fromPatch} → ${record.toPatch}` : `Patch ${patch ?? '?'}`}</h3>
          <p className="muted small">{patchSummary.length ? patchSummary.join(' · ') : 'No balance changes detected.'}</p>
          {analysis.builds.length > 0 && (
            <p className="small">
              <strong>{analysis.builds.length}</strong> builds affected by buffs and nerfs.
            </p>
          )}
          {nextChapter && (
            <p className="small home-next">
              Next: <strong>{nextChapter.name}</strong> ({nextChapter.kind}) on{' '}
              {new Date(`${nextChapter.date}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}
            </p>
          )}
          <span className="link-button">See the patch notes <span aria-hidden="true">→</span></span>
        </article>

        <article className="card home-beginner" onClick={() => onOpen('builds', { type: 'beginner' })} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onOpen('builds', { type: 'beginner' })}>
          <p className="eyebrow">New to the fog?</p>
          <h3>Beginner builds</h3>
          <p className="muted small">
            {beginner} easy builds made from General perks plus one or two perks from free characters. No DLC needed to
            get started.
          </p>
          <span className="link-button">Show beginner builds <span aria-hidden="true">→</span></span>
        </article>
      </div>

      <div className="home-row">
        {['survivor', 'killer'].map((role) => (
          <div key={role} className="card home-top">
            <div className="home-top-head">
              <h3>{role === 'survivor' ? 'Top survivor builds' : 'Top killer builds'}</h3>
              <button className="link-button small" onClick={() => onOpen('builds', { role })}>
                All →
              </button>
            </div>
            {top(role).map((b) => (
              <MiniBuild key={b.id} build={b} onShow={onShowBuild} />
            ))}
          </div>
        ))}
      </div>

    </section>
  );
}

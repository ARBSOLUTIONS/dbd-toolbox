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
      <ScoreBadge score={build.rating?.score ?? 0} community={build.rating?.community} />
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

  const patchLine = [
    patchSummary.length ? patchSummary.join(', ') : 'No balance changes detected',
    analysis.builds.length ? `${analysis.builds.length} builds affected` : null,
  ].filter(Boolean).join('. ');

  return (
    <section className="home2">
      <div className="h2-hero">
        <div className="h2-hero-text">
          <h2 className="h2-title">Find a build that wins. Or one that’s just fun.</h2>
          <p className="h2-lead">
            {builds.length} rated builds for killers and survivors, every one of the {data.perks.length} perks, and a build maker
            that scores your own loadout{patch ? ` for patch ${patch}` : ''}.
          </p>
          <div className="h2-cta">
            <button className="h2-btn primary" onClick={() => onOpen('builds')}>
              Browse builds
            </button>
            <button className="h2-btn" onClick={() => onOpen('maker')}>
              Make your own
            </button>
          </div>
        </div>

        {showcase && (
          <button className="h2-loadout" onClick={() => onShowBuild(showcase)} aria-label={`Open build: ${showcase.name}`}>
            <span className="h2-diamonds">
              {showcase.resolved.perks.map((p, i) => (
                <span key={i} className={`h2-diamond d${i}`}>
                  {p && <img src={iconSrc(p.icon)} alt="" width="76" height="76" />}
                </span>
              ))}
            </span>
            <span className="h2-loadout-meta">
              <span className="h2-loadout-name">{showcase.name}</span>
              <span className="h2-loadout-sub">
                Highest rated {showcase.role === 'killer' ? `for ${showcase.killer ?? 'any killer'}` : 'survivor build'}, score {showcase.rating?.score ?? 0}
              </span>
            </span>
          </button>
        )}
      </div>

      <button className="h2-patch" onClick={() => onOpen('patchnotes')}>
        <strong>{record?.toPatch && record.fromPatch !== record.toPatch ? `Patch ${record.fromPatch} to ${record.toPatch}` : `Patch ${patch ?? '?'}`}</strong>
        <span>{patchLine}.</span>
        {nextChapter && (
          <span className="h2-patch-next">
            {nextChapter.name} arrives {new Date(`${nextChapter.date}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}
          </span>
        )}
      </button>

      <div className="h2-lists">
        {['survivor', 'killer'].map((role) => (
          <div key={role} className="h2-list">
            <div className="h2-list-head">
              <h3>{role === 'survivor' ? 'Top survivor builds' : 'Top killer builds'}</h3>
              <button className="h2-link" onClick={() => onOpen('builds', { role })}>
                See all
              </button>
            </div>
            {top(role).map((b) => (
              <MiniBuild key={b.id} build={b} onShow={onShowBuild} />
            ))}
          </div>
        ))}
      </div>

      <div className="h2-more">
        <button onClick={() => onOpen('builds', { type: 'beginner' })}>
          <strong>New to the game?</strong>
          <span>{beginner} beginner builds that need no paid characters.</span>
        </button>
        <button onClick={() => onOpen('community')}>
          <strong>Community builds</strong>
          <span>Builds shared by players and picked by creators.</span>
        </button>
        <button onClick={() => onOpen('challenges')}>
          <strong>Random challenge</strong>
          <span>Roll a loadout and see if you can win with it.</span>
        </button>
      </div>
    </section>
  );
}

import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { iconSrc } from '../lib/format.js';
import { PLAYSTYLES } from '../lib/tags.js';
import ScoreBreakdown from './ScoreBreakdown.jsx';

export function Slot({ entity, fallback, big, showOwner }) {
  const owner = showOwner && entity ? entity.owner ?? null : undefined;
  const [tip, setTip] = useState(null);
  const show = (e) => {
    if (!entity?.description) return;
    const r = e.currentTarget.getBoundingClientRect();
    setTip({ x: r.left + r.width / 2, top: r.top, bottom: r.bottom });
  };
  return (
    <div
      className={`slot ${big ? 'slot-big' : ''}`}
      tabIndex={entity?.description ? 0 : undefined}
      onMouseEnter={show}
      onMouseLeave={() => setTip(null)}
      onFocus={show}
      onBlur={() => setTip(null)}
      title={entity ? undefined : fallback}
    >
      {entity ? <img src={iconSrc(entity.icon ?? entity.portrait)} alt="" loading="lazy" /> : <div className="slot-empty" />}
      <span>{entity?.name ?? fallback ?? '—'}</span>
      {owner !== undefined && (
        <span className={`slot-owner ${owner ? '' : 'general'}`}>
          {owner?.portrait && <img src={iconSrc(owner.portrait)} alt="" loading="lazy" />}
          {owner ? (entity.role === 'survivor' ? owner.name.split(' ')[0] : owner.name.replace(/^The /, '')) : 'General'}
        </span>
      )}
      {tip && createPortal(<SlotTip entity={entity} pos={tip} />, document.body)}
    </div>
  );
}

/** Floating card with the full description, shown while hovering a slot. */
function SlotTip({ entity, pos }) {
  const ref = useRef(null);
  const [style, setStyle] = useState({ left: pos.x, top: pos.bottom + 8, visibility: 'hidden' });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const left = Math.min(Math.max(8, pos.x - w / 2), window.innerWidth - w - 8);
    // Prefer below the icon; go above when there is no room.
    const top = pos.bottom + 8 + h > window.innerHeight && pos.top - 8 - h > 0 ? pos.top - 8 - h : pos.bottom + 8;
    setStyle({ left, top });
  }, [pos]);
  const owner = entity.owner;
  return (
    <div className="slot-tip" ref={ref} style={style} role="tooltip">
      <div className="slot-tip-head">
        <img src={iconSrc(entity.icon ?? entity.portrait)} alt="" />
        <div>
          <strong>{entity.name}</strong>
          <div className="muted small">
            {entity.role === 'killer' ? 'Killer perk' : entity.role === 'survivor' ? 'Survivor perk' : entity.rarity ?? ''}
            {entity.character !== undefined && (owner ? ` · ${owner.name}` : entity.role ? ' · General' : '')}
          </div>
        </div>
      </div>
      {entity.identicalTo && <p className="muted small">Same effect as {entity.identicalTo}.</p>}
      <p className="slot-tip-desc">{entity.description}</p>
    </div>
  );
}

export function ScoreBadge({ score, community = null }) {
  const level = score >= 80 ? 'high' : score >= 55 ? 'mid' : 'low';
  return (
    <div
      className={`score score-${level}`}
      title={
        'Score (0-100): how well these perks fit together and with the playstyle' +
        (community ? `, ${community.points >= 0 ? '+' : ''}${community.points} from NightLight community stats (how often the perks win)` : '') +
        '. A rough guide, not a win rate.'
      }
    >
      {score}
    </div>
  );
}

/** Always-visible sum: where the score comes from (rules + NightLight). */
function ScoreLine({ rating, role, onOpen }) {
  if (!rating?.parts?.length) return null;
  const c = rating.community;
  return (
    <p className="score-line small">
      <span className="muted">Score {rating.score} =</span> rules {rating.base}
      {c ? (
        <>
          {' '}
          <span className={c.points >= 0 ? 'good' : 'bad'}>
            {c.points >= 0 ? '+' : '−'} {Math.abs(c.points)} NightLight
          </span>{' '}
          <span className="muted">({role === 'killer' ? 'kill' : 'escape'} rates of the perks vs average)</span>
        </>
      ) : (
        <span className="muted"> (no NightLight stats)</span>
      )}{' '}
      <button className="link-button small" onClick={onOpen}>
        why?
      </button>
    </p>
  );
}

/** One line with this build's NightLight numbers (see src/lib/nlStats.js). */
function NightLightLine({ nl }) {
  const diff = (rate) => (rate != null && nl.baseline != null ? rate - nl.baseline : null);
  const vs = (rate) => {
    const d = diff(rate);
    if (d == null) return null;
    return (
      <span className={d >= 0 ? 'good' : 'bad'}>
        {' '}({d >= 0 ? '+' : ''}{d.toFixed(1)} vs avg)
      </span>
    );
  };
  if (nl.exact) {
    const games = nl.rateLabel === 'kill rate' ? Math.round(nl.exact.samples / 4) : nl.exact.samples;
    return (
      <p className="small nl-line" title="From matches uploaded to NightLight.gg">
        📊 Played as-is on NightLight{nl.exact.usage ? ` (${nl.exact.usage}% of games)` : ''}: {nl.exact.rate?.toFixed(1)}%{' '}
        {nl.rateLabel}
        {vs(nl.exact.rate)} over {games} games
      </p>
    );
  }
  return (
    <p className="small nl-line muted" title="Average of the four perks, from matches uploaded to NightLight.gg">
      📊 Perks used in {nl.avgUsage.toFixed(1)}% of games on average
      {nl.avgRate != null && (
        <>
          {' '}· {nl.avgRate.toFixed(1)}% {nl.rateLabel} with them{vs(nl.avgRate)}
        </>
      )}
    </p>
  );
}

export default function BuildCard({ build, favorites, footer }) {
  const [open, setOpen] = useState(false);
  const { resolved, rating } = build;
  const labels = PLAYSTYLES[build.role];
  const changedPerks = (build.patchNotes ?? []).filter((n) => n.kind === 'changed').map((n) => n.perk);
  // At most one status badge, most important first.
  const status = build.patchNotes?.some((n) => n.from || n.kind === 'dropped')
    ? { className: 'badge-updated', label: `🔄 Updated for ${build.patch ?? 'new patch'}`, title: 'Fixed automatically after a patch' }
    : changedPerks.length
    ? { className: 'badge-changed', label: '⚠ Perk changed', title: `Changed in patch ${build.patch ?? ''}: ${changedPerks.join(', ')}` }
    : build.newPerks?.length
    ? { className: 'badge-new', label: '✨ New perk', title: `New perks: ${build.newPerks.join(', ')}` }
    : build.variant === 'off-meta'
    ? { className: 'badge-offmeta', label: 'Off-meta', title: 'Less common perks' }
    : null;

  return (
    <article className={`card build-card type-${build.type}`}>
      <header className="build-head">
        <div>
          <h3>{build.name}</h3>
          <p className="build-sub">
            {[build.role === 'killer' ? build.killer ?? 'Any killer' : null, ...build.playstyles.map((p) => labels[p] ?? p)]
              .filter(Boolean)
              .join(' · ')}
          </p>
          <div className="badges">
            <span className={`badge badge-${build.type}`}>
              {build.variant === 'spotlight'
                ? 'Perk spotlight'
                : { beginner: '🌱 Beginner', meta: 'Strong / meta', fun: 'Fun', custom: 'My build', auto: 'Auto', community: 'Community', popular: '📊 Most played' }[build.type] ??
                  build.type}
            </span>
            {status && (
              <span className={`badge ${status.className}`} title={status.title}>
                {status.label}
              </span>
            )}
          </div>
        </div>
        <div className="build-head-right">
          {favorites && (
            <button
              className={`star ${favorites.isFavorite(build.id) ? 'on' : ''}`}
              title={favorites.isFavorite(build.id) ? 'Remove from favourites' : 'Add to favourites'}
              onClick={() => favorites.toggle(build.id)}
            >
              {favorites.isFavorite(build.id) ? '★' : '☆'}
            </button>
          )}
          <ScoreBadge score={rating.score} community={rating.community} />
        </div>
      </header>

      <div className="slots">
        {resolved.perks.map((p, i) => (
          <Slot key={i} entity={p} fallback={build.perks[i]} showOwner />
        ))}
      </div>

      <div className="slots slots-small slots-compact">
        {build.role === 'survivor' ? (
          build.item && <Slot entity={resolved.item} fallback={build.item} />
        ) : (
          resolved.killer && <Slot entity={resolved.killer} />
        )}
        {resolved.addons.map((a, i) => (
          <Slot key={i} entity={a} fallback={(build.itemAddons ?? build.addons)[i]} />
        ))}
        {resolved.offering && <Slot entity={resolved.offering} />}
      </div>

      {build.why && <p className={`why ${open ? '' : 'clamp'}`}>{build.why}</p>}

      {open && changedPerks.length > 0 && (
        <p className="patch-note small">
          ⚠ Changed in patch {build.patch}: {changedPerks.join(', ')}. The perk text on hover is already up to date; the
          explanation above may be older.
        </p>
      )}

      {build.missing.length > 0 && (
        <p className="warning small">
          ⚠ Not found in current data (renamed or removed in a patch?): {build.missing.join(', ')}
        </p>
      )}

      <ScoreLine rating={rating} role={build.role} onOpen={() => setOpen(true)} />
      {build.nl && <NightLightLine nl={build.nl} />}

      {build.author && <p className="muted small community-author">by {build.author}</p>}
      {footer}

      <button className="link-button details-toggle" onClick={() => setOpen(!open)}>
        {open ? 'Show less ▴' : 'Details ▾'}
      </button>
      {open && (
        <div className="build-details">
          {build.howToPlay && (
            <>
              <h4>How to play</h4>
              <p>{build.howToPlay}</p>
            </>
          )}
          <h4>Why this score</h4>
          {rating.parts?.length ? (
            <ScoreBreakdown rating={rating} role={build.role} />
          ) : (
            <ul className="reasons">
              {rating.pros.map((r, i) => (
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
        </div>
      )}
    </article>
  );
}

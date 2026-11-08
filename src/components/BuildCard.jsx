import { useState } from 'react';
import { iconSrc } from '../lib/format.js';
import { PLAYSTYLES } from '../lib/tags.js';

export function Slot({ entity, fallback, big, showOwner }) {
  const owner = showOwner && entity ? entity.owner ?? null : undefined;
  return (
    <div
      className={`slot ${big ? 'slot-big' : ''}`}
      title={
        entity
          ? `${entity.identicalTo ? `Same effect as ${entity.identicalTo}.\n\n` : ''}${entity.description}`
          : fallback
      }
    >
      {entity ? <img src={iconSrc(entity.icon ?? entity.portrait)} alt="" loading="lazy" /> : <div className="slot-empty" />}
      <span>{entity?.name ?? fallback ?? '—'}</span>
      {owner !== undefined && (
        <span className={`slot-owner ${owner ? '' : 'general'}`} title={owner ? `Unique perk of ${owner.name}` : 'General perk, available to everyone'}>
          {owner?.portrait && <img src={iconSrc(owner.portrait)} alt="" loading="lazy" />}
          {owner ? (entity.role === 'survivor' ? owner.name.split(' ')[0] : owner.name.replace(/^The /, '')) : 'General'}
        </span>
      )}
    </div>
  );
}

export function ScoreBadge({ score }) {
  const level = score >= 80 ? 'high' : score >= 55 ? 'mid' : 'low';
  return (
    <div className={`score score-${level}`} title="Synergy score (0-100): how well these perks fit together and with the playstyle. A rough guide, not a win rate.">
      {score}
    </div>
  );
}

export default function BuildCard({ build, favorites, footer }) {
  const [open, setOpen] = useState(false);
  const { resolved, rating } = build;
  const labels = PLAYSTYLES[build.role];

  return (
    <article className={`card build-card type-${build.type}`}>
      <header className="build-head">
        <div>
          <h3>{build.name}</h3>
          <div className="badges">
            <span className={`badge badge-${build.type}`}>
              {{ beginner: '🌱 Beginner', meta: 'Strong / meta', fun: 'Fun', custom: 'My build', auto: 'Auto-generated', community: 'Community' }[build.type] ?? build.type}
            </span>
            {build.variant === 'off-meta' && <span className="badge badge-offmeta">Off-meta</span>}
            {build.variant === 'spotlight' && <span className="badge badge-offmeta">Perk spotlight</span>}
            {build.newPerks?.length > 0 && (
              <span className="badge badge-new" title={`New perks: ${build.newPerks.join(', ')}`}>
                ✨ New perk
              </span>
            )}
            <span className="badge">{build.role === 'killer' ? build.killer ?? 'Any killer' : 'Survivor'}</span>
            {build.playstyles.map((p) => (
              <span key={p} className="badge badge-style">
                {labels[p] ?? p}
              </span>
            ))}
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
          <ScoreBadge score={rating.score} />
        </div>
      </header>

      <div className="slots">
        {resolved.perks.map((p, i) => (
          <Slot key={i} entity={p} fallback={build.perks[i]} showOwner />
        ))}
      </div>

      <div className="slots slots-small">
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

      {build.why && <p className="why">{build.why}</p>}

      {build.missing.length > 0 && (
        <p className="warning small">
          ⚠ Not found in current data (renamed or removed in a patch?): {build.missing.join(', ')}
        </p>
      )}

      {build.stats && (
        <p className="muted small stats-line">
          {`${build.stats.label}: ${build.stats.value} — ${build.stats.source}, ${build.stats.date}`}
        </p>
      )}

      {build.author && <p className="muted small community-author">by {build.author}</p>}
      {footer}

      <button className="link-button" onClick={() => setOpen(!open)}>
        {open ? 'Less' : 'How to play & rating details'}
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
        </div>
      )}
    </article>
  );
}

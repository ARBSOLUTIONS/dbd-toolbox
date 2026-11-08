import { useState } from 'react';
import { SCORE_PARTS } from '../lib/builds.js';
import { PRIOR_GAMES, MIN_PERK_GAMES, POINTS_PER_RATE, MAX_POINTS } from '../lib/nlStats.js';

const signed = (v) => `${v > 0 ? '+' : ''}${v}`;

/** Bar for one part: 0..max for the rule parts, centred −max..+max for community. */
function PartBar({ part }) {
  if (part.id === 'community') {
    const w = (Math.min(Math.abs(part.value), part.max) / part.max) * 50;
    return (
      <span className="score-bar centred">
        <span className={part.value >= 0 ? 'pos' : 'neg'} style={{ width: `${w}%`, [part.value >= 0 ? 'left' : 'right']: '50%' }} />
        <i />
      </span>
    );
  }
  if (part.id === 'conflicts') {
    return (
      <span className="score-bar">
        <span className="neg" style={{ width: `${Math.min(100, (Math.abs(part.value) / 36) * 100)}%` }} />
      </span>
    );
  }
  return (
    <span className="score-bar">
      <span style={{ width: `${(Math.max(0, part.value) / part.max) * 100}%` }} />
    </span>
  );
}

function CommunityTable({ community, role }) {
  const label = role === 'killer' ? 'Kill rate' : 'Escape rate';
  return (
    <table className="stats-table score-perks">
      <thead>
        <tr>
          <th>Perk</th>
          <th>Used in</th>
          <th>{label}</th>
          <th>vs avg</th>
          <th>Games</th>
          <th title={`Difference × games ÷ (games + ${PRIOR_GAMES})`}>Strength</th>
        </tr>
      </thead>
      <tbody>
        {community.perks.map((p) => (
          <tr key={p.id}>
            <td>{p.name}</td>
            <td>{p.usage ? `${p.usage.toFixed(1)}%` : '–'}</td>
            <td>{p.rate != null ? `${p.rate.toFixed(1)}%` : '–'}</td>
            <td className={p.delta == null ? '' : p.delta >= 0 ? 'good' : 'bad'}>{p.delta != null ? signed(p.delta.toFixed(1)) : '–'}</td>
            <td>{p.count != null ? p.count.toLocaleString() : p.scope === 'killer' ? 'killer' : '–'}</td>
            <td className={p.strength == null || p.weight === 0 ? 'muted' : p.strength >= 0 ? 'good' : 'bad'}>
              {p.strength == null || p.weight === 0 ? 'not counted' : signed(p.strength.toFixed(1))}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * What the build score is made of: each part with its points and the reasons
 * behind it, the total, and (with NightLight stats) the per-perk numbers.
 * `rating` is the result of scoreBuild().
 */
export default function ScoreBreakdown({ rating, role, extraNotes = [] }) {
  const [openPart, setOpenPart] = useState(null);
  const [showHow, setShowHow] = useState(false);
  if (!rating?.parts?.length) return null;
  const capped = rating.base + (rating.community?.points ?? 0) !== rating.score;

  return (
    <div className="score-breakdown">
      {rating.parts.map((part) => (
        <div key={part.id} className={`score-part part-${part.id}`}>
          <button className="score-part-head" onClick={() => setOpenPart(openPart === part.id ? null : part.id)} aria-expanded={openPart === part.id}>
            <span className="score-part-label">{part.label}</span>
            <PartBar part={part} />
            <span className="score-part-value">
              {part.id === 'conflicts' ? (part.value ? part.value : '0') : part.id === 'community' ? signed(part.value) : part.value}
              {part.max > 0 && part.id !== 'community' && <small> / {part.max}</small>}
            </span>
          </button>
          {openPart === part.id && (
            <div className="score-part-body small">
              <p className="muted">{part.explain}</p>
              {part.notes.length > 0 ? (
                <ul className="reasons">
                  {part.notes.map((n, i) => (
                    <li key={i} className={n.good ? 'pro' : 'con'}>
                      {n.text}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted">
                  {part.id === 'conflicts'
                    ? 'No conflicts.'
                    : part.id === 'community'
                    ? 'The perks win about as often as average, so the effect is small.'
                    : 'Nothing special here.'}
                </p>
              )}
              {part.id === 'community' && rating.community && <CommunityTable community={rating.community} role={role} />}
            </div>
          )}
        </div>
      ))}
      <div className="score-total">
        <span>
          {rating.community ? (
            <>
              Rules {rating.base} {rating.community.points >= 0 ? '+' : '−'} community {Math.abs(rating.community.points)}
            </>
          ) : (
            <>Rules {rating.base}</>
          )}
          {capped && <span className="muted"> (capped to 0–100)</span>}
        </span>
        <strong>= {rating.score}</strong>
      </div>
      <p className="muted small score-hint">
        <button className="link-button small" onClick={() => setShowHow(!showHow)}>
          How does scoring work? {showHow ? '▴' : '▾'}
        </button>
      </p>
      {showHow && (
        <div className="score-how small">
          <p>
            The score (0–100) is a guide to how well the perks work together, not a win rate. It adds up:
          </p>
          <ul>
            {SCORE_PARTS.map((p) => (
              <li key={p.id}>
                <strong>{p.label}</strong>
                {p.id === 'community' ? ' (−10 to +10)' : p.max ? ` (0–${p.max})` : ''}: {p.explain}
              </li>
            ))}
          </ul>
          <p>
            Community stats in detail: each perk’s strength is its kill or escape rate minus the average perk of its
            role, × games ÷ (games + {PRIOR_GAMES}), the same number the Perk ranking uses. Perks under{' '}
            {MIN_PERK_GAMES} games count 0. The build gets {POINTS_PER_RATE} × the sum of its perks’ strength, at most
            ±{MAX_POINTS}. The numbers come from matches uploaded to NightLight.gg.
          </p>
        </div>
      )}
      {extraNotes.length > 0 && (
        <ul className="reasons">
          {extraNotes.map((r, i) => (
            <li key={i} className="pro">
              {r}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

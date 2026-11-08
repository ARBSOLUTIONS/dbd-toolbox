import { useState } from 'react';
import { useNav } from '../lib/nav.js';

const KEY = 'dbd-build-helper:patch-news-dismissed';

function readDismissed() {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

/** Banner: "what changed since the previous data refresh" (new/changed perks etc.). */
export default function PatchNews({ changes }) {
  const [dismissed, setDismissed] = useState(readDismissed);
  const [open, setOpen] = useState(false);
  const { showCombos } = useNav();
  if (!changes || dismissed === changes.date) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(KEY, changes.date);
    } catch {
      /* storage blocked: hide for this session only */
    }
    setDismissed(changes.date);
  };

  const p = changes.perks;
  const parts = [
    p.added.length && `${p.added.length} new perk${p.added.length > 1 ? 's' : ''}`,
    p.changed.length && `${p.changed.length} changed perk${p.changed.length > 1 ? 's' : ''}`,
    changes.killers.added.length && `new killer: ${changes.killers.added.join(', ')}`,
    changes.survivors.added.length && `new survivor: ${changes.survivors.added.join(', ')}`,
    changes.offerings?.added.length && `${changes.offerings.added.length} new offerings`,
    changes.addons.added.length + changes.addons.changed.length &&
      `${changes.addons.added.length + changes.addons.changed.length} new/changed add-ons`,
  ].filter(Boolean);

  const patchText =
    changes.fromPatch && changes.toPatch && changes.fromPatch !== changes.toPatch
      ? `Patch ${changes.fromPatch} → ${changes.toPatch}`
      : `Update on patch ${changes.toPatch ?? '?'}`;

  // "Name (role)" -> clickable perk name
  const perkLink = (label) => {
    const name = label.replace(/ \((survivor|killer)\)$/, '');
    const id = name.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/['’"]/g, '').replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    return (
      <button key={label} className="link-button" onClick={() => showCombos(id)}>
        {name}
      </button>
    );
  };

  return (
    <div className="patch-news card">
      <div className="patch-news-head">
        <strong>✨ {patchText}:</strong> <span>{parts.join(' · ') || 'small text changes'}</span>
        <div className="grow" />
        <button className="link-button" onClick={() => setOpen(!open)}>
          {open ? 'Hide details' : 'Details'}
        </button>
        <button className="link-button" onClick={dismiss} title="Hide until the next update">
          ✕
        </button>
      </div>
      {open && (
        <div className="patch-news-body small">
          {p.added.length > 0 && (
            <p>
              <strong>New perks</strong> (click for best combos; auto-generated builds already use them):{' '}
              {p.added.map((l, i) => [i > 0 && ', ', perkLink(l)])}
            </p>
          )}
          {p.changed.length > 0 && (
            <p>
              <strong>Changed perks:</strong> {p.changed.map((l, i) => [i > 0 && ', ', perkLink(l)])}
            </p>
          )}
          {p.removed.length > 0 && (
            <p>
              <strong>Removed perks:</strong> {p.removed.join(', ')}
            </p>
          )}
          {changes.addons.changed.length > 0 && (
            <p>
              <strong>Changed add-ons:</strong> {changes.addons.changed.slice(0, 30).join(', ')}
              {changes.addons.changed.length > 30 && ' …'}
            </p>
          )}
          {changes.addons.added.length > 0 && (
            <p>
              <strong>New add-ons:</strong> {changes.addons.added.slice(0, 30).join(', ')}
              {changes.addons.added.length > 30 && ' …'}
            </p>
          )}
          <p className="muted">
            Tip: run <code>npm test</code> to see which new perks still need hand-checked tags.
          </p>
        </div>
      )}
    </div>
  );
}

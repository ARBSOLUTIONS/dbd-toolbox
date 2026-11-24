// Public versions of the game data for dist/data/app-data.json.
//
// The site does not republish the Dead by Daylight Wiki description texts
// (CC BY-NC-SA, which conflicts with ads). The browser still computes build
// scores, tags and offering ratings, and those read the descriptions, so what
// it needs is precomputed here from the full text:
// - perks: `exhaustion` + `kwTags` (see src/lib/tags.js) and our own `text` (or null)
// - add-ons / items: `kwTags`; no description, no flavour quote
// - offerings: the star `rating`; no description, no flavour quote
// - patch records: the buff/nerf `judgement` and a clipped word `diff`
//   (src/lib/patchImpact.js shortDiff) instead of the full before/after texts
// test/publicData.test.js checks that scores stay identical.
import { isExhaustionPerk, kwTagsFor } from '../src/lib/tags.js';
import { rateOffering } from '../src/lib/offeringRatings.js';
import { judgeChange, shortDiff } from '../src/lib/patchImpact.js';
import { ownText } from './ownTexts.js';

const withoutWikiText = ({ description, quote, ...rest }) => rest;

/** Perk without the wiki description; the perk's character quote stays. */
export function toPublicPerk(perk, texts) {
  const { description, ...rest } = perk;
  return { ...rest, exhaustion: isExhaustionPerk(perk), kwTags: kwTagsFor(perk), text: ownText(perk, texts) };
}

export const toPublicItem = (x) => ({ ...withoutWikiText(x), kwTags: kwTagsFor(x) });

export const toPublicOffering = (o) => ({ ...withoutWikiText(o), rating: rateOffering(o) });

/** Keeps only the last (n < 0) or first (n > 0) |n| words, marking the cut with "…". */
const clipWords = (text, n) => {
  const w = String(text ?? '').trim().split(/\s+/).filter(Boolean);
  if (w.length <= Math.abs(n)) return w.join(' ');
  return n < 0 ? `… ${w.slice(n).join(' ')}` : `${w.slice(0, n).join(' ')} …`;
};

function publicDetail({ before, after, ...rest }) {
  if (before == null && after == null) return rest;
  const j = judgeChange(before, after);
  return {
    ...rest,
    judgement: { ...j, changes: j.changes.map((c) => ({ ...c, pre: clipWords(c.pre, -2), post: clipWords(c.post, 2) })) },
    diff: shortDiff(before, after),
  };
}

/** A changes / patch-notes record with judgements instead of the wiki texts. */
export const publicChanges = (c) =>
  c?.details
    ? { ...c, details: Object.fromEntries(Object.entries(c.details).map(([k, list]) => [k, (list ?? []).map(publicDetail)])) }
    : c;

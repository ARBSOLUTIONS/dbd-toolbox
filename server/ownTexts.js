// Our own perk texts (data/texts.json).
//
// The public site does not show the Dead by Daylight Wiki descriptions
// (CC BY-NC-SA, which conflicts with ads). Instead every perk has a text we
// wrote ourselves: { summary, facts: [...], tip, sourceHash }.
// sourceHash is the hash of the wiki description the text was written from.
// When a patch changes the wiki description, the hash no longer matches and
// the text counts as stale: the site then shows a neutral fallback line with
// a link to the wiki until someone rewrites it (node scripts/check-texts.js).
import crypto from 'node:crypto';

export const textKey = (perk) => `${perk.role}:${perk.id}`;

/** Short, stable hash of a wiki description. */
export const textHash = (description) =>
  crypto.createHash('sha256').update(String(description ?? '').replace(/\r\n/g, '\n').trim()).digest('hex').slice(0, 16);

/** The own text for a perk, or null when it is missing or stale. */
export function ownText(perk, texts) {
  const t = texts?.[textKey(perk)];
  if (!t?.summary || !Array.isArray(t.facts)) return null;
  if (t.sourceHash !== textHash(perk.description)) return null;
  return { summary: t.summary, facts: t.facts, tip: t.tip ?? '' };
}

/** Neutral one-liner shown when there is no (current) own text (shared with the app). */
export { fallbackLine } from '../src/lib/perkText.js';

/** Perks whose own text is missing or stale: { missing: [key], stale: [key] }. */
export function textStatus(perks, texts) {
  const missing = [];
  const stale = [];
  for (const p of perks) {
    const t = texts?.[textKey(p)];
    if (!t) missing.push(textKey(p));
    else if (t.sourceHash !== textHash(p.description)) stale.push(textKey(p));
  }
  return { missing, stale };
}

// ---------- Quality checks (scripts/check-texts.js, tests) ----------
const words = (s) =>
  String(s ?? '')
    .toLowerCase()
    .replace(/[’']/g, '')
    // A tier group like 20/25/30 is one value, so it counts as one word.
    .match(/[a-z0-9]+(?:[./][0-9]+)*/g) ?? [];
const numbers = (s) => String(s ?? '').match(/\d+(?:\.\d+)?/g) ?? [];
const ngrams = (list, n) => {
  const out = [];
  for (let i = 0; i + n <= list.length; i++) out.push(list.slice(i, i + n).join(' '));
  return out;
};
const wordCount = (s) => String(s ?? '').trim().split(/\s+/).filter(Boolean).length;

/** List of problems with one own text compared to its wiki description. */
export function textProblems(t, description, { copyRun = 6 } = {}) {
  const problems = [];
  if (!t.summary) problems.push('no summary');
  if (!Array.isArray(t.facts) || !t.facts.length) problems.push('no facts');
  if (!t.tip) problems.push('no tip');
  if (wordCount(t.summary) > 25) problems.push(`summary has ${wordCount(t.summary)} words (max 25)`);
  if (wordCount(t.tip) > 20) problems.push(`tip has ${wordCount(t.tip)} words (max 20)`);
  const factNumbers = new Set(numbers((t.facts ?? []).join(' ')));
  const missingNumbers = [...new Set(numbers(description))].filter((n) => !factNumbers.has(n));
  if (missingNumbers.length) problems.push(`numbers not in facts: ${missingNumbers.join(', ')}`);
  // Copy check per wiki line, so runs do not span two sentences.
  const wiki = new Set(String(description ?? '').split('\n').flatMap((line) => ngrams(words(line), copyRun)));
  const ours = [t.summary, ...(t.facts ?? []), t.tip];
  const copied = [...new Set(ours.flatMap((s) => ngrams(words(s), copyRun)).filter((g) => wiki.has(g)))];
  if (copied.length) problems.push(`copied ${copyRun}-word runs: ${copied.map((g) => `"${g}"`).join(', ')}`);
  return problems;
}

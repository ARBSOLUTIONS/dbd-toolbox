// Checks our own perk texts (data/texts.json) against the wiki descriptions
// they were written from (data/perks.json). Run: node scripts/check-texts.js
//
// For every perk it reports:
// - missing: no own text yet
// - stale:   the wiki description changed since the text was written
//            (sourceHash no longer matches), so the text must be rewritten
// - numbers: a number from the wiki text that does not appear in our facts
// - copied:  a run of 6+ words taken over literally from the wiki text
// - length:  summary over 25 words or tip over 20 words
//
// Options: --file <path> checks another texts file (e.g. a batch draft);
//          --only-present skips perks without a text (for batches).
// Exit code 1 when any problem is found.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { textKey, textHash, textProblems } from '../server/ownTexts.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : null;
};
const file = arg('--file') ?? path.join(ROOT, 'data', 'texts.json');
const onlyPresent = process.argv.includes('--only-present');
const perks = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'perks.json'), 'utf8'));
const texts = JSON.parse(fs.readFileSync(file, 'utf8'));

let bad = 0;
let ok = 0;
for (const p of perks) {
  const key = textKey(p);
  const t = texts[key];
  if (!t) {
    if (onlyPresent) continue;
    console.log(`${key}: missing`);
    bad++;
    continue;
  }
  const problems = [];
  if (t.sourceHash && t.sourceHash !== textHash(p.description)) problems.push('stale (wiki text changed)');
  problems.push(...textProblems(t, p.description));
  if (problems.length) {
    bad++;
    console.log(`${key}:\n  - ${problems.join('\n  - ')}`);
  } else ok++;
}
const unknown = Object.keys(texts).filter((k) => !perks.some((p) => textKey(p) === k));
for (const k of unknown) console.log(`${k}: text for a perk that does not exist`);
console.log(`\n${ok} ok, ${bad} with problems, ${unknown.length} unknown keys.`);
process.exit(bad || unknown.length ? 1 : 0);

// Run with:  npm test
// Checks the hand-made perk tags and the build logic against the current data.
// After a new chapter, the first test tells you which new perks still need tags
// in src/lib/perkTags.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PLAYSTYLES, withTags, keywordTags } from '../src/lib/tags.js';
import { SURVIVOR_PERK_TAGS, KILLER_PERK_TAGS } from '../src/lib/perkTags.js';
import { resolveBuild, scoreBuild } from '../src/lib/builds.js';
import { suggestPerks } from '../src/lib/combos.js';

const read = (f) => JSON.parse(fs.readFileSync(new URL(f, import.meta.url), 'utf8'));
const perks = withTags(read('../data/perks.json'));
const data = {
  perks,
  killers: read('../data/killers.json'),
  items: read('../data/items.json'),
  addons: read('../data/addons.json'),
  offerings: read('../data/offerings.json'),
};
const TABLES = { survivor: SURVIVOR_PERK_TAGS, killer: KILLER_PERK_TAGS };
const perk = (name) => perks.find((p) => p.name === name);

test('every perk has hand-checked tags (add new perks to src/lib/perkTags.js)', () => {
  const missing = perks.filter((p) => p.tagSource !== 'manual').map((p) => `${p.role}: ${p.name}`);
  assert.deepEqual(missing, [], `Perks without manual tags:\n  ${missing.join('\n  ')}`);
});

test('every name in perkTags.js exists in the data (no typos or removed perks)', () => {
  for (const [role, table] of Object.entries(TABLES)) {
    const names = new Set(perks.filter((p) => p.role === role).map((p) => p.name));
    const unknown = Object.keys(table).filter((n) => !names.has(n));
    assert.deepEqual(unknown, [], `${role} names not found in data: ${unknown.join(', ')}`);
  }
});

test('all tags are known playstyles, max 3 per perk', () => {
  for (const [role, table] of Object.entries(TABLES)) {
    for (const [name, tags] of Object.entries(table)) {
      assert.ok(tags.length >= 1 && tags.length <= 3, `${name} has ${tags.length} tags`);
      for (const t of tags) assert.ok(PLAYSTYLES[role][t], `${name}: unknown ${role} tag "${t}"`);
    }
  }
});

test('keyword fallback: a drawback like "your aura is revealed to the killer" is not aura reading', () => {
  const tags = keywordTags({ name: 'X', role: 'survivor', description: 'Your Aura is revealed to the Killer for 5 seconds.' });
  assert.ok(!tags.includes('aura'));
  const good = keywordTags({ name: 'Y', role: 'survivor', description: 'The Auras of all other Survivors are revealed to you.' });
  assert.ok(good.includes('aura'));
});

test('all hand-picked builds use names that exist', () => {
  for (const b of read('../builds/builds.json').builds) {
    assert.deepEqual(resolveBuild(b, data).missing, [], `Build "${b.name}"`);
  }
});

test('two Exhaustion perks are penalised, Adrenaline is not', () => {
  const twoExhaust = scoreBuild([perk('Sprint Burst'), perk('Dead Hard')], 'survivor');
  assert.ok(twoExhaust.cons.some((c) => c.includes('Exhaustion')));
  const withAdrenaline = scoreBuild([perk('Sprint Burst'), perk('Adrenaline')], 'survivor');
  assert.ok(!withAdrenaline.cons.some((c) => c.includes('Exhaustion')));
});

test('identical licensed perks count as one perk', () => {
  const r = scoreBuild([perk('Decisive Strike'), perk('Will to Live')], 'survivor');
  assert.ok(r.cons.some((c) => c.includes('same perk')));
  const s = suggestPerks([perk('Decisive Strike')], perks, []).map((x) => x.perk.name);
  assert.ok(!s.includes('Will to Live'), 'should not suggest the twin of a chosen perk');
});

test('known strong pairs are suggested first', () => {
  const top2 = suggestPerks([perk('Scourge Hook: Pain Resonance')], perks, [])
    .slice(0, 2)
    .map((x) => x.perk.name)
    .sort();
  assert.deepEqual(top2, ["Dead Man's Switch", 'Grim Embrace']);
});

// Tests for the automatic parts: patch change detection and the build generator.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { computeChanges } from '../server/changes.js';
import { withTags } from '../src/lib/tags.js';
import { resolveBuild } from '../src/lib/builds.js';
import { generateBuilds } from '../src/lib/generator.js';

const read = (f) => JSON.parse(fs.readFileSync(new URL(f, import.meta.url), 'utf8'));
const raw = {
  meta: read('../data/meta.json'),
  perks: read('../data/perks.json'),
  killers: read('../data/killers.json'),
  survivors: read('../data/survivors.json'),
  items: read('../data/items.json'),
  addons: read('../data/addons.json'),
  offerings: read('../data/offerings.json'),
};

test('changes: detects a new perk, a changed perk and the patch number', () => {
  const old = structuredClone(raw);
  old.meta.patch = '0.0.1';
  old.perks = old.perks.filter((p) => p.name !== 'Hex: Pentimento');
  old.perks.find((p) => p.name === 'Lithe').description = 'old text';
  const c = computeChanges(old, raw);
  assert.equal(c.fromPatch, '0.0.1');
  assert.deepEqual(c.perks.added, ['Hex: Pentimento (killer)']);
  assert.deepEqual(c.perks.changed, ['Lithe (survivor)']);
  assert.deepEqual(c.newPerkIds, ['hex-pentimento']);
});

test('changes: nothing changed -> null; first refresh ever -> null', () => {
  assert.equal(computeChanges(structuredClone(raw), raw), null);
  assert.equal(computeChanges({ perks: [] }, raw), null);
});

const data = { ...raw, perks: withTags(raw.perks) };
const curated = read('../builds/builds.json').builds.map((b) => resolveBuild(b, data));
const generated = generateBuilds(data, curated);

test('generator: every build has 4 different perks of the right role and no conflicts', () => {
  assert.ok(generated.length > 40, `only ${generated.length} builds`);
  for (const b of generated) {
    const perks = b.resolved.perks;
    assert.equal(perks.length, 4, b.name);
    assert.ok(perks.every((p) => p.role === b.role), `${b.name}: wrong role`);
    const ids = perks.flatMap((p) => p.aliasIds);
    assert.equal(new Set(ids).size, ids.length, `${b.name}: duplicate or twin perks`);
    assert.ok(perks.filter((p) => p.exhaustion && p.id !== 'adrenaline').length <= 1, `${b.name}: 2 exhaustion perks`);
  }
});

test('generator: one build per killer, with that killer\'s own add-ons', () => {
  for (const k of data.killers) {
    const b = generated.find((x) => x.id === `auto-killer-${k.id}`);
    assert.ok(b, `no build for ${k.name}`);
    assert.ok(b.resolved.addons.every((a) => a.killer === k.name), `${k.name}: foreign add-on`);
  }
});

test('generator: a brand-new perk is picked up without any code change', () => {
  // Pretend a new chapter added a strong slowdown perk.
  const fake = {
    id: 'test-new-slowdown',
    name: 'Test New Slowdown',
    role: 'killer',
    character: null,
    description: 'After hooking a Survivor, all Generators regress 10% and are blocked for 20 seconds.',
  };
  const d = { ...data, perks: withTags([...raw.perks, fake]) };
  const builds = generateBuilds(d, curated, { newPerkIds: ['test-new-slowdown'] });
  const perk = d.perks.find((p) => p.id === 'test-new-slowdown');
  assert.equal(perk.tagSource, 'keywords');
  assert.ok(perk.tags.includes('slowdown'), 'keyword rules should tag it as slowdown');
  assert.ok(builds.some((b) => b.newPerks.includes('Test New Slowdown')), 'should appear in a generated build');
});

test('generator: ids are stable, so favourites keep working after a refresh', () => {
  const again = generateBuilds(data, curated);
  assert.deepEqual(
    again.map((b) => b.id),
    generated.map((b) => b.id),
  );
});

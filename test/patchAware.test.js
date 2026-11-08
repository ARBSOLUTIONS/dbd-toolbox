// Hand-picked builds repair themselves after a patch (src/lib/patchAware.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { withTags } from '../src/lib/tags.js';
import { resolveBuild } from '../src/lib/builds.js';
import { repairBuild } from '../src/lib/patchAware.js';

const read = (f) => JSON.parse(fs.readFileSync(new URL(f, import.meta.url), 'utf8'));
const base = {
  meta: read('../data/meta.json'),
  perks: withTags(read('../data/perks.json')),
  killers: read('../data/killers.json'),
  items: read('../data/items.json'),
  addons: read('../data/addons.json'),
  offerings: read('../data/offerings.json'),
};
const curated = read('../builds/builds.json').builds;
const changes = { toPatch: '99.0.0', perks: { added: [], removed: [], changed: [] } };
const run = (build, data = base, c = changes) => repairBuild(resolveBuild(build, data), data, c);

test('unchanged builds stay exactly the same', () => {
  for (const b of curated) {
    const r = resolveBuild(b, base);
    assert.equal(repairBuild(r, base, changes), r, b.name);
  }
});

test('a renamed perk is matched to its new name', () => {
  const build = curated.find((b) => b.role === 'survivor' && b.perks.includes('Lithe'));
  const data = { ...base, perks: base.perks.map((p) => (p.name === 'Lithe' ? { ...p, name: 'Lithe Runner' } : p)) };
  const r = run(build, data);
  assert.deepEqual(r.missing, []);
  assert.ok(r.perks.includes('Lithe Runner'));
  assert.equal(r.patchNotes[0].kind, 'renamed');
  assert.match(r.why, /Lithe → Lithe Runner/);
});

test('a removed perk is replaced by another perk of the same role', () => {
  const build = curated.find((b) => b.role === 'killer');
  const gone = build.perks[0];
  const data = { ...base, perks: base.perks.filter((p) => p.name !== gone) };
  const r = run(build, data);
  assert.deepEqual(r.missing, []);
  assert.equal(r.resolved.perks.filter(Boolean).length, 4);
  assert.ok(!r.perks.includes(gone));
  assert.equal(new Set(r.resolved.perks.map((p) => p.id)).size, 4, 'no duplicate perks');
  assert.ok(r.resolved.perks.every((p) => p.role === 'killer'));
  assert.equal(r.patchNotes[0].kind, 'replaced');
});

test('beginner builds get a General perk as replacement', () => {
  const build = curated.find((b) => b.type === 'beginner' && b.role === 'survivor');
  const gone = build.perks.find((n) => !base.perks.find((p) => p.name === n).character) ?? build.perks[0];
  const data = { ...base, perks: base.perks.filter((p) => p.name !== gone) };
  const r = run(build, data);
  const note = r.patchNotes.find((n) => n.from === gone);
  assert.ok(note);
  assert.ok(!base.perks.find((p) => p.name === note.to).character, `${note.to} should be a General perk`);
});

test('a perk changed in the latest patch is flagged', () => {
  const build = curated.find((b) => b.perks.includes('Lithe'));
  const r = run(build, base, { ...changes, perks: { ...changes.perks, changed: ['Lithe (survivor)'] } });
  assert.deepEqual(r.patchNotes, [{ kind: 'changed', perk: 'Lithe' }]);
  assert.equal(r.perks.join(), build.perks.join());
});

test('a removed item is dropped instead of shown broken', () => {
  const build = curated.find((b) => b.role === 'survivor' && b.item);
  const data = { ...base, items: base.items.filter((i) => i.name !== build.item) };
  const r = run(build, data);
  assert.equal(r.item, null);
  assert.deepEqual(r.missing, []);
  assert.ok(r.patchNotes.some((n) => n.kind === 'dropped'));
});

// Tests for the community rules (server/community/core.js) with an in-memory store.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createBuild, listBuilds, voteBuild, reportBuild, indexGameData, visitorHash, CREATE_LIMIT, HIDE_REPORTS } from '../server/community/core.js';
import { jsonStore } from '../server/community/stores.js';

const read = (f) => JSON.parse(fs.readFileSync(new URL(f, import.meta.url), 'utf8'));
const game = indexGameData({
  perks: read('../data/perks.json'),
  killers: read('../data/killers.json'),
  items: read('../data/items.json'),
  addons: read('../data/addons.json'),
  offerings: read('../data/offerings.json'),
});
// Fake file system so the JSON store stays in memory.
const memoryStore = () => jsonStore('mem.json', { readFile: async () => { throw new Error('no file'); }, writeFile: async () => {} });
const good = { role: 'killer', name: 'Gen Lock', killer: 'The Nurse', perks: ['Grim Embrace', 'Lethal Pursuer'], addons: ['Matchbox'], offering: 'Putrid Oak' };

test('a valid build is stored; invalid perks, add-ons and names are refused', async () => {
  const store = memoryStore();
  const b = await createBuild(store, good, { game, voter: 'v1' });
  assert.equal(b.score, 0);
  assert.equal('creator' in b, false, 'the visitor hash is never sent back');
  await assert.rejects(createBuild(store, { ...good, perks: ['Fake Perk'] }, { game, voter: 'v1' }), /Unknown killer perk/);
  await assert.rejects(createBuild(store, { ...good, addons: ['Gauze Roll'] }, { game, voter: 'v1' }), /does not fit/);
  await assert.rejects(createBuild(store, { ...good, name: 'x' }, { game, voter: 'v1' }), /name/);
  await assert.rejects(createBuild(store, { ...good, perks: ['Lithe'] }, { game, voter: 'v1' }), /Unknown killer perk/);
});

test('HTML in texts is neutralised', async () => {
  const b = await createBuild(memoryStore(), { ...good, name: '<script>x</script>Nice', description: '<img onerror=1>' }, { game, voter: 'v' });
  assert.ok(!/[<>]/.test(b.name + b.description));
});

test('one vote per visitor; changing and removing a vote works', async () => {
  const store = memoryStore();
  const { id } = await createBuild(store, good, { game, voter: 'creator' });
  await voteBuild(store, id, 1, { voter: 'a' });
  await voteBuild(store, id, 1, { voter: 'a' });
  let r = await voteBuild(store, id, -1, { voter: 'b' });
  assert.deepEqual([r.up, r.down, r.score], [1, 1, 0]);
  r = await voteBuild(store, id, 0, { voter: 'b' });
  assert.deepEqual([r.up, r.down], [1, 0]);
  const [listed] = await listBuilds(store, { voter: 'a' });
  assert.equal(listed.myVote, 1);
});

test('hourly limit on sharing', async () => {
  const store = memoryStore();
  for (let i = 0; i < CREATE_LIMIT; i++) await createBuild(store, { ...good, name: `Build ${i}` }, { game, voter: 'spammer' });
  await assert.rejects(createBuild(store, good, { game, voter: 'spammer' }), /per hour/);
  await createBuild(store, good, { game, voter: 'someone-else' });
});

test('builds are hidden after enough reports or a very negative score', async () => {
  const store = memoryStore();
  const { id } = await createBuild(store, good, { game, voter: 'c' });
  for (let i = 0; i < HIDE_REPORTS; i++) await reportBuild(store, id, { voter: `r${i}` });
  assert.equal((await listBuilds(store, {})).length, 0);

  const second = await createBuild(store, { ...good, name: 'Downvoted' }, { game, voter: 'c' });
  for (let i = 0; i < 5; i++) await voteBuild(store, second.id, -1, { voter: `d${i}` });
  assert.equal((await listBuilds(store, {})).length, 0);
});

test('visitor hash is stable and does not contain the IP', async () => {
  const h = await visitorHash('1.2.3.4', 'salt');
  assert.equal(h, await visitorHash('1.2.3.4', 'salt'));
  assert.notEqual(h, await visitorHash('1.2.3.5', 'salt'));
  assert.ok(!h.includes('1.2.3.4'));
});

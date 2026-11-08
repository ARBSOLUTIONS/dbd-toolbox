// Tests for the challenge generator and achievements.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { withTags } from '../src/lib/tags.js';
import { resolveBuild } from '../src/lib/builds.js';
import { generateChallenge, dailyChallenge, resolveChallenge, KINDS } from '../src/lib/challenges.js';
import { buildStats, evaluateAchievements } from '../src/lib/achievements.js';

const read = (f) => JSON.parse(fs.readFileSync(new URL(f, import.meta.url), 'utf8'));
const data = {
  meta: read('../data/meta.json'),
  perks: withTags(read('../data/perks.json')),
  killers: read('../data/killers.json'),
  survivors: read('../data/survivors.json'),
  items: read('../data/items.json'),
  addons: read('../data/addons.json'),
  offerings: read('../data/offerings.json'),
};
const curated = read('../builds/builds.json').builds.map((b) => resolveBuild(b, data));

test('200 random challenges are all valid builds', () => {
  for (let i = 0; i < 200; i++) {
    const ch = resolveChallenge(generateChallenge(data, curated, { seed: `t${i}` }), data);
    const perks = ch.resolved.perks;
    assert.ok(perks.every(Boolean), `${ch.title}: unknown perk`);
    assert.ok(perks.every((p) => p.role === ch.role), `${ch.title}: wrong role`);
    const ids = perks.flatMap((p) => p.aliasIds);
    assert.equal(new Set(ids).size, ids.length, `${ch.title}: duplicate perks`);
    // Adept uses the character's real kit, which can contain two Exhaustion perks (e.g. Renato Lyra).
    if (ch.kind !== 'adept') {
      assert.ok(perks.filter((p) => p.exhaustion && p.id !== 'adrenaline').length <= 1, `${ch.title}: 2 exhaustion`);
    }
    assert.ok(ch.rule === 'no-perks' || perks.length >= 3, `${ch.title}: only ${perks.length} perks`);
    if (ch.role === 'killer') assert.ok(ch.resolved.addons.every((a) => a.killer === ch.killer), 'foreign add-on');
    assert.ok(ch.points > 0 && ch.objective);
  }
});

test('every kind can be generated for both roles', () => {
  for (const kind of Object.keys(KINDS)) {
    for (const role of ['survivor', 'killer']) {
      const ch = generateChallenge(data, curated, { kind, role, seed: `${kind}-${role}` });
      assert.equal(ch.role, role);
      if (!(kind === 'roster' && role === 'survivor')) assert.equal(ch.kind, kind);
    }
  }
});

test('adept uses exactly the character’s own perks', () => {
  const ch = generateChallenge(data, curated, { kind: 'adept', role: 'survivor', seed: 'adept' });
  const owner = data.survivors.find((s) => s.name === ch.character);
  assert.deepEqual([...ch.perks].sort(), [...owner.perks].sort());
  assert.equal(ch.item, null);
});

test('daily challenge is the same all day and different the next day', () => {
  assert.equal(dailyChallenge(data, curated, '2026-11-08').id, dailyChallenge(data, curated, '2026-11-08').id);
  assert.notEqual(
    JSON.stringify(dailyChallenge(data, curated, '2026-11-08').perks),
    JSON.stringify(dailyChallenge(data, curated, '2026-11-09').perks),
  );
});

test('achievements unlock from history, incl. a daily streak', () => {
  const done = (challenge) => ({ challenge, status: 'completed', finishedAt: '2026-11-08T12:00:00Z' });
  const history = ['2026-11-06', '2026-11-07', '2026-11-08'].map((d) =>
    done({ ...dailyChallenge(data, curated, d), id: d }),
  );
  history.push(done(generateChallenge(data, curated, { kind: 'adept', role: 'killer', seed: 'k' })));
  const a = Object.fromEntries(evaluateAchievements(buildStats(history)).map((x) => [x.id, x]));
  assert.ok(a['first-blood'].unlocked);
  assert.ok(a['adept-1'].unlocked);
  assert.ok(a['streak-3'].unlocked);
  assert.ok(!a['streak-7'].unlocked);
  assert.equal(a.dedicated.current, 4);
});

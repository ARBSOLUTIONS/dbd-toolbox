// Tests for the NightLight stats import and how builds use the stats.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseNightlight, nameKey, makeMatcher } from '../server/nightlight.js';
import { buildStats, popularBuildSpecs } from '../src/lib/nlStats.js';
import { generateBuilds } from '../src/lib/generator.js';
import { withTags } from '../src/lib/tags.js';

const read = (f) => JSON.parse(fs.readFileSync(new URL(`../data/${f}`, import.meta.url), 'utf8'));
const data = {
  meta: read('meta.json'),
  perks: withTags(read('perks.json')),
  killers: read('killers.json'),
  survivors: read('survivors.json'),
  items: read('items.json'),
  addons: read('addons.json'),
  offerings: read('offerings.json'),
};
const kPerks = data.perks.filter((p) => p.role === 'killer');
const sPerks = data.perks.filter((p) => p.role === 'survivor');

const killerRow = (name, i) => ({
  name,
  kill_rate: 40 + (i % 10),
  pick_rate: 2 + i / 10,
  matches: 100 + i,
  breakdown: { 0: 30, 1: 20, 2: 15, 3: 15, 4: 20 },
});

/** A small export in the collector's format, with NightLight-style perk ids. */
function makeExport() {
  const perkNames = {};
  const ids = new Map();
  [...kPerks, ...sPerks].forEach((p, i) => {
    perkNames[1000 + i] = p.name;
    ids.set(p.id, 1000 + i);
  });
  const nl = (id) => ids.get(id);
  const judgment = data.killers[0];
  return {
    format: 'dbd-toolbox-nightlight-export',
    version: 1,
    collectedAt: '2026-11-08T17:00:00Z',
    perkNames,
    feeds: {
      killers: {
        start: '2026-10-11T16:00:00Z',
        end: '2026-11-08T16:00:00Z',
        killers: [...data.killers.slice(0, 30).map((k, i) => killerRow(k.name, i)), { ...killerRow('Overall Average', 0), matches: 0, kill_rate: 46 }],
      },
      survivors: { survivors: data.survivors.slice(0, 20).map((s, i) => ({ name: s.name, escape_rate: 40 + i, pick_rate: 3, count: 200 })) },
      killerPerks: { perks: kPerks.map((p, i) => ({ id: nl(p.id), pct: i % 30, kill_rate: 40 + (i % 15), count: 10 })) },
      survivorPerks: { perks: sPerks.map((p, i) => ({ id: nl(p.id), pct: i % 25, escape_rate: 35 + (i % 10), count: 10 })) },
    },
    pages: {
      killers: {
        [judgment.name]: {
          stats_since_patch: '10.1.0',
          top_perks: [{ perk_id: nl(kPerks[0].id), usage_rate: 56.5, kill_rate: 61.4 }],
          top_builds: [
            { pct: 4.4, kill_rate: 67.5, perks: kPerks.slice(0, 4).map((p) => nl(p.id)), survivors: 271, kills: 183 },
            { pct: 2.0, kill_rate: 80, perks: kPerks.slice(4, 8).map((p) => nl(p.id)), survivors: 120, kills: 96 },
            { pct: 1.0, kill_rate: 40, perks: [-1, ...kPerks.slice(8, 11).map((p) => nl(p.id))], survivors: 33, kills: 13 },
          ],
        },
      },
      survivors: {
        [data.survivors[0].name]: {
          top_perks: [],
          top_builds: [{ pct: 0.5, escape_rate: 32, perks: sPerks.slice(0, 4).map((p) => nl(p.id)), survivors: 50, escapes: 16 }],
        },
        [data.survivors[1].name]: {
          top_perks: [],
          top_builds: [{ pct: 0.5, escape_rate: 50, perks: sPerks.slice(0, 4).map((p) => nl(p.id)).reverse(), survivors: 30, escapes: 15 }],
        },
      },
    },
    failed: [],
  };
}

test('name keys ignore "The", accents, punctuation and &', () => {
  assert.equal(nameKey('The Onryō'), 'onryo');
  assert.equal(nameKey('Barbecue & Chilli'), 'barbecueandchilli');
  assert.equal(nameKey('Dead Man’s Switch'), nameKey("Dead Man's Switch"));
  const match = makeMatcher([{ id: 'bbq', name: 'Barbecue & Chilli' }, { id: 'x', name: 'Lithe' }]);
  assert.equal(match('Barbecue & Chili'), 'bbq', 'one-letter spelling difference');
  assert.equal(match('Lith'), null, 'short names need an exact match');
});

test('a full export maps killers, survivors, perks and builds to our ids', () => {
  const s = parseNightlight(makeExport(), data, '2026-11-08T18:00:00Z');
  assert.equal(Object.keys(s.killers).length, 30);
  assert.equal(s.games, data.killers.slice(0, 30).reduce((n, _k, i) => n + 100 + i, 0), 'average row has matches: 0');
  assert.equal(Object.keys(s.survivors).length, 20);
  assert.ok(s.survivorAverage.escapeRate > 40);
  assert.equal(Object.keys(s.perks).length, data.perks.length);
  assert.equal(s.perks[kPerks[0].id].role, 'killer');

  const judgment = s.killers[data.killers[0].id];
  assert.equal(judgment.topPerks[0].perk, kPerks[0].id);
  assert.deepEqual(judgment.topBuilds[0].perks, kPerks.slice(0, 4).map((p) => p.id));
  assert.equal(judgment.topBuilds[2].perks.length, 3, 'empty perk slot (-1) is dropped');

  // The same survivor build from two survivor pages is added up.
  assert.equal(s.popularSurvivorBuilds[0].samples, 80);
  assert.equal(s.popularSurvivorBuilds[0].rate, 38.75);
});

test('a single killers feed still imports (killer stats only)', () => {
  const raw = { status: 'success', data: makeExport().feeds.killers };
  const s = parseNightlight(raw, data);
  assert.equal(Object.keys(s.killers).length, 30);
  assert.deepEqual(s.perks, {});
});

test('bad or incomplete input throws, so old stats are kept', () => {
  assert.throws(() => parseNightlight({ status: 'error' }, data));
  assert.throws(() => parseNightlight({ hello: 1 }, data));
  const raw = makeExport();
  raw.feeds.killers.killers = raw.feeds.killers.killers.slice(0, 3);
  assert.throws(() => parseNightlight(raw, data));
});

test('builds get NightLight numbers, exact builds are recognised', () => {
  const stats = parseNightlight(makeExport(), data);
  const killerId = data.killers[0].id;
  const killer = data.killers.find((k) => k.id === killerId);
  const build = { role: 'killer', resolved: { perks: kPerks.slice(0, 4), killer } };
  const nl = buildStats(build, stats);
  assert.equal(nl.exact.rate, 67.5);
  assert.equal(nl.rateLabel, 'kill rate');
  assert.equal(nl.perks[0].usage, 56.5, "uses the killer's own perk usage when known");
  assert.equal(nl.perks[0].scope, 'killer');

  const other = buildStats({ role: 'survivor', resolved: { perks: sPerks.slice(5, 9) } }, stats);
  assert.equal(other.exact, null);
  assert.ok(other.avgRate > 0);
  assert.equal(buildStats(build, null), null, 'no stats → no numbers');
});

test('generator adds "Most played" builds from the stats', () => {
  const stats = parseNightlight(makeExport(), data);
  const specs = popularBuildSpecs(stats);
  assert.ok(specs.some((s) => s.role === 'killer' && s.kind === 'most-played'));
  assert.ok(specs.some((s) => s.role === 'killer' && s.kind === 'top-rate'), 'better kill rate with enough games');

  const builds = generateBuilds({ ...data, stats });
  const popular = builds.filter((b) => b.type === 'popular');
  assert.ok(popular.length >= 2);
  assert.ok(popular.every((b) => b.resolved.perks.length === 4 && /NightLight/.test(b.why)));
  assert.ok(popular.some((b) => b.name.endsWith(': Most played')));

  const without = generateBuilds(data);
  assert.equal(without.filter((b) => b.type === 'popular').length, 0, 'no stats → no popular builds');
});

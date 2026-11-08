// Buff / nerf detection for the Patch notes page (src/lib/patchImpact.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { judgeChange, wordDiff, analysePatch } from '../src/lib/patchImpact.js';
import { computeChanges } from '../server/changes.js';
import { withTags } from '../src/lib/tags.js';
import { resolveBuild } from '../src/lib/builds.js';

const read = (f) => JSON.parse(fs.readFileSync(new URL(f, import.meta.url), 'utf8'));
const perks = read('../data/perks.json');
const lithe = perks.find((p) => p.name === 'Lithe').description;
const pop = perks.find((p) => p.name === 'Pop Goes the Weasel').description;

test('longer Exhaustion is a nerf, shorter is a buff', () => {
  const nerf = judgeChange(lithe, lithe.replace('60/50/40 seconds', '60/50/45 seconds'));
  assert.equal(nerf.verdict, 'nerf');
  const buff = judgeChange(lithe, lithe.replace('60/50/40 seconds', '50/40/30 seconds'));
  assert.equal(buff.verdict, 'buff');
  assert.equal(buff.level, 2);
});

test('more Haste or a longer active time is a buff, less is a nerf', () => {
  assert.equal(judgeChange(lithe, lithe.replace('+50%', '+75%')).verdict, 'buff');
  assert.equal(judgeChange(pop, pop.replace('35/40/45 seconds', '25/30/35 seconds')).verdict, 'nerf');
  assert.equal(judgeChange(pop, pop.replace('20% regression', '25% regression')).verdict, 'buff');
});

test('a buff and a nerf together are mixed or follow the bigger change', () => {
  const both = judgeChange(lithe, lithe.replace('+50%', '+60%').replace('60/50/40', '60/50/48'));
  assert.ok(['mixed', 'buff', 'nerf'].includes(both.verdict));
  assert.equal(both.changes.length, 2);
});

test('wording-only changes are a text update; a new text is a rework', () => {
  assert.equal(judgeChange(lithe, lithe.replace('triggers its effect', 'activates')).verdict, 'text');
  assert.equal(judgeChange(lithe, 'Completely new effect: after vaulting you become invisible to auras of the killer while you stay in the area around the window you vaulted through.').verdict, 'rework');
});

test('word diff marks removed and added words', () => {
  const d = wordDiff('lasts 40 seconds', 'lasts 30 seconds');
  assert.deepEqual(d.filter((x) => x.type !== 'same').map((x) => `${x.type}:${x.text}`), ['del:40', 'add:30']);
});

test('a patch record links changed perks to the builds that use them', () => {
  const raw = {
    meta: read('../data/meta.json'),
    perks,
    killers: read('../data/killers.json'),
    survivors: read('../data/survivors.json'),
    items: read('../data/items.json'),
    addons: read('../data/addons.json'),
    offerings: read('../data/offerings.json'),
  };
  const old = structuredClone(raw);
  old.meta.patch = '0.0.1';
  old.perks.find((p) => p.name === 'Lithe').description = lithe.replace('60/50/40', '60/50/50');
  const record = computeChanges(old, raw);
  assert.equal(record.details.perks.length, 1);
  assert.equal(record.details.perks[0].name, 'Lithe');

  const data = { ...raw, perks: withTags(perks) };
  const builds = read('../builds/builds.json').builds.map((b) => resolveBuild(b, data));
  const a = analysePatch(record, data, builds);
  assert.equal(a.perks[0].judgement.verdict, 'buff');
  assert.ok(a.perks[0].builds.length > 0);
  assert.ok(a.builds.every((x) => x.score > 0));
  assert.equal(a.counts.buff, 1);
});

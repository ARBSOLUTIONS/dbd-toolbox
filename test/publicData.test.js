// Tests for our own perk texts (data/texts.json) and the public app data that
// ships without the wiki descriptions (server/publicData.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { withTags, keywordTags, isExhaustionPerk } from '../src/lib/tags.js';
import { resolveBuild, scoreBuild } from '../src/lib/builds.js';
import { repairBuild } from '../src/lib/patchAware.js';
import { generateBuilds } from '../src/lib/generator.js';
import { rateOffering, withOfferingRatings } from '../src/lib/offeringRatings.js';
import { judgeChange } from '../src/lib/patchImpact.js';
import { textKey, textHash, ownText, textProblems, textStatus } from '../server/ownTexts.js';
import { toPublicPerk, toPublicItem, toPublicOffering, publicChanges } from '../server/publicData.js';

const read = (f, fallback) => {
  try {
    return JSON.parse(fs.readFileSync(new URL(f, import.meta.url), 'utf8'));
  } catch {
    return fallback;
  }
};
const raw = {
  meta: read('../data/meta.json'),
  perks: read('../data/perks.json'),
  killers: read('../data/killers.json'),
  survivors: read('../data/survivors.json'),
  items: read('../data/items.json'),
  addons: read('../data/addons.json'),
  offerings: read('../data/offerings.json'),
};
const texts = read('../data/texts.json', {});
const changes = read('../data/changes.json', null);
const stats = read('../data/nightlight.json', null);
const curatedFile = read('../builds/builds.json', { builds: [] });

test('own texts: every perk with a wiki description has a current text that passes the checks', () => {
  const bad = [];
  for (const p of raw.perks) {
    if (!p.description.trim()) continue; // nothing to write from; the site shows the fallback
    const t = texts[textKey(p)];
    if (!t) bad.push(`${textKey(p)}: missing`);
    else if (t.sourceHash !== textHash(p.description)) bad.push(`${textKey(p)}: stale`);
    else for (const problem of textProblems(t, p.description)) bad.push(`${textKey(p)}: ${problem}`);
  }
  assert.deepEqual(bad, [], 'run node scripts/check-texts.js for details');
});

test('own texts: a changed wiki text makes the own text stale (fallback instead)', () => {
  const p = raw.perks.find((x) => texts[textKey(x)]);
  assert.ok(ownText(p, texts));
  const patched = { ...p, description: `${p.description} Changed in a patch.` };
  assert.equal(ownText(patched, texts), null);
  assert.deepEqual(textStatus([patched], texts).stale, [textKey(p)]);
});

test('own texts: the copy check catches a copied run of 6 words', () => {
  const problems = textProblems({ summary: 'x', facts: ['Grants a +50% Haste Status Effect for 4 seconds.'], tip: 'y' }, 'Grants a +50% Haste Status Effect for 4 seconds.');
  assert.ok(problems.some((p) => p.startsWith('copied')));
});

test('public data: no wiki descriptions in perks, add-ons, items and offerings', () => {
  const pub = {
    perks: raw.perks.map((p) => toPublicPerk(p, texts)),
    items: raw.items.map(toPublicItem),
    addons: raw.addons.map(toPublicItem),
    offerings: raw.offerings.map(toPublicOffering),
  };
  const json = JSON.stringify(pub);
  for (const list of Object.values(pub)) for (const x of list) assert.equal(x.description, undefined, x.name);
  // No line of 8+ words from any wiki description appears anywhere.
  const leaked = [];
  for (const kind of ['perks', 'items', 'addons', 'offerings']) {
    for (const x of raw[kind]) {
      for (const line of String(x.description ?? '').split('\n')) {
        const t = line.replace(/^•\s*/, '').trim();
        if (t.split(/\s+/).length >= 8 && json.includes(JSON.stringify(t).slice(1, -1))) leaked.push(`${kind}: ${x.name}`);
      }
    }
  }
  assert.deepEqual(leaked, []);
});

test('public data: tags, exhaustion and offering ratings equal the ones from the full text', () => {
  for (const p of raw.perks) {
    const pub = toPublicPerk(p, texts);
    assert.equal(isExhaustionPerk(pub), isExhaustionPerk(p), p.name);
    for (const role of ['survivor', 'killer']) assert.deepEqual(keywordTags(pub, role), keywordTags(p, role), p.name);
  }
  for (const a of [...raw.addons, ...raw.items]) {
    const pub = toPublicItem(a);
    for (const role of ['survivor', 'killer']) assert.deepEqual(keywordTags(pub, role), keywordTags(a, role), a.name);
  }
  const fromPublic = withOfferingRatings(raw.offerings.map(toPublicOffering));
  raw.offerings.forEach((o, i) => assert.deepEqual(fromPublic[i].rating, rateOffering(o), o.name));
});

test('public data: every build scores exactly the same as with the wiki texts', () => {
  const full = { ...raw, perks: withTags(raw.perks), changes, stats };
  const pub = {
    ...raw,
    perks: withTags(raw.perks.map((p) => toPublicPerk(p, texts))),
    items: raw.items.map(toPublicItem),
    addons: raw.addons.map(toPublicItem),
    offerings: raw.offerings.map(toPublicOffering),
    changes: publicChanges(changes),
    stats,
  };
  const rate = (b, data) => scoreBuild(b.resolved.perks, b.role, b.playstyles, { stats, killerId: b.resolved.killer?.id });
  const curatedFull = curatedFile.builds.map((b) => {
    const r = repairBuild(resolveBuild(b, full), full, full.changes);
    return { ...r, rating: rate(r, full) };
  });
  const curatedPub = curatedFile.builds.map((b) => {
    const r = repairBuild(resolveBuild(b, pub), pub, pub.changes);
    return { ...r, rating: rate(r, pub) };
  });
  assert.deepEqual(curatedPub.map((b) => b.rating), curatedFull.map((b) => b.rating));
  const generated = generateBuilds(full, curatedFull, changes);
  assert.ok(generated.length > 50);
  for (const b of generated) {
    const blueprint = { ...b, perks: b.resolved.perks.map((p) => p?.name), killer: b.killer };
    const r = resolveBuild(blueprint, pub);
    assert.deepEqual(rate(r, pub), b.rating, b.name);
  }
});

test('public data: patch records keep the verdict but only short pieces of text', () => {
  const p = raw.perks.find((x) => x.name === 'Lithe');
  const before = p.description.replace('60/50/40', '80/70/60');
  const record = { details: { perks: [{ id: p.id, role: p.role, name: p.name, before, after: p.description }], addons: [], items: [] } };
  const [d] = publicChanges(record).details.perks;
  assert.equal(d.before, undefined);
  assert.equal(d.after, undefined);
  assert.deepEqual({ ...d.judgement, changes: [] }, { ...judgeChange(before, p.description), changes: [] });
  assert.equal(d.judgement.verdict, 'buff');
  for (const part of d.diff) assert.ok(part.text.trim().split(/\s+/).filter((w) => w !== '…').length <= 5, part.text);
  assert.ok(d.diff.some((x) => x.type === 'add' && x.text.includes('60/50/40')));
});

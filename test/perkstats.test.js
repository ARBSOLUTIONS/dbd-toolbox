// Tests for NightLight perk stats: reading the perk viewer text, the perk
// verdicts, and the community part of the build score.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parsePerkText, mergePerkText } from '../server/nightlight.js';
import { communityScore, perkStatsTable } from '../src/lib/nlStats.js';
import { scoreBuild } from '../src/lib/builds.js';
import { withTags } from '../src/lib/tags.js';

const perks = withTags(JSON.parse(fs.readFileSync(new URL('../data/perks.json', import.meta.url), 'utf8')));
const byName = (n) => perks.find((p) => p.name === n);
const sPerks = perks.filter((p) => p.role === 'survivor');

// What the perk viewer page looks like after select all + copy (shortened).
function pageText(rows, rateWord = 'Escape') {
  const body = rows
    .map(([name, games, pick, rate]) => `${name}\n${games} Games\n\t\n0%\nPick Rate\n24.79%\n${pick}%\n0%\n${rateWord} Rate\n100%\n${rate}%\n\n`)
    .join('\n');
  return `Dead by Daylight Perk Stats\nSurvivor Perks\nKiller Perks\n11 Oct 26, 18:00 - 08 Nov 26, 17:00\n(155,032 appearances, 28 days)\n${body}`;
}
const rows = sPerks.slice(0, 60).map((p, i) => [p.name, 1000 - i * 10, (10 - i / 10).toFixed(2), (30 + (i % 15)).toFixed(2)]);
rows.push(['1st Empty Slot', 5000, '3.40', '90.00']);

test('reads the perk viewer page text and the simple "name|games|pick|rate" lines', () => {
  const fromPage = parsePerkText(pageText(rows));
  assert.equal(fromPage.role, 'survivor');
  assert.equal(fromPage.rows.length, 61);
  assert.deepEqual(fromPage.rows[0], { name: rows[0][0], games: 1000, pickRate: 10, rate: 30 });
  assert.equal(fromPage.period.start, '2026-10-11T18:00:00.000Z');
  assert.equal(parsePerkText(pageText(rows, 'Kill')).role, 'killer');

  const lines = `role: survivor\n${rows.map((r) => r.join('|')).join('\n')}\n`;
  assert.equal(parsePerkText(lines).rows.length, 61);
  assert.throws(() => parsePerkText('hello'));
});

test('merging: empty slots are no perk and stay out of the average', () => {
  const merged = mergePerkText({ perks: {} }, parsePerkText(pageText(rows)), perks);
  assert.equal(Object.values(merged.perks).filter((p) => p.role === 'survivor').length, 60);
  assert.ok(merged.perkAverage.survivor < 45, 'the 90% empty-slot row is not in the average');
  assert.equal(merged.perks[sPerks[0].id].count, 1000);
  assert.equal(merged.survivorAverage.escapeRate, merged.perkAverage.survivor, 'fills a missing survivor average');
});

const stats = {
  perkAverage: { survivor: 36, killer: 49 },
  survivorAverage: { escapeRate: 36 },
  average: { killRate: 46 },
  perks: {
    [byName('Dead Hard').id]: { role: 'survivor', usage: 20, rate: 42, count: 8000 },
    [byName('Resilience').id]: { role: 'survivor', usage: 23, rate: 38, count: 9000 },
    [byName('Breakout').id]: { role: 'survivor', usage: 1.6, rate: 26, count: 600 },
    [byName('Lithe').id]: { role: 'survivor', usage: 25, rate: 36, count: 9600 },
    [byName('Kindred').id]: { role: 'survivor', usage: 0.1, rate: 60, count: 20 },
  },
  killers: {},
};

test('community score: winning perks add points, losing perks cost points, few games count little', () => {
  const good = communityScore([byName('Dead Hard'), byName('Resilience'), byName('Lithe')], 'survivor', stats);
  assert.ok(good.points > 0);
  assert.ok(good.pros.some((p) => p.includes('Dead Hard')));

  const bad = communityScore([byName('Breakout'), byName('Lithe')], 'survivor', stats);
  assert.ok(bad.points < 0);
  assert.ok(bad.cons.some((c) => c.includes('Breakout')));

  // 60% escape rate over only 20 games barely moves the score.
  const few = communityScore([byName('Kindred')], 'survivor', stats);
  assert.ok(Math.abs(few.points) <= 1);
  assert.ok(few.cons.some((c) => c.includes('Too few games')));

  assert.equal(communityScore([byName('Lithe')], 'survivor', null), null);
});

test('scoreBuild adds the community points on top of the rule-based score', () => {
  const list = [byName('Dead Hard'), byName('Resilience'), byName('Lithe'), byName('Breakout')];
  const without = scoreBuild(list, 'survivor', ['chase']);
  const withStats = scoreBuild(list, 'survivor', ['chase'], { stats });
  assert.equal(without.community, null);
  assert.equal(withStats.base, without.score);
  assert.equal(withStats.score, Math.max(0, Math.min(100, withStats.base + withStats.community.points)));
});

test('perk stats table: verdicts, ranking by usage, and too few games', () => {
  const table = perkStatsTable(perks, stats);
  assert.equal(table[byName('Dead Hard').id].verdict, 'strong');
  assert.equal(table[byName('Lithe').id].verdict, 'average');
  assert.equal(table[byName('Breakout').id].verdict, 'weak');
  assert.equal(table[byName('Kindred').id].verdict, 'few');
  assert.equal(table[byName('Lithe').id].rank, 1);
  assert.equal(table[byName('Lithe').id].maxUsage, 25);
  assert.equal(table[byName('Dead Hard').id].delta, 6);
});

test('perk ranking: small samples are shrunk, tiers and places follow the strength', async () => {
  const { rankPerks } = await import('../src/lib/nlStats.js');
  const r = rankPerks(perks, stats, { role: 'survivor' });
  const names = r.ranked.map((e) => e.perk.name);
  assert.deepEqual(names, ['Dead Hard', 'Resilience', 'Lithe', 'Breakout']);
  assert.equal(r.ranked[0].tier, 'S', '+6 over 8000 games');
  assert.equal(r.ranked[3].tier, 'D', '-10 over 600 games');
  assert.equal(r.ranked[0].place, 1);
  assert.equal(r.unranked[0].perk.name, 'Kindred', '20 games: not ranked despite 60%');
  assert.equal(r.ranked[0].movement, null, 'no previous import');

  const byUse = rankPerks(perks, stats, { role: 'survivor', by: 'popularity' });
  assert.equal(byUse.ranked[0].perk.name, 'Lithe');
});

test('perk ranking: movement since the previous import', async () => {
  const { rankPerks } = await import('../src/lib/nlStats.js');
  const withPrev = {
    ...stats,
    previousPerkAverage: { survivor: 36 },
    previousPerks: {
      survivor: {
        [byName('Lithe').id]: { usage: 25, rate: 45, count: 9000 },
        [byName('Dead Hard').id]: { usage: 20, rate: 40, count: 8000 },
      },
    },
  };
  const r = rankPerks(perks, withPrev, { role: 'survivor' });
  const move = Object.fromEntries(r.ranked.map((e) => [e.perk.name, e.movement]));
  assert.equal(move['Dead Hard'], 1, 'was 2nd, now 1st');
  assert.equal(move['Lithe'], -2, 'was 1st, now 3rd');
  assert.equal(move['Breakout'], 'new');
});

test('re-importing perk text keeps a snapshot of the previous period only', () => {
  const first = mergePerkText({ perks: {} }, parsePerkText(pageText(rows)), perks);
  assert.equal(first.previousPerks, undefined, 'nothing to remember yet');
  const later = pageText(rows).replace('08 Nov 26', '06 Dec 26');
  const second = mergePerkText(first, parsePerkText(later), perks);
  assert.equal(Object.keys(second.previousPerks.survivor).length, 60);
  assert.equal(second.previousPerkAverage.survivor, first.perkAverage.survivor);
  const again = mergePerkText(second, parsePerkText(later), perks);
  assert.deepEqual(again.previousPerks, second.previousPerks, 'same period again: snapshot unchanged');
});

test('score parts add up to the score, with and without stats', () => {
  const list = [byName('Dead Hard'), byName('Resilience'), byName('Lithe'), byName('Breakout')];
  for (const opts of [{}, { stats }]) {
    const r = scoreBuild(list, 'survivor', ['chase'], opts);
    const rules = r.parts.filter((p) => p.id !== 'community').reduce((s, p) => s + p.value, 0);
    assert.equal(r.base, Math.max(0, Math.min(100, rules)));
    assert.equal(r.parts.some((p) => p.id === 'community'), Boolean(opts.stats));
    for (const p of r.parts) assert.ok(Array.isArray(p.notes), p.id);
  }
});

test('community points use the same strength as the perk ranking', async () => {
  const { rankPerks } = await import('../src/lib/nlStats.js');
  const list = [byName('Dead Hard'), byName('Breakout')];
  const c = communityScore(list, 'survivor', stats);
  const ranked = Object.fromEntries(rankPerks(perks, stats, { role: 'survivor' }).ranked.map((e) => [e.perk.id, e.strength]));
  for (const p of c.perks) assert.equal(p.strength, ranked[p.id], p.name);
  assert.equal(c.points, Math.round((ranked[byName('Dead Hard').id] + ranked[byName('Breakout').id]) * 0.6));
});

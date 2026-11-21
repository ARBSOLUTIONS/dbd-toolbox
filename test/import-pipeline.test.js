import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeNightlight } from '../server/nightlight.js';
import { guardDescriptions } from '../server/refresh.js';
import { scoreBuild } from '../src/lib/builds.js';
import { buildStats } from '../src/lib/nlStats.js';

test('mergeNightlight snapshots previousPerks on a newer period and preserves killer detail in quick mode', () => {
  const oldStats = {
    period: { start: '2026-10-01T00:00:00Z', end: '2026-10-31T00:00:00Z' },
    perkAverage: { killer: 50, survivor: 40 },
    perks: {
      'scourge-hook-pain-resonance': { role: 'killer', usage: 25, rate: 56, count: 1200 },
      'grim-embrace': { role: 'killer', usage: 18, rate: 55, count: 900 },
      lithe: { role: 'survivor', usage: 22, rate: 43, count: 2000 },
    },
    killers: {
      'the-nurse': {
        matches: 500,
        pickRate: 4.5,
        killRate: 55,
        since: '10.1.0',
        topPerks: [
          { perk: 'lethal-pursuer', usage: 30, rate: 62 },
          { perk: 'scourge-hook-pain-resonance', usage: 28, rate: 61 },
        ],
        topBuilds: [{ perks: ['lethal-pursuer', 'scourge-hook-pain-resonance', 'grim-embrace', 'nowhere-to-hide'], usage: 4.2, rate: 63, samples: 120, wins: 76 }],
      },
    },
    survivors: {
      'sable-ward': {
        matches: 1000,
        pickRate: 6,
        escapeRate: 42,
        topPerks: [{ perk: 'lithe', usage: 25, rate: 43 }],
        topBuilds: [{ perks: ['lithe', 'deja-vu', 'resilience', 'windows-of-opportunity'], usage: 2, rate: 44, samples: 80, wins: 35 }],
      },
    },
    popularSurvivorBuilds: [{ perks: ['lithe', 'deja-vu', 'resilience', 'windows-of-opportunity'], samples: 300, wins: 132, rate: 44 }],
  };

  // Simulated Quick-mode export: fresh global feeds for a newer period, NO character detail pages.
  const freshQuick = {
    period: { start: '2026-11-01T00:00:00Z', end: '2026-11-20T00:00:00Z' },
    perkAverage: { killer: 50, survivor: 40 },
    perks: {
      'scourge-hook-pain-resonance': { role: 'killer', usage: 27, rate: 58, count: 1500 },
      'grim-embrace': { role: 'killer', usage: 20, rate: 57, count: 1100 },
      lithe: { role: 'survivor', usage: 24, rate: 46, count: 2500 },
    },
    killers: {
      'the-nurse': { matches: 620, pickRate: 4.8, killRate: 56 },
    },
    survivors: {
      'sable-ward': { matches: 1200, pickRate: 6.2, escapeRate: 43 },
    },
    popularSurvivorBuilds: [],
  };

  const merged = mergeNightlight(freshQuick, oldStats);

  // 1. Previous perks snapshotted for movement arrows
  assert.equal(merged.previousPerks.killer['scourge-hook-pain-resonance'].rate, 56);
  assert.equal(merged.previousPerks.survivor.lithe.rate, 43);
  assert.equal(merged.previousPerkAverage.killer, 50);

  // 2. Killer topPerks/topBuilds & popularSurvivorBuilds preserved from previous full import
  assert.equal(merged.killers['the-nurse'].topPerks.length, 2);
  assert.equal(merged.killers['the-nurse'].topBuilds.length, 1);
  assert.equal(merged.popularSurvivorBuilds.length, 1);

  // 3. Merged stats actively drive build rating scores & NightLight buildStats
  const perks = [
    { id: 'lethal-pursuer', name: 'Lethal Pursuer', role: 'killer', tags: ['aura'] },
    { id: 'scourge-hook-pain-resonance', name: 'Scourge Hook: Pain Resonance', role: 'killer', tags: ['slowdown'] },
    { id: 'grim-embrace', name: 'Grim Embrace', role: 'killer', tags: ['slowdown'] },
    { id: 'nowhere-to-hide', name: 'Nowhere to Hide', role: 'killer', tags: ['aura'] },
  ];
  const rating = scoreBuild(perks, 'killer', ['slowdown'], { stats: merged, killerId: 'the-nurse' });
  assert.ok(rating.community, 'community score should be computed');
  assert.ok(rating.community.points > 0, `expected positive community points, got ${rating.community.points}`);
  assert.equal(rating.community.perks[0].scope, 'killer', 'killer-specific topPerks should still be used after quick import');

  const nl = buildStats({ role: 'killer', resolved: { perks, killer: { id: 'the-nurse', name: 'The Nurse' } } }, merged);
  assert.ok(nl?.exact, 'exact NightLight topBuild match should survive quick import');
});

test('guardDescriptions restores previous clean text when wiki returns broken placeholders', () => {
  const oldList = [
    { id: 'wake-up', name: 'Wake Up!', description: 'Increases gate opening speed by 15/20/25%.' },
    { id: 'gloves', name: 'Fingerless Parade Gloves', description: 'Increases bottle throw speed by 10%.' },
  ];
  const freshList = [
    { id: 'wake-up', name: 'Wake Up!', description: 'Increases speed by #effect for each Survivor.' },
    { id: 'gloves', name: 'Fingerless Parade Gloves', description: 'Increases speed by #effect(1).' },
    { id: 'new-perk', name: 'Brand New Perk', description: 'Valid new description.' },
  ];
  const logs = [];
  const kept = guardDescriptions(freshList, oldList, 'perk', (m) => logs.push(m));
  assert.equal(kept, 2);
  assert.equal(freshList[0].description, oldList[0].description);
  assert.equal(freshList[1].description, oldList[1].description);
  assert.equal(freshList[2].description, 'Valid new description.');
});

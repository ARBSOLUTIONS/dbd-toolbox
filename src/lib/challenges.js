// Challenge generator: random builds + an objective to complete in a real match.
// Challenges only store ids, so they stay valid after a data refresh.
//
// Kinds:
//   roulette     4 random perks (no conflicts) + random item/add-ons
//   theme        all perks from one playstyle (e.g. only stealth)
//   adept        only the 3 unique perks of one character (the in-game "Adept" achievement rules)
//   restriction  a rule: no perks, hex-only, boon-only, off-meta only, no item
//   meme         a deliberately weak build (low synergy score)
//   roster       a random killer with a build made for it

import { PLAYSTYLES } from './tags.js';
import { scoreBuild } from './builds.js';
import { pickPerks } from './generator.js';
import { makeRng, pick, shuffle, localDay, isoWeek } from './random.js';

export const KINDS = {
  roulette: 'Perk roulette',
  theme: 'Theme',
  adept: 'Adept',
  restriction: 'Restriction',
  meme: 'Meme build',
  roster: 'Killer roster',
};
export const DIFFICULTIES = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };
const POINTS = { easy: 10, medium: 25, hard: 50 };
const KIND_BONUS = { adept: 25, meme: 15, restriction: 15 };

const OBJECTIVES = {
  survivor: {
    easy: ['Complete 2 generators (alone or together).', 'Unhook 2 teammates.', 'Survive until the exit gates are powered.'],
    medium: ['Escape the trial.', 'Complete 3 generators and survive until the end.'],
    hard: ['Escape and unhook at least 2 teammates.', 'Escape without being hooked even once.'],
  },
  killer: {
    easy: ['Hook survivors 5 times.', 'Down 4 different survivors.'],
    medium: ['Sacrifice or kill 2 survivors.', 'Hook 3 different survivors before 3 generators are done.'],
    hard: ['Sacrifice or kill all 4 survivors (4K).', 'Get a 3K or better with at most 2 generators completed.'],
  },
};

const exhausts = (p) => p.exhaustion && p.id !== 'adrenaline';

/** 4 random perks of a role with no twins and at most one Exhaustion perk. */
function randomPerks(rng, perks, role, filter = () => true, count = 4) {
  const chosen = [];
  for (const p of shuffle(rng, perks.filter((x) => x.role === role && filter(x)))) {
    if (chosen.length >= count) break;
    if (chosen.some((c) => c.aliasIds.includes(p.id))) continue;
    if (exhausts(p) && chosen.some(exhausts)) continue;
    chosen.push(p);
  }
  return chosen;
}

function randomItem(rng, data, type) {
  const items = data.items.filter((i) => i.type !== 'firecracker' && i.rarity !== 'event' && (!type || i.type === type));
  const item = pick(rng, items);
  const addons = item ? shuffle(rng, data.addons.filter((a) => a.itemType === item.type && a.rarity !== 'event')).slice(0, 2) : [];
  return { item, addons };
}

function killerAddons(rng, data, killer) {
  return shuffle(rng, data.addons.filter((a) => a.killer === killer.name && a.rarity !== 'event')).slice(0, 2);
}

/**
 * Generates one challenge.
 * options: { role: 'survivor'|'killer'|'any', difficulty: 'easy'|'medium'|'hard'|'any',
 *            kind: one of KINDS or 'any', seed, label }
 */
export function generateChallenge(data, curatedBuilds = [], options = {}) {
  const seed = options.seed ?? `${Date.now()}-${Math.random()}`;
  const rng = makeRng(String(seed));
  const role = options.role && options.role !== 'any' ? options.role : pick(rng, ['survivor', 'killer']);
  const difficulty =
    options.difficulty && options.difficulty !== 'any' ? options.difficulty : pick(rng, ['easy', 'medium', 'hard']);
  let kind = options.kind && options.kind !== 'any' ? options.kind : pick(rng, Object.keys(KINDS));
  if (kind === 'roster' && role === 'survivor') kind = 'roulette';

  const perks = data.perks;
  let chosen = [];
  let killer = role === 'killer' ? pick(rng, data.killers) : null;
  let character = null;
  let item = null;
  let addons = [];
  let title = '';
  let description = '';
  let rule = null;
  let style = null;

  if (kind === 'adept') {
    // The in-game "Adept" achievements: win using only that character's 3 unique perks.
    const pool = (role === 'killer' ? data.killers : data.survivors).filter((c) => c.perks?.length);
    character = pick(rng, pool);
    if (role === 'killer') killer = character;
    chosen = character.perks.map((id) => perks.find((p) => p.id === id && p.role === role)).filter(Boolean);
    title = `Adept ${character.name.replace(/^The /, '')}`;
    description = `Play as ${character.name} with only their own unique perks, like the in-game Adept achievement.`;
    if (chosen.filter(exhausts).length > 1) {
      description += ' Note: more than one of these perks causes Exhaustion, so time them carefully.';
    }
    rule = 'adept';
  } else if (kind === 'theme') {
    style = pick(rng, Object.keys(PLAYSTYLES[role]).filter((s) => perks.filter((p) => p.role === role && p.tags.includes(s)).length >= 4));
    chosen = randomPerks(rng, perks, role, (p) => p.tags.includes(style));
    title = `Only ${PLAYSTYLES[role][style]}`;
    description = `Every perk in this build is a ${PLAYSTYLES[role][style].toLowerCase()} perk. Play the whole match in that style.`;
  } else if (kind === 'restriction') {
    const rules =
      role === 'killer'
        ? ['no-perks', 'hex-only', 'off-meta', 'no-addons']
        : ['no-perks', 'boon-only', 'off-meta', 'no-item'];
    rule = pick(rng, rules);
    const common = new Set(curatedBuilds.flatMap((b) => b.resolved.perks.filter(Boolean).map((p) => p.id)));
    if (rule === 'hex-only') chosen = randomPerks(rng, perks, role, (p) => /^Hex:/.test(p.name));
    if (rule === 'boon-only') chosen = randomPerks(rng, perks, role, (p) => /^Boon:/.test(p.name));
    if (rule === 'off-meta' || rule === 'no-item' || rule === 'no-addons')
      chosen = randomPerks(rng, perks, role, (p) => rule !== 'off-meta' || !common.has(p.id));
    title = {
      'no-perks': 'Naked',
      'hex-only': 'Hex Gambler',
      'boon-only': 'Totem Keeper',
      'off-meta': 'Hipster',
      'no-item': 'Empty Hands',
      'no-addons': 'Base Kit Power',
    }[rule];
    description = {
      'no-perks': 'No perks at all. Just you and your skill.',
      'hex-only': 'Four hex perks. Protect your totems!',
      'boon-only': 'Only boon perks. Keep your totems lit.',
      'off-meta': 'Only perks that no hand-picked build uses. Prove the forgotten perks work.',
      'no-item': role === 'survivor' ? 'No item and no add-ons.' : 'No add-ons.',
      'no-addons': 'No add-ons: your power as it is.',
    }[rule];
  } else if (kind === 'meme') {
    // Try a few random builds and keep the one with the lowest synergy score.
    let worst = null;
    for (let i = 0; i < 12; i++) {
      const candidate = randomPerks(rng, perks, role);
      const { score } = scoreBuild(candidate, role);
      if (!worst || score < worst.score) worst = { perks: candidate, score };
    }
    chosen = worst.perks;
    title = 'Meme Machine';
    description = `A build with a synergy score of only ${worst.score}. Make it work anyway!`;
  } else if (kind === 'roster') {
    style = pick(rng, ['slowdown', 'aura', 'stealth', 'anti-heal', 'snowball']);
    chosen = pickPerks(perks, 'killer', style, { seed: randomPerks(rng, perks, 'killer', (p) => p.tags.includes(style), 1) });
    title = `${killer.name.replace(/^The /, '')} Duty`;
    description = `Play ${killer.name} with a ${PLAYSTYLES.killer[style].toLowerCase()} build.`;
  } else {
    kind = 'roulette';
    chosen = randomPerks(rng, perks, role);
    title = 'Perk Roulette';
    description = 'Four random perks. Find out how they work together.';
  }

  // Items and add-ons (unless a rule forbids them).
  if (role === 'survivor' && !['no-item', 'no-perks'].includes(rule) && kind !== 'adept') {
    ({ item, addons } = randomItem(rng, data, rule === 'boon-only' ? 'medkit' : undefined));
  }
  if (role === 'killer' && killer && !['no-addons', 'no-perks'].includes(rule) && kind !== 'adept') {
    addons = killerAddons(rng, data, killer);
  }

  const objective = kind === 'adept'
    ? role === 'survivor'
      ? 'Escape the trial (the Adept achievement condition).'
      : 'Get a Merciless Killer result (usually a 4K) — the Adept achievement condition.'
    : pick(rng, OBJECTIVES[role][difficulty]);
  // Adept has a fixed difficulty: escaping is medium, a Merciless Killer result is hard.
  const finalDifficulty = kind === 'adept' ? (role === 'killer' ? 'hard' : 'medium') : difficulty;
  const points = Math.round((POINTS[finalDifficulty] + (KIND_BONUS[kind] ?? 0)) * (rule === 'no-perks' ? 1.5 : 1));

  return {
    id: `ch-${String(seed).replace(/[^a-zA-Z0-9-]/g, '').slice(0, 40)}`,
    seed: String(seed),
    label: options.label ?? null,
    kind,
    rule,
    style,
    role,
    difficulty: finalDifficulty,
    title,
    description,
    objective,
    points,
    killer: killer?.name ?? null,
    character: character?.name ?? null,
    perks: chosen.map((p) => p.id),
    item: item?.id ?? null,
    addons: addons.map((a) => a.id),
    createdAt: new Date().toISOString(),
  };
}

/** The same challenge for everyone on the same day / week. */
export function dailyChallenge(data, curated, day = localDay()) {
  return generateChallenge(data, curated, { seed: `daily-${day}`, difficulty: 'medium', label: `Daily ${day}` });
}
export function weeklyChallenge(data, curated, week = isoWeek()) {
  return generateChallenge(data, curated, { seed: `weekly-${week}`, difficulty: 'hard', label: `Weekly ${week}` });
}

/** Turns stored ids back into data objects for display. */
export function resolveChallenge(ch, data) {
  const perk = (id) => data.perks.find((p) => p.id === id && p.role === ch.role) ?? null;
  return {
    ...ch,
    resolved: {
      perks: ch.perks.map(perk),
      killer: ch.killer ? data.killers.find((k) => k.name === ch.killer) ?? null : null,
      character: ch.character
        ? [...data.killers, ...data.survivors].find((c) => c.name === ch.character) ?? null
        : null,
      item: ch.item ? data.items.find((i) => i.id === ch.item) ?? null : null,
      addons: ch.addons
        .map((id) => data.addons.find((a) => a.id === id && (ch.role === 'killer' ? a.killer === ch.killer : true)))
        .filter(Boolean),
    },
  };
}

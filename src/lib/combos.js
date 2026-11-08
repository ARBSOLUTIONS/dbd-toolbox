// Finds perks, items and add-ons that work well with one or more chosen perks.
// Used by the Combos tab ("what goes with X?") and the build maker's suggestions.

import { SYNERGIES } from './builds.js';
import { keywordTags } from './tags.js';

const exhausts = (p) => p.exhaustion && p.id !== 'adrenaline';

/**
 * Ranks perks of the same role by how well they go with `chosen` (array of perks).
 * Returns [{ perk, score, reasons: [] }] sorted best first.
 *
 * Points:
 *   +10  known strong pair (SYNERGIES list)
 *   +4   used together in a hand-picked build
 *   +2   per shared playstyle tag (+1 if it matches the focus playstyles,
 *        +1 if both perks have the same main purpose = first tag)
 *   -∞   would add a second Exhaustion perk
 */
export function suggestPerks(chosen, allPerks, curatedBuilds = [], { focus = [], limit = 12 } = {}) {
  if (!chosen.length) return [];
  const role = chosen[0].role;
  const chosenIds = new Set(chosen.flatMap((p) => p.aliasIds ?? [p.id]));
  const hasExhaustion = chosen.some(exhausts);

  // How often each perk appears in any hand-picked build: used to break ties.
  const popularity = {};
  for (const b of curatedBuilds) for (const p of b.resolved.perks) if (p) popularity[p.id] = (popularity[p.id] ?? 0) + 1;

  const together = {};
  for (const b of curatedBuilds) {
    const buildIds = b.resolved.perks.filter(Boolean).map((p) => p.id);
    if (!buildIds.some((id) => chosenIds.has(id))) continue;
    for (const id of buildIds) if (!chosenIds.has(id)) together[id] = (together[id] ?? 0) + 1;
  }

  const results = [];
  for (const perk of allPerks) {
    // Skip chosen perks and their identical twins (same effect, different name).
    if (perk.role !== role || chosenIds.has(perk.id)) continue;
    const ids = perk.aliasIds ?? [perk.id];
    if (hasExhaustion && exhausts(perk)) continue;

    let score = 0;
    const reasons = [];
    for (const [a, b, why] of SYNERGIES) {
      if ((chosenIds.has(a) && ids.includes(b)) || (chosenIds.has(b) && ids.includes(a))) {
        score += 10;
        reasons.push(why);
      }
    }
    if (together[perk.id]) {
      score += 4 * together[perk.id];
      reasons.push(`Used together in ${together[perk.id]} hand-picked build${together[perk.id] > 1 ? 's' : ''}.`);
    }
    const chosenTags = new Set(chosen.flatMap((p) => p.tags));
    const shared = perk.tags.filter((t) => chosenTags.has(t));
    if (shared.length) {
      // The first tag is a perk's main purpose: same main purpose = better fit.
      const samePrimary = chosen.some((c) => c.tags[0] === perk.tags[0]);
      score += shared.length * 2 + shared.filter((t) => focus.includes(t)).length + (samePrimary ? 1 : 0);
      reasons.push(`Also ${shared.join(', ')}.`);
    }
    if (score > 0) results.push({ perk, score, reasons });
  }

  return results
    .sort(
      (a, b) =>
        b.score - a.score ||
        (popularity[b.perk.id] ?? 0) - (popularity[a.perk.id] ?? 0) ||
        a.perk.name.localeCompare(b.perk.name),
    )
    .slice(0, limit);
}

// Which survivor item type supports which playstyle tag.
const ITEM_FOR_TAG = {
  'gen-rush': 'toolbox',
  sabotage: 'toolbox',
  healing: 'medkit',
  altruism: 'medkit',
  'anti-tunnel': 'medkit',
  chase: 'flashlight',
  aura: 'map',
  items: 'key',
  endgame: 'key',
  stealth: 'fog-vial',
  totems: 'map',
  boon: 'medkit',
};

/** Suggests survivor item types for a set of perks, best first. */
export function suggestItemTypes(perks) {
  const votes = {};
  for (const p of perks) for (const t of p.tags) if (ITEM_FOR_TAG[t]) votes[ITEM_FOR_TAG[t]] = (votes[ITEM_FOR_TAG[t]] ?? 0) + 1;
  return Object.entries(votes)
    .sort((a, b) => b[1] - a[1])
    .map(([type, n]) => ({ type, votes: n }));
}

/**
 * Ranks add-ons (for one killer, or one item type) by how many tags they share
 * with the chosen perks. Add-ons are tagged with the same keyword rules as perks.
 */
export function suggestAddons(perks, addons, limit = 6) {
  const tags = new Set(perks.flatMap((p) => p.tags));
  const rarityBonus = { iridescent: 2, 'very-rare': 1.5, rare: 1, uncommon: 0.5 };
  return addons
    .map((a) => {
      const aTags = keywordTags(a, a.role ?? 'killer');
      const shared = aTags.filter((t) => tags.has(t));
      return { addon: a, shared, score: shared.length * 3 + (rarityBonus[a.rarity] ?? 0) };
    })
    .filter((x) => x.addon.rarity !== 'event')
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

// Shared build logic: used by the web app and by `npm run check-builds`.
// - resolveBuild: turns names from builds.json into the real data objects
// - scoreBuild: gives a 0-100 rating plus plain-English reasons

import { tagsFor, isExhaustionPerk } from './tags.js';
import { communityScore } from './nlStats.js';

const norm = (s) => (s ?? '').toLowerCase().replace(/[’']/g, "'").trim();

function findByName(list, name, extra = () => true) {
  return list.find((x) => norm(x.name) === norm(name) && extra(x)) ?? null;
}

/**
 * Resolves names to data objects. Returns the build plus `resolved` and
 * `missing` (names that do not exist in the current data, e.g. after a rename).
 */
export function resolveBuild(build, data) {
  const missing = [];
  const pick = (list, name, kind, extra) => {
    if (!name) return null;
    const found = findByName(list, name, extra);
    if (!found) missing.push(`${kind}: ${name}`);
    return found;
  };

  const perks = build.perks.map((n) => pick(data.perks, n, 'perk', (p) => p.role === build.role));
  const killer = build.killer ? pick(data.killers, build.killer, 'killer') : null;
  const item = build.role === 'survivor' ? pick(data.items, build.item, 'item') : null;
  const addons = (build.role === 'survivor' ? build.itemAddons ?? [] : build.addons ?? []).map((n) =>
    pick(data.addons, n, 'add-on', (a) =>
      build.role === 'survivor' ? a.itemType === item?.type : a.killer === build.killer,
    ),
  );
  const offering = pick(data.offerings, build.offering, 'offering');

  return { ...build, resolved: { perks, killer, item, addons, offering }, missing };
}

// Pairs that are known to work especially well together (perk ids).
export const SYNERGIES = [
  ['decisive-strike', 'off-the-record', 'Both protect you right after an unhook: a strong anti-tunnel pair.'],
  ['windows-of-opportunity', 'lithe', 'Windows shows the vaults where Lithe gives you speed.'],
  ['deja-vu', 'prove-thyself', 'Déjà Vu shows the gens to work on together for Prove Thyself.'],
  ['resilience', 'no-mither', 'No Mither keeps you injured, so Resilience is always active.'],
  ['borrowed-time', 'babysitter', 'Both protect the survivor you just unhooked.'],
  ['kindred', 'reassurance', 'Kindred shows the hook so you know when to use Reassurance.'],
  ['bond', 'prove-thyself', 'Bond finds teammates to repair with.'],
  ['quick-and-quiet', 'head-on', 'Quick & Quiet hides the locker entry before your Head On stun.'],
  ['plunderers-instinct', 'appraisal', 'Find chests and open them faster.'],
  ['ace-in-the-hole', 'appraisal', 'More chests means more chances at good add-ons.'],
  ['left-behind', 'sole-survivor', 'Two perks for the last survivor: find the hatch while hidden.'],
  ['saboteur', 'breakout', 'Break hooks and speed up the wiggle.'],
  ['adrenaline', 'hope', 'Both trigger in the endgame for a big speed burst.'],
  ['scourge-hook-pain-resonance', 'grim-embrace', 'Both trigger on hooks: gen slowdown without walking.'],
  ['scourge-hook-pain-resonance', 'dead-mans-switch', 'Pain Resonance makes survivors scream and stop repairing; Dead Man’s Switch blocks that gen.'],
  ['pop-goes-the-weasel', 'grim-embrace', 'Hook-based slowdown that stacks.'],
  ['lethal-pursuer', 'nowhere-to-hide', 'Lethal Pursuer makes every aura last longer.'],
  ['lethal-pursuer', 'barbecue-and-chilli', 'Lethal Pursuer makes Barbecue & Chilli auras last longer.'],
  ['sloppy-butcher', 'thanatophobia', 'Survivors stay injured longer, so Thanatophobia lasts longer.'],
  ['hex-undying', 'hex-ruin', 'Undying protects your other hex totem.'],
  ['hex-thrill-of-the-hunt', 'hex-ruin', 'Thrill of the Hunt protects your hex totems.'],
  ['tinkerer', 'trail-of-torment', 'Both make you undetectable near repaired gens.'],
  ['tinkerer', 'monitor-and-abuse', 'Stealthy approach to gens.'],
  ['spirit-fury', 'enduring', 'Enduring shortens pallet stuns and Spirit Fury breaks the next pallet: a classic anti-loop pair.'],
  ['bamboozle', 'brutal-strength', 'Block windows and break pallets faster: survivors run out of safe loops.'],
  ['no-way-out', 'remember-me', 'Both slow the opening of the exit gates.'],
  ['blood-warden', 'hex-no-one-escapes-death', 'Trap survivors in the endgame and punish them with Exposed.'],
  ['unnerving-presence', 'hex-huntress-lullaby', 'Harder skill checks with fewer warnings.'],
  ['overcharge', 'hex-huntress-lullaby', 'More difficult skill checks when they take over a gen.'],
  ['distressing', 'unnerving-presence', 'A bigger terror radius makes Unnerving Presence hit more gens.'],
];

const BASE_STYLES = {
  survivor: ['chase', 'anti-tunnel', 'gen-rush'],
  killer: ['slowdown', 'aura', 'info'],
};

/**
 * Rates a set of perks for a role and returns { score, pros, cons, tags }.
 * The score (0-100) is a rough guide based on:
 *   - fit:     how many perks match the chosen playstyle(s)
 *   - synergy: known strong pairs and shared tags
 *   - balance: basic needs (killers want slowdown, survivors want a second chance)
 *   - conflicts: things that don't work together (2 exhaustion perks, too many hexes)
 *   - community (optional, -10..+10): with NightLight stats ({ stats, killerId }),
 *     perks that win more often than average on NightLight add points, perks
 *     that win clearly less take points away (see communityScore in nlStats.js).
 */
export function scoreBuild(perks, role, playstyles = [], { stats = null, killerId = null } = {}) {
  const list = perks.filter(Boolean);
  const pros = [];
  const cons = [];
  if (!list.length) return { score: 0, pros, cons: ['No perks selected.'], tags: {} };

  const tagged = list.map((p) => ({ ...p, tags: p.tags ?? tagsFor(p).tags }));
  const tagCount = {};
  for (const p of tagged) for (const t of p.tags) tagCount[t] = (tagCount[t] ?? 0) + 1;

  // 1. Fit with the playstyle (max 35). Without a chosen playstyle we use the
  //    build's own most common tag, so a focused build still scores well.
  const focus = playstyles.length
    ? playstyles
    : [Object.entries(tagCount).sort((a, b) => b[1] - a[1])[0]?.[0]].filter(Boolean);
  const matching = tagged.filter((p) => p.tags.some((t) => focus.includes(t))).length;
  const fit = Math.round((matching / 4) * 35);
  if (playstyles.length) {
    if (matching >= 3) pros.push(`${matching} of 4 perks support your ${playstyles.join(' / ')} playstyle.`);
    else cons.push(`Only ${matching} of 4 perks support your ${playstyles.join(' / ')} playstyle.`);
  }
  if (list.length < 4) cons.push(`${4 - list.length} empty perk slot${list.length === 3 ? '' : 's'}.`);

  // 2. Synergy (max 35): known strong pairs count most, shared tags a little.
  const ids = new Set(tagged.flatMap((p) => p.aliasIds ?? [p.id]));
  const pairs = SYNERGIES.filter(([a, b]) => ids.has(a) && ids.has(b));
  for (const [, , why] of pairs) pros.push(why);
  const shared = Object.values(tagCount).filter((n) => n >= 2).length;
  const synergy = Math.min(35, pairs.length * 9 + shared * 3);

  // 3. Balance (max 30)
  let balance = 30;
  if (role === 'killer') {
    if (!tagCount.slowdown) {
      balance -= 12;
      cons.push('No gen slowdown: survivors may finish gens quickly.');
    } else if (tagCount.slowdown >= 2) pros.push('Multiple slowdown perks keep the gens under control.');
    if (!tagCount.aura && !tagCount.info) {
      balance -= 6;
      cons.push('No information perks: you will spend more time searching.');
    }
  } else {
    if (!tagCount.chase && !tagCount['anti-tunnel']) {
      balance -= 12;
      cons.push('No chase or second-chance perk: you can go down quickly when found.');
    }
    if (!tagCount.aura && !tagCount['gen-rush'] && !tagCount.altruism) {
      balance -= 6;
      cons.push('Nothing that helps the team (info, gens or saves).');
    }
  }

  // Conflicts
  const twins = tagged.filter((p, i) => tagged.some((o, j) => j !== i && (o.aliasIds ?? []).includes(p.id)));
  if (twins.length) {
    balance -= 15;
    cons.push(`${twins.map((p) => p.name).join(' and ')} are the same perk (one is a licensed copy).`);
  }
  const exhaustion = tagged.filter((p) => isExhaustionPerk(p) && p.id !== 'adrenaline');
  if (exhaustion.length > 1) {
    balance -= 15;
    cons.push(
      `${exhaustion.map((p) => p.name).join(' and ')} all cause Exhaustion: you can only use one at a time.`,
    );
  }
  const hexes = tagged.filter((p) => /^hex:/i.test(p.name));
  const protector = tagged.some((p) => ['hex-undying', 'hex-thrill-of-the-hunt'].includes(p.id));
  if (hexes.length >= 2 && !protector) {
    balance -= 6;
    cons.push('Several hexes without Undying or Thrill of the Hunt: one dull totem cleanse and they are gone.');
  }

  // Community stats (NightLight): a correction on top of the rule-based score.
  const community = communityScore(list, role, stats, killerId);
  if (community) {
    pros.push(...community.pros);
    cons.push(...community.cons);
  }

  const base = Math.max(0, Math.min(100, fit + synergy + balance));
  const score = Math.max(0, Math.min(100, base + (community?.points ?? 0)));
  return { score, base, community, pros, cons, tags: tagCount };
}

export function defaultPlaystyles(role) {
  return BASE_STYLES[role];
}

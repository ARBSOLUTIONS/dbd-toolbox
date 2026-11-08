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

/** The parts of the build score, in the order they are shown. */
export const SCORE_PARTS = [
  { id: 'fit', label: 'Playstyle fit', max: 35, explain: 'How many of the 4 perks support the chosen playstyle (35 × matching ÷ 4).' },
  { id: 'synergy', label: 'Synergy', max: 35, explain: 'Known strong perk pairs (9 each) and tags shared by 2+ perks (3 each), max 35.' },
  { id: 'balance', label: 'Balance', max: 30, explain: 'Basic needs: killers want gen slowdown (−12 without) and info (−6 without); survivors want a chase or second-chance perk (−12 without) and something for the team (−6 without).' },
  { id: 'conflicts', label: 'Conflicts', max: 0, explain: 'Penalties: the same perk twice (licensed copy, −15), two Exhaustion perks (−15), 2+ hexes without Undying or Thrill of the Hunt (−6).' },
  { id: 'community', label: 'Community stats', max: 10, explain: 'NightLight: how often these perks win compared with the average perk of their role, corrected for small samples (−10 to +10). Only when stats are imported.' },
];

/**
 * Rates a set of perks for a role. The score (0-100) is a rough guide:
 *   fit (0-35) + synergy (0-35) + balance (0-30) − conflicts, capped to 0-100,
 *   then + community (−10..+10, NightLight stats, only with { stats }), capped again.
 * Returns { score, base, parts, community, pros, cons, tags }. `parts` lists
 * each part's points with the reasons behind it (see SCORE_PARTS).
 */
export function scoreBuild(perks, role, playstyles = [], { stats = null, killerId = null } = {}) {
  const list = perks.filter(Boolean);
  const pros = [];
  const cons = [];
  const notes = { fit: [], synergy: [], balance: [], conflicts: [], community: [] };
  const pro = (part, text) => {
    pros.push(text);
    notes[part].push({ good: true, text });
  };
  const con = (part, text) => {
    cons.push(text);
    notes[part].push({ good: false, text });
  };
  if (!list.length) return { score: 0, base: 0, parts: [], community: null, pros, cons: ['No perks selected.'], tags: {} };

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
    if (matching >= 3) pro('fit', `${matching} of 4 perks support your ${playstyles.join(' / ')} playstyle.`);
    else con('fit', `Only ${matching} of 4 perks support your ${playstyles.join(' / ')} playstyle.`);
  } else if (focus.length) {
    notes.fit.push({ good: matching >= 3, text: `${matching} of 4 perks share the build's main purpose (${focus[0]}).` });
  }
  if (list.length < 4) con('fit', `${4 - list.length} empty perk slot${list.length === 3 ? '' : 's'}.`);

  // 2. Synergy (max 35): known strong pairs count most, shared tags a little.
  const ids = new Set(tagged.flatMap((p) => p.aliasIds ?? [p.id]));
  const pairs = SYNERGIES.filter(([a, b]) => ids.has(a) && ids.has(b));
  for (const [, , why] of pairs) pro('synergy', why);
  const sharedTags = Object.entries(tagCount).filter(([, n]) => n >= 2).map(([t]) => t);
  const synergy = Math.min(35, pairs.length * 9 + sharedTags.length * 3);
  if (sharedTags.length) notes.synergy.push({ good: true, text: `Shared purposes: ${sharedTags.join(', ')} (+3 each).` });
  if (!pairs.length && !sharedTags.length) notes.synergy.push({ good: false, text: 'No known strong pairs and no shared purposes.' });

  // 3. Balance (max 30)
  let balance = 30;
  if (role === 'killer') {
    if (!tagCount.slowdown) {
      balance -= 12;
      con('balance', 'No gen slowdown: survivors may finish gens quickly.');
    } else if (tagCount.slowdown >= 2) pro('balance', 'Multiple slowdown perks keep the gens under control.');
    if (!tagCount.aura && !tagCount.info) {
      balance -= 6;
      con('balance', 'No information perks: you will spend more time searching.');
    }
  } else {
    if (!tagCount.chase && !tagCount['anti-tunnel']) {
      balance -= 12;
      con('balance', 'No chase or second-chance perk: you can go down quickly when found.');
    }
    if (!tagCount.aura && !tagCount['gen-rush'] && !tagCount.altruism) {
      balance -= 6;
      con('balance', 'Nothing that helps the team (info, gens or saves).');
    }
  }

  // 4. Conflicts (penalties)
  let conflicts = 0;
  const twins = tagged.filter((p, i) => tagged.some((o, j) => j !== i && (o.aliasIds ?? []).includes(p.id)));
  if (twins.length) {
    conflicts += 15;
    con('conflicts', `${twins.map((p) => p.name).join(' and ')} are the same perk (one is a licensed copy).`);
  }
  const exhaustion = tagged.filter((p) => isExhaustionPerk(p) && p.id !== 'adrenaline');
  if (exhaustion.length > 1) {
    conflicts += 15;
    con('conflicts', `${exhaustion.map((p) => p.name).join(' and ')} all cause Exhaustion: you can only use one at a time.`);
  }
  const hexes = tagged.filter((p) => /^hex:/i.test(p.name));
  const protector = tagged.some((p) => ['hex-undying', 'hex-thrill-of-the-hunt'].includes(p.id));
  if (hexes.length >= 2 && !protector) {
    conflicts += 6;
    con('conflicts', 'Several hexes without Undying or Thrill of the Hunt: one dull totem cleanse and they are gone.');
  }

  // 5. Community stats (NightLight): a correction on top of the rule-based score.
  const community = communityScore(list, role, stats, killerId);
  if (community) {
    for (const t of community.pros) pro('community', t);
    for (const t of community.cons) con('community', t);
  }

  const base = Math.max(0, Math.min(100, fit + synergy + balance - conflicts));
  const score = Math.max(0, Math.min(100, base + (community?.points ?? 0)));
  const value = { fit, synergy, balance, conflicts: -conflicts, community: community?.points ?? null };
  const parts = SCORE_PARTS.filter((p) => p.id !== 'community' || community).map((p) => ({ ...p, value: value[p.id], notes: notes[p.id] }));
  return { score, base, parts, community, pros, cons, tags: tagCount };
}

export function defaultPlaystyles(role) {
  return BASE_STYLES[role];
}

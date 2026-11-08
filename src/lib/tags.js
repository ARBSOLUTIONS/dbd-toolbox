// Tags describe what a perk does (stealth, chase, slowdown...), so we can group
// perks by playstyle and explain why they work together.
//
// 1. Every known perk has hand-checked tags in perkTags.js (most reliable).
// 2. Perks that are not in that list yet (e.g. new in a patch) get tags from
//    the keyword rules below, as a best guess. `npm test` lists those perks.
import { SURVIVOR_PERK_TAGS, KILLER_PERK_TAGS } from './perkTags.js';

export const PLAYSTYLES = {
  survivor: {
    stealth: 'Stealth',
    chase: 'Chase',
    'gen-rush': 'Gen-rush',
    altruism: 'Altruism',
    aura: 'Aura reading',
    'anti-tunnel': 'Anti-tunnel',
    healing: 'Healing',
    endgame: 'Endgame',
    sabotage: 'Sabotage & saves',
    boon: 'Boons',
    items: 'Items & chests',
    totems: 'Totems',
  },
  killer: {
    slowdown: 'Slowdown',
    aura: 'Aura reading',
    chase: 'Chase',
    stealth: 'Stealth',
    hex: 'Hex',
    scourge: 'Scourge hook',
    endgame: 'Endgame',
    'anti-heal': 'Anti-heal',
    snowball: 'Snowball',
    info: 'Information',
  },
};

const MANUAL = { survivor: SURVIVOR_PERK_TAGS, killer: KILLER_PERK_TAGS };

// Fallback keyword rules: [tag, regex] tested against the lower-case description.
// They are written to catch what a perk GIVES you, not side effects
// (e.g. "your Aura is revealed to the Killer" is a drawback, not aura reading).
const AURA_FOR_YOU = /aura-reading ability|auras? of [^.]{0,80}(are|is) revealed to you|you see the auras?/;

const SURVIVOR_RULES = [
  ['anti-tunnel', /after (being|you are) unhooked|unhooking yourself|endurance status|self-recover|unbreakable/],
  ['chase', /haste status|rushed vault|vault(ing)? speed|pallet-stun|stun(s|ning)? the killer|while being chased|blind the killer/],
  ['stealth', /scratch marks|pools? of blood|grunts? of pain|undetectable|suppresses? (all )?noises|while crouched|crows/],
  ['gen-rush', /repair speed|repairing generators|repair progress|great (repair )?skill check|toolbox/],
  ['altruism', /unhook another|unhooking another|hooked survivor|another survivor|other survivors/],
  ['aura', AURA_FOR_YOU],
  ['healing', /healing speed|heal(s)? (yourself|you to)|self-heal|healing action/],
  ['endgame', /exit gates? (are|is) powered|all generators are (completed|repaired)|hatch/],
  ['sabotage', /sabotage|wiggle|being carried/],
  ['boon', /^boon:/],
  ['items', /chests?|item's|items? (you|with)|add-ons?/],
  ['totems', /totem/],
];

const KILLER_RULES = [
  ['slowdown', /regress|blocks? (the |all )?generators?|repair speed|progression penalty|lose[s]? \d+% of (its|their) (current )?progress/],
  ['aura', AURA_FOR_YOU],
  ['chase', /haste status|vault(ing)? speed|break(ing)? (dropped )?pallets?|breakable wall|lunge|bloodlust|pallet stuns?/],
  ['stealth', /undetectable|terror radius .{0,30}(reduc|decreas|suppress)/],
  ['hex', /^hex:/],
  ['scourge', /^scourge hook:/],
  ['endgame', /exit gates? (are|is) powered|all generators are completed|exit gate/],
  ['anti-heal', /mangled|broken status|healing speed|haemorrhage|deep wound/],
  ['snowball', /exposed status|dying state .{0,40}(all|other) survivors|oblivious/],
  ['info', /loud noise notification|killer instinct|is revealed|notification/],
];

// Survivors: only one Exhaustion perk works at a time.
export function isExhaustionPerk(perk) {
  return perk.role === 'survivor' && /causes? the exhausted|cannot be used (while|when) exhausted/i.test(perk.description);
}

/** Tags from the keyword rules only (used for new perks and for add-ons). */
export function keywordTags(entity, role = entity.role) {
  const text = `${entity.name}\n${entity.description}`.toLowerCase();
  const rules = role === 'killer' ? KILLER_RULES : SURVIVOR_RULES;
  return rules
    .filter(([, re]) => re.test(text))
    .map(([tag]) => tag)
    .slice(0, 3);
}

/** Returns { tags, source } where source is 'manual' or 'keywords'. */
export function tagsFor(perk) {
  const table = MANUAL[perk.role] ?? {};
  const manual = table[perk.name] ?? (perk.identicalTo ? table[perk.identicalTo] : null);
  if (manual) return { tags: manual, source: 'manual' };
  const tags = keywordTags(perk);
  if (isExhaustionPerk(perk) && !tags.includes('chase')) tags.unshift('chase');
  return { tags: tags.slice(0, 3), source: 'keywords' };
}

/**
 * Adds `tags`, `tagSource`, `exhaustion` and `aliasIds` to every perk.
 * aliasIds = this perk's id plus its "identical twin" (licensed perks that are
 * copies of another perk), so synergies work for both.
 */
export function withTags(perks) {
  const idByName = new Map(perks.map((p) => [`${p.role}:${p.name.toLowerCase()}`, p.id]));
  return perks.map((p) => {
    const twin = p.identicalTo ? idByName.get(`${p.role}:${p.identicalTo.toLowerCase()}`) : null;
    const { tags, source } = tagsFor(p);
    return {
      ...p,
      aliasIds: twin ? [p.id, twin] : [p.id],
      tags,
      tagSource: source,
      exhaustion: isExhaustionPerk(p),
    };
  });
}

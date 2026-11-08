// How good is each offering? Hand-rated, 1-5 stars, for winning matches
// (not for Bloodpoints). Each rating has a short reason.
//
// kind:  impact      changes the match in a useful way
//        situational depends on map, killer or playstyle
//        bloodpoints only gives extra Bloodpoints (great for grinding, no effect on the match)
//        retired     cannot be used anymore (old events, retired offerings)
// role:  who burns it (corrects the wiki page, where some roles are unclear)
//
// New offerings that are not in this list get a rating from category rules.

const BP = (pct) => ({
  stars: 1,
  kind: 'bloodpoints',
  why: `+${pct}% Bloodpoints in one category. No effect on the match; burn it when grinding.`,
});

export const OFFERING_RATINGS = {
  // --- Memento Mori (killer) ---
  'Ebony Memento Mori': { stars: 5, kind: 'impact', role: 'killer', why: 'Kill every survivor on their last hook state without carrying them: saves a lot of time and secures kills.' },
  'Ivory Memento Mori': { stars: 4, kind: 'impact', role: 'killer', why: 'Kill one survivor on their last hook state without carrying: a guaranteed quick kill.' },

  // --- Hook distance (killer) ---
  'Putrid Oak': { stars: 4, kind: 'impact', role: 'killer', why: 'Hooks spawn much closer together: shorter carries, fewer wiggle escapes and saves.' },
  'Rotten Oak': { stars: 3, kind: 'impact', role: 'killer', why: 'Hooks spawn closer together: shorter carries.' },
  'Mouldy Oak': { stars: 2, kind: 'impact', role: 'killer', why: 'Hooks spawn a little closer together.' },
  'Petrified Oak': { stars: 1, kind: 'situational', role: 'killer', why: 'Spreads hooks further apart, which makes carries longer. Only for challenges or fun.' },

  // --- Shrouds (survivor) ---
  "Vigo's Shroud": { stars: 4, kind: 'impact', role: 'survivor', why: 'You spawn as far from the killer as possible: a safe start, great for stealth and gen builds.' },
  'Shroud of Separation': { stars: 4, kind: 'impact', role: 'survivor', why: 'All survivors spawn apart: the killer cannot find a group early, and gens get started all over the map.' },
  'Shroud of Union': { stars: 2, kind: 'situational', role: 'survivor', why: 'Start together with a teammate. Nice for duos and team builds, risky against strong early pressure.' },
  'Shroud of Vanishing': { stars: 2, kind: 'situational', role: 'survivor', why: 'Cancels spawn offerings of others. Only useful as a counter.' },

  // --- Wards ---
  'White Ward': { stars: 3, kind: 'impact', role: 'survivor', why: 'Keep your item and add-ons if you die: great with expensive items and add-ons.' },
  'Sacrificial Ward': { stars: 3, kind: 'situational', role: 'both', why: 'Blocks map offerings of the other side, so you do not end up on their favourite map.' },
  'Black Ward': { stars: 2, kind: 'situational', role: 'both', why: 'Your add-ons are not used up after the match. Saves rare add-ons, no effect in the match.' },

  // --- Fog ---
  'Clear Reagent': { stars: 3, kind: 'situational', role: 'both', why: 'Much less fog: survivors see stealth killers coming earlier; good against Myers, Ghost Face, Wraith.' },
  'Murky Reagent': { stars: 3, kind: 'situational', role: 'both', why: 'Much thicker fog: helps stealth killers and stealthy survivors.' },
  'Hazy Reagent': { stars: 2, kind: 'situational', role: 'both', why: 'Thicker fog: a small stealth bonus.' },
  'Faint Reagent': { stars: 1, kind: 'situational', role: 'both', why: 'Slightly thicker fog. Barely noticeable.' },

  // --- Basement / hatch / chests ---
  'Bloodied Blueprint': { stars: 2, kind: 'situational', role: 'killer', why: 'Basement more likely in the Killer Shack. Useful for basement builds, otherwise little impact.' },
  'Torn Blueprint': { stars: 2, kind: 'situational', role: 'killer', why: 'Basement more likely in the main building. Useful for basement builds.' },
  'Annotated Blueprint': { stars: 2, kind: 'situational', role: 'survivor', why: 'Hatch more likely near the Killer Shack: helps if you plan to escape through the hatch.' },
  "Vigo's Blueprint": { stars: 2, kind: 'situational', role: 'survivor', why: 'Hatch more likely near the main building.' },
  'Shiny Coin': { stars: 3, kind: 'situational', role: 'survivor', why: 'Two extra chests: great with chest and item builds (Plunderer’s Instinct, Appraisal).' },
  'Tarnished Coin': { stars: 2, kind: 'situational', role: 'survivor', why: 'One extra chest.' },
  'Scratched Coin': { stars: 1, kind: 'situational', role: 'survivor', why: 'One chest less. Rarely useful.' },
  'Cut Coin': { stars: 1, kind: 'situational', role: 'survivor', why: 'Two chests less. Rarely useful.' },

  // --- Bloodpoints in all categories (only Bloodpoints, no effect in the match) ---
  'Escape! Cake': { stars: 1, kind: 'bloodpoints', role: 'survivor', why: '+100% Bloodpoints in every category. No effect on the match: a farming offering.' },
  'Survivor Pudding': { stars: 1, kind: 'bloodpoints', role: 'killer', why: '+100% Bloodpoints in every category. No effect on the match: a farming offering.' },
  'Bound Envelope': { stars: 1, kind: 'bloodpoints', role: 'survivor', why: '+25% Bloodpoints in every category for all survivors. No effect on the match.' },
  'Bloody Party Streamers': { stars: 1, kind: 'bloodpoints', role: 'both', why: '+100% Bloodpoints in every category for everyone. No effect on the match.' },

  // --- Luck (survivor) ---
  "Vigo's Jar of Salty Lips": { stars: 2, kind: 'impact', role: 'survivor', why: '+3% self-unhook chance for everyone. Small, but helps the whole team.' },
  'Black Salt Statuette': { stars: 2, kind: 'impact', role: 'survivor', why: '+2% self-unhook chance for everyone.' },
  'Salt Pouch': { stars: 1, kind: 'impact', role: 'survivor', why: '+1% self-unhook chance for everyone. Very small effect.' },
  'Ivory Chalk Pouch': { stars: 1, kind: 'impact', role: 'survivor', why: '+3% self-unhook chance for you only.' },
  'Cream Chalk Pouch': { stars: 1, kind: 'impact', role: 'survivor', why: '+2% self-unhook chance for you only.' },
  'Chalk Pouch': { stars: 1, kind: 'impact', role: 'survivor', why: '+1% self-unhook chance for you only.' },
};

const REALM = {
  stars: 3,
  kind: 'situational',
  role: 'both',
  why: 'Higher chance of this realm. Strong if you pick a map that suits your killer or playstyle (e.g. big open maps for ranged killers).',
};

/** Rating for an offering: { stars, kind, role, why, available }. */
export function rateOffering(o) {
  const retired = /no longer available|was retired/i.test(o.description);
  const bp = rateBloodpoints(o);
  if (retired) return { stars: 0, kind: 'retired', role: o.role, why: 'No longer available in the game.', available: false, bp };
  const legacy = /can no longer be obtained/i.test(o.description);
  const withBp = (r) => ({ ...r, bp, legacy, why: legacy ? `${r.why} No longer in the Bloodweb: only usable if you still have some.` : r.why });

  const manual = OFFERING_RATINGS[o.name];
  if (manual) return withBp({ role: o.role, ...manual, available: true });

  if (o.category === 'Bonus Bloodpoints' || /bonus bloodpoints/i.test(o.description)) {
    const pct = o.description.match(/\+(\d+)\s*%/)?.[1] ?? '?';
    return withBp({ ...BP(pct), role: o.role, available: true });
  }
  if (o.category === 'Realm Selection') return withBp({ ...REALM, available: true });
  if (o.category === 'Events') return withBp({ stars: 1, kind: 'bloodpoints', role: 'both', why: 'Event offering: extra Bloodpoints or event items.', available: true });
  return withBp({ stars: 2, kind: 'situational', role: o.role, why: 'Not rated by hand yet.', available: true });
}

/**
 * How good is an offering for FARMING Bloodpoints? 0-5 stars, from the description:
 *   +100% in all categories (incl. "for everyone")  5
 *   +X% in all categories for all survivors         3
 *   +25-75% in all categories                       2-4
 *   +100% / +75% / +50% in one category             3 / 2 / 1
 *   event Bloodpoint offerings                      3 (only during the event)
 *   no Bloodpoint bonus                             0
 */
export function rateBloodpoints(o) {
  const d = o.description;
  const pct = Number(d.match(/\+(\d+)\s*%\s*bonus Bloodpoints/i)?.[1] ?? d.match(/\+(\d+)\s*%/)?.[1] ?? 0);
  const allCategories = /all Scoring Categories/i.test(d);
  const everyone = /to all Players|all Players benefit/i.test(d);
  const allSurvivors = /to all Survivors/i.test(d);
  if (/doubles all Bloodpoints awarded/i.test(d)) {
    return { stars: 3, why: 'Doubles event Bloodpoints. Only useful while the event is running.' };
  }
  if (!/bonus Bloodpoints/i.test(d) || !pct) return { stars: 0, why: 'Gives no extra Bloodpoints.' };
  if (allCategories) {
    if (everyone) return { stars: 5, why: `+${pct}% in every category for EVERYONE in the match. The best farming offering; stacks with other Bloodpoint offerings.` };
    if (allSurvivors) return { stars: 3, why: `+${pct}% in every category for all survivors. Great for team farming.` };
    const stars = pct >= 100 ? 5 : pct >= 75 ? 4 : pct >= 50 ? 3 : 2;
    return { stars, why: `+${pct}% in every category for you.` };
  }
  const category = d.match(/in the (\w+) Scoring Category/i)?.[1];
  const stars = pct >= 100 ? 3 : pct >= 75 ? 2 : 1;
  return { stars, why: `+${pct}% in one category${category ? ` (${category})` : ''}. Best in a category you fill up easily.` };
}

/** Adds `rating` to every offering. */
export function withOfferingRatings(offerings) {
  return offerings.map((o) => ({ ...o, rating: rateOffering(o) }));
}

/** Best offering for a role and playstyle (used by the build generator and maker). */
export function bestOffering(offerings, role, style) {
  const prefer = {
    killer: { snowball: 'Ebony Memento Mori', endgame: 'Ebony Memento Mori', default: 'Putrid Oak' },
    survivor: {
      stealth: "Vigo's Shroud",
      'gen-rush': 'Shroud of Separation',
      items: 'Shiny Coin',
      endgame: 'Annotated Blueprint',
      altruism: 'White Ward',
      default: "Vigo's Shroud",
    },
  }[role];
  const name = prefer?.[style] ?? prefer?.default;
  return offerings.find((o) => o.name === name) ?? null;
}

export const KIND_LABEL = {
  impact: 'Impact',
  situational: 'Situational',
  bloodpoints: 'Bloodpoints only',
  retired: 'Not available',
};

export const stars = (n) => (n > 0 ? '★'.repeat(n) + '☆'.repeat(5 - n) : '—');

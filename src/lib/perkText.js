// What the app shows about a perk, add-on, item or offering.
//
// The site does not show the Dead by Daylight Wiki descriptions (CC BY-NC-SA,
// which conflicts with ads). Perks carry our own `text` ({ summary, facts, tip })
// or `text: null` when it is missing or written for an older wiki text; then a
// neutral line with a link to the wiki is shown. Add-ons and items show only
// name, rarity and icon; offerings show our own star rating text.
// See server/ownTexts.js and data/texts.json.

/** True for perks (they always carry a `text` key, even when it is null). */
export const isPerk = (entity) => !!entity && 'text' in entity;

/** Neutral one-liner for a perk without (current) own text. */
export const fallbackLine = (perk) =>
  `${perk.role === 'killer' ? 'Killer' : 'Survivor'} perk${perk.character ? ` of ${perk.character}` : ''}. Our own description is not written yet; see the Dead by Daylight Wiki for the full effect.`;

/** Short plain text for tooltips and pop-ups, or '' when we have none. */
export function blurb(entity) {
  if (!entity) return '';
  if (isPerk(entity)) return entity.text?.summary ?? fallbackLine(entity);
  return entity.rating?.why ?? '';
}

/** Plain text used for searching a perk (name and character are searched separately). */
export const searchText = (perk) => (perk.text ? [perk.text.summary, ...perk.text.facts, perk.text.tip].join(' ') : '');

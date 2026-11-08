// Turns Dead by Daylight Wiki HTML pages into plain data objects.
// Each function gets the raw HTML of one page and returns an array/object.
// Kept free of network code so it can be tested with saved HTML files.
import * as cheerio from 'cheerio';

export const WIKI_BASE = 'https://deadbydaylight.wiki.gg';

/** "A Nurse's Calling" -> "a-nurses-calling" */
export function slugify(name) {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’"]/g, '')
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Turns an <img src> into an absolute URL and a local file name.
 * Full-size images are swapped for a small thumbnail (`size` px) to save bandwidth.
 */
export function iconFromSrc(src, size = 96) {
  if (!src) return null;
  const clean = src.split('?')[0];
  const file = decodeURIComponent(clean.split('/').pop()).replace(/^\d+px-/, '');
  const encoded = clean.split('/').pop();
  const url = clean.includes('/thumb/')
    ? WIKI_BASE + clean
    : `${WIKI_BASE}/images/thumb/${encoded}/${size}px-${encoded}`;
  return { url, file };
}

/** Reads the rarity from the coloured background class, e.g. "very-rare-item-element". */
export function rarityOf($, cell) {
  const cls = $(cell).find('[class*="-item-element"], [class*="-offering-element"]').attr('class') || '';
  const m = cls.match(/([a-z-]+?)-(?:item|offering)-element/);
  if (!m) return null;
  return m[1] === 'visceral' ? 'iridescent' : m[1];
}

/** Parses a standard 3-column wiki table (Icon | Name | Description). */
function parseIconNameTable($, table) {
  const rows = [];
  $(table)
    .find('tr')
    .each((_, tr) => {
      const cells = $(tr).children('th, td');
      if (cells.length < 3) return;
      const nameLink = $(cells[1]).find('a').first();
      const name = (nameLink.text() || $(cells[1]).text()).trim();
      if (!name || name === 'Name') return;
      const { text, quote } = cleanDescription($, cells[2]);
      rows.push({
        id: slugify(name),
        name,
        rarity: rarityOf($, cells[0]),
        description: text,
        quote,
        icon: iconFromSrc($(cells[0]).find('img').attr('src')),
        wikiUrl: nameLink.attr('href') ? WIKI_BASE + nameLink.attr('href') : null,
      });
    });
  return rows;
}

/** Heading text without the "[edit]" links. */
function headingText($, h) {
  const span = $(h).find('.mw-headline');
  return (span.length ? span.text() : $(h).text()).trim();
}

const ITEM_TYPES = {
  Flashlights: 'flashlight',
  Keys: 'key',
  Maps: 'map',
  'Med-Kits': 'medkit',
  Toolboxes: 'toolbox',
  'Fog Vials': 'fog-vial',
  Firecrackers: 'firecracker',
};

/** Parses /wiki/Items: survivor items grouped by type (flashlight, toolbox, ...). */
export function parseItems(html) {
  const $ = cheerio.load(html);
  const items = [];
  // Each item type sits in its own tab panel, e.g. <article id="Flashlights-0">.
  $('article.tabber__panel table.wikitable.overflowScroll').each((_, el) => {
    const panel = $(el).closest('article.tabber__panel').attr('id') || '';
    const type = ITEM_TYPES[panel.replace(/-\d+$/, '').replace(/_/g, ' ')];
    if (!type) return;
    for (const row of parseIconNameTable($, el)) {
      if (row.rarity === 'unused') continue;
      items.push({ ...row, type });
    }
  });
  return dedupe(items);
}

/**
 * Parses /wiki/Add-ons: killer power add-ons (linked to their killer through the
 * "X is the Power of The Y" sentence) and survivor item add-ons.
 */
export function parseAddons(html, killerNames) {
  const $ = cheerio.load(html);
  const addons = [];
  let section = null; // { killer } or { itemType } or null (skip)

  $('h2, h3, h4, p, table.wikitable.overflowScroll').each((_, el) => {
    const tag = el.tagName.toLowerCase();
    if (tag === 'h2' || tag === 'h3' || tag === 'h4') {
      const t = headingText($, el);
      if (ITEM_TYPES[t]) section = { itemType: ITEM_TYPES[t] };
      else if (/decommissioned|unused|change log|any killer/i.test(t)) section = null;
      else if (tag === 'h3') section = { power: t, killer: null };
      return;
    }
    if (tag === 'p') {
      const m = $(el).text().match(/(?:is|are) the Power of (The [^.\n]+?)\s*\./);
      if (m && section && 'power' in section) {
        section.killer = killerNames.find((k) => k === m[1].trim()) ?? m[1].trim();
      }
      return;
    }
    if (!section || (!section.killer && !section.itemType)) return;
    for (const row of parseIconNameTable($, el)) {
      if (row.rarity === 'unused') continue;
      addons.push(
        section.itemType
          ? { ...row, role: 'survivor', itemType: section.itemType }
          : { ...row, role: 'killer', killer: section.killer, power: section.power },
      );
    }
  });
  return dedupe(addons, (a) => `${a.killer ?? a.itemType}:${a.id}`);
}

// Offering category -> which role can use it (everything else: both).
const OFFERING_ROLES = {
  'Bonus Bloodpoints/Survivor': 'survivor',
  'Bonus Bloodpoints/Killer': 'killer',
  Luck: 'survivor',
  'Memento Mori': 'killer',
  'Map Modifications/Hook Distance': 'killer',
  'Map Modifications/Chest Numbers': 'survivor',
  'Map Modifications/Hatch Location': 'survivor',
};

/** Parses /wiki/Offerings, with a category and the role that can burn it. */
export function parseOfferings(html) {
  const $ = cheerio.load(html);
  const offerings = [];
  let h3 = null;
  let h4 = null;
  let inList = false;

  $('h2, h3, h4, table.wikitable.overflowScroll').each((_, el) => {
    const tag = el.tagName.toLowerCase();
    if (tag === 'h2') {
      inList = /list of offerings/i.test(headingText($, el));
      h3 = h4 = null;
      return;
    }
    if (tag === 'h3') {
      h3 = headingText($, el);
      h4 = null;
      return;
    }
    if (tag === 'h4') {
      h4 = headingText($, el);
      return;
    }
    if (!inList || !h3 || h4 === 'All Categories') return;
    const role =
      OFFERING_ROLES[`${h3}/${h4}`] ?? OFFERING_ROLES[h3] ?? 'both';
    for (const row of parseIconNameTable($, el)) {
      offerings.push({ ...row, category: h3, subcategory: h4, role });
    }
  });
  return dedupe(offerings);
}

function dedupe(list, key = (x) => x.id) {
  const seen = new Set();
  return list.filter((x) => (seen.has(key(x)) ? false : seen.add(key(x))));
}

/**
 * Converts a description cell into readable plain text.
 * Paragraphs and list items become separate lines; inline icons are dropped.
 * Returns { text, quote } where quote is the flavour text (if any).
 */
export function cleanDescription($, el) {
  const cell = $(el).clone();
  cell.find('.mobileView, img, .effect-wrapper, .tooltiptext, style, script').remove();

  let quote = null;
  cell.find('.clr9').each((_, q) => {
    quote = $(q).text().trim();
    const p = $(q).closest('p');
    (p.length ? p : $(q)).remove();
  });

  cell.find('br').replaceWith('\n');
  cell.find('li').each((_, li) => {
    $(li).prepend('• ');
    $(li).append('\n');
  });
  cell.find('p, ul, ol, div').each((_, b) => {
    $(b).append('\n');
  });

  const text = cell
    .text()
    .replace(/ /g, ' ')
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').replace(/ ([.,:;%])/g, '$1').trim())
    .filter(Boolean)
    .join('\n')
    // "activates:While injured" -> put the sub-sentence on its own line
    .replace(/:(?=[A-Z•])/g, ':\n');

  if (quote) quote = quote.replace(/([.!?])(?=[A-Z"])/g, '$1 ');
  return { text, quote };
}

/** Parses the /wiki/Perks page: returns all Survivor and Killer perks. */
export function parsePerks(html) {
  const $ = cheerio.load(html);
  const tables = $('table.wikitable.sortable').toArray();
  const perks = [];

  for (const table of tables) {
    // Work out which role this table belongs to from the nearest heading above it.
    const heading = $(table).prevAll('h2, h3, h4').first().text()
      || $(table).parent().prevAll('h2, h3, h4').first().text();
    const role = /killer/i.test(heading) ? 'killer' : /survivor/i.test(heading) ? 'survivor' : null;
    if (!role) continue;

    $(table).find('tr').each((_, tr) => {
      const cells = $(tr).children('th, td');
      if (cells.length < 4) return;
      const nameLink = $(cells[1]).find('a').first();
      const name = nameLink.text().trim();
      if (!name || name === 'Name') return;

      const icon = iconFromSrc($(cells[0]).find('img').attr('src'));
      const { text, quote } = cleanDescription($, cells[2]);
      const charLink = $(cells[3]).find('a').first();
      const character = charLink.attr('title') || charLink.text().trim() || null;

      perks.push({
        id: slugify(name),
        name,
        role,
        character: character && !/^all$/i.test(character) ? character : null,
        description: text,
        quote,
        icon,
        wikiUrl: WIKI_BASE + (nameLink.attr('href') || ''),
      });
    });
  }

  return perks;
}

/**
 * Parses the big character table (on the /wiki/Killers page it lists both
 * Killers and Survivors) and returns the characters of one role with portraits.
 */
export function parseCharacters(html, role) {
  const $ = cheerio.load(html);
  const list = [];
  const seen = new Set();

  $('table.charTable .charPortraitWrapper').each((_, wrap) => {
    if (!$(wrap).find(`.charPortraitRoleBg.${role}`).length) return;
    const link = $(wrap).find('.charPortraitImage a').first();
    const name = (link.attr('title') || '').trim();
    if (!name || seen.has(name)) return;
    seen.add(name);

    list.push({
      id: slugify(name),
      name,
      aliases: ($(wrap).attr('data-search-aliases') || '').trim(),
      portrait: iconFromSrc($(wrap).find('.charPortraitImage img').attr('src'), 128),
      wikiUrl: WIKI_BASE + (link.attr('href') || ''),
    });
  });

  return list;
}

export const parseKillers = (html) => parseCharacters(html, 'killer');
export const parseSurvivors = (html) => parseCharacters(html, 'survivor');

/** Reads the current live patch number from the wiki main page, e.g. "10.2.2a". */
export function parsePatch(html) {
  const $ = cheerio.load(html);
  const link = $('a[href^="/wiki/Patch_"]')
    .filter((_, a) => /^\d+\.\d+/.test($(a).text().trim()))
    .first();
  return link.length ? link.text().trim() : null;
}

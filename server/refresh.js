// Downloads fresh data from the wiki and saves it into the data/ folder.
// Icons are only downloaded when they are not on disk yet, so a refresh after
// a new chapter only fetches the new ones.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parsePerks,
  parseKillers,
  parseSurvivors,
  parsePatch,
  parseItems,
  parseAddons,
  parseOfferings,
  WIKI_BASE,
} from './parse.js';
import { politeFetch } from './wiki.js';
import { computeChanges } from './changes.js';
import { parsePatchHistory, parseAnnouncements } from './predict.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DATA_DIR = path.join(ROOT, 'data');
export const ICON_DIR = path.join(DATA_DIR, 'icons');

async function exists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

/** Downloads one icon if missing and replaces the icon object with a local path. */
async function cacheIcon(icon, folder, log) {
  if (!icon) return null;
  const rel = `${folder}/${icon.file}`;
  const target = path.join(ICON_DIR, folder, icon.file);
  if (!(await exists(target))) {
    try {
      const buf = await politeFetch(new URL(icon.url).pathname, { binary: true, delayMs: 300 });
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, buf);
    } catch (err) {
      log(`  ! icon failed: ${icon.file} (${err.message}) – will use the wiki URL instead`);
      return { local: null, remote: icon.url };
    }
  }
  return { local: `/icons/${rel}`, remote: icon.url };
}

async function readJson(name, fallback = null) {
  try {
    return JSON.parse(await fs.readFile(path.join(DATA_DIR, name), 'utf8'));
  } catch {
    return fallback;
  }
}

/** Reads the data currently on disk (used to detect what a refresh changed). */
export async function readCurrentData() {
  const names = ['meta', 'perks', 'killers', 'survivors', 'items', 'addons', 'offerings'];
  const values = await Promise.all(names.map((n) => readJson(`${n}.json`, n === 'meta' ? null : [])));
  return Object.fromEntries(names.map((n, i) => [n, values[i]]));
}

/**
 * Fetches only the wiki main page (one request) and returns the live patch
 * number plus announced release dates (e.g. the next chapter).
 */
export async function fetchMainPage() {
  const html = await politeFetch('/wiki/Dead_by_Daylight_Wiki');
  return { patch: parsePatch(html), announcements: parseAnnouncements(html) };
}

export async function fetchLivePatch() {
  return (await fetchMainPage()).patch;
}

/**
 * Updates data/patch-history.json from /wiki/Patches/<year>.
 * Fetches the current year; the previous year only once (if not stored yet),
 * because those pages are big.
 */
export async function updatePatchHistory(log = console.log, now = new Date()) {
  const stored = await readJson('patch-history.json', []);
  const year = now.getUTCFullYear();
  const years = [year];
  if (!stored.some((p) => p.date.startsWith(String(year - 1)))) years.push(year - 1);
  let merged = [...stored];
  for (const y of years) {
    try {
      const found = parsePatchHistory(await politeFetch(`/wiki/Patches/${y}`));
      log(`  patch history ${y}: ${found.length} patches`);
      merged = [...found, ...merged.filter((p) => !found.some((f) => f.version === p.version))];
    } catch (err) {
      log(`  ! could not read patch history ${y}: ${err.message}`);
    }
  }
  merged.sort((a, b) => b.date.localeCompare(a.date));
  await writeJson('patch-history.json', merged);
  return merged;
}

async function writeJson(name, value) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const file = path.join(DATA_DIR, name);
  // Write to a temp file first so a crash never leaves half a file behind.
  await fs.writeFile(file + '.tmp', JSON.stringify(value, null, 2));
  await fs.rename(file + '.tmp', file);
}

/**
 * Links each perk to the character that teaches it (perk.character -> character.perks).
 * The wiki names owners in different ways ("Nurse", "The Nurse", the real name
 * "Sally Smithson", or "Frank, Julie, Susie, Joey"), so we compare against the
 * character's name and its search aliases.
 */
function linkPerks(perks, characters, role, log) {
  const norm = (s) => s.toLowerCase().replace(/^the /, '').trim();
  const inAliases = (c, part) => ` ${c.aliases.toLowerCase()} `.includes(` ${part} `);
  for (const c of characters) c.perks = [];
  for (const p of perks) {
    if (p.role !== role || !p.character) continue;
    const name = norm(p.character);
    const owner =
      characters.find((c) => norm(c.name) === name) ||
      characters.find((c) => inAliases(c, name)) ||
      characters.find((c) => name.split(/,\s*/).every((part) => inAliases(c, part)));
    if (owner) {
      owner.perks.push(p.id);
      p.character = owner.name;
    } else {
      log(`  ? could not link perk "${p.name}" to a ${role} (${p.character})`);
    }
  }
}

/**
 * Some licensed perks (e.g. Laurie Strode's Decisive Strike) are now described on
 * the wiki as "Identical to Will to Live." We copy the full description from the
 * twin perk and remember the link in `identicalTo`.
 */
function resolveIdenticalPerks(perks) {
  for (const p of perks) {
    const m = p.description.match(/^Identical to (.+?)\.?$/i);
    if (!m) continue;
    const twin = perks.find((o) => o.role === p.role && o.name.toLowerCase() === m[1].toLowerCase());
    if (!twin) continue;
    p.identicalTo = twin.name;
    p.description = twin.description;
    twin.identicalTo = twin.identicalTo ?? p.name;
  }
}

/**
 * Runs a full refresh. `log` receives progress messages (console or the web UI).
 * Returns the new meta information.
 */
export async function refreshData(log = console.log) {
  const started = new Date();
  const old = await readCurrentData();
  log('Fetching wiki main page (patch number, announcements)...');
  const { patch, announcements } = await fetchMainPage();

  log('Fetching perks...');
  const perks = parsePerks(await politeFetch('/wiki/Perks'));
  log(`  found ${perks.length} perks`);

  log('Fetching killers...');
  // This page's character table lists both Killers and Survivors.
  const charactersHtml = await politeFetch('/wiki/Killers');
  const killers = parseKillers(charactersHtml);
  const survivors = parseSurvivors(charactersHtml);
  log(`  found ${killers.length} killers and ${survivors.length} survivors`);

  log('Fetching items...');
  const items = parseItems(await politeFetch('/wiki/Items'));
  log(`  found ${items.length} items`);

  log('Fetching add-ons...');
  const addons = parseAddons(await politeFetch('/wiki/Add-ons'), killers.map((k) => k.name));
  log(`  found ${addons.length} add-ons`);

  log('Fetching offerings...');
  const offerings = parseOfferings(await politeFetch('/wiki/Offerings'));
  log(`  found ${offerings.length} offerings`);

  if (perks.length < 100 || killers.length < 20 || items.length < 10 || addons.length < 300) {
    throw new Error('The wiki pages look different than expected – keeping the old data.');
  }

  resolveIdenticalPerks(perks);
  linkPerks(perks, killers, 'killer', log);
  linkPerks(perks, survivors, 'survivor', log);

  log('Fetching patch history (for predicting the next patch)...');
  await updatePatchHistory(log);

  log('Downloading missing icons (only new ones; the first time takes a few minutes)...');
  const groups = [
    ['perks', perks, 'icon'],
    ['killers', killers, 'portrait'],
    ['survivors', survivors, 'portrait'],
    ['items', items, 'icon'],
    ['addons', addons, 'icon'],
    ['offerings', offerings, 'icon'],
  ];
  const total = groups.reduce((sum, [, list]) => sum + list.length, 0);
  let n = 0;
  for (const [folder, list, field] of groups) {
    for (const obj of list) {
      obj[field] = await cacheIcon(obj[field], folder, log);
      if (++n % 100 === 0) log(`  icons: ${n}/${total}`);
    }
  }

  const meta = {
    fetchedAt: new Date().toISOString(),
    durationSeconds: Math.round((Date.now() - started) / 1000),
    patch,
    announcements,
    counts: {
      perks: perks.length,
      killers: killers.length,
      survivors: survivors.length,
      items: items.length,
      addons: addons.length,
      offerings: offerings.length,
    },
    sources: [
      { name: 'Dead by Daylight Wiki', url: WIKI_BASE, license: 'CC BY-NC-SA 3.0' },
    ],
  };

  await writeJson('perks.json', perks);
  await writeJson('killers.json', killers);
  await writeJson('survivors.json', survivors);
  await writeJson('items.json', items);
  await writeJson('addons.json', addons);
  await writeJson('offerings.json', offerings);
  // Remember what changed compared to the previous data (kept until the next change).
  const changes = computeChanges(old, { meta, perks, killers, survivors, items, addons, offerings });
  if (changes) {
    await writeJson('changes.json', changes);
    // Patch notes history for the Patch notes page (newest first, last 20 updates).
    const history = await readJson('patch-notes.json', []);
    await writeJson('patch-notes.json', [changes, ...history.filter((h) => h.date !== changes.date)].slice(0, 20));
    log(`Changes since last refresh: ${changes.total} (new perks: ${changes.perks.added.join(', ') || 'none'})`);
  }

  await writeJson('meta.json', meta); // written last: marks a complete refresh
  log(
    `Done. Patch ${patch ?? 'unknown'}: ${perks.length} perks, ${killers.length} killers, ` +
      `${items.length} items, ${addons.length} add-ons, ${offerings.length} offerings.`,
  );
  return meta;
}

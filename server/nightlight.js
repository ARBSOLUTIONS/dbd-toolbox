// Community stats from NightLight (https://nightlight.gg), built from matches
// that players upload.
//
// NightLight's bot protection blocks scripts, so the data is collected in a
// normal browser with scripts/nightlight-collector.js (see the README) and
// imported here from that file:
//
//   npm run update-stats -- --file nightlight-export-2026-11-08.json
//
// The importer also accepts a single saved killers feed
// (https://nightlight.gg/api/v1/stats/global/killers) for a quick killer-only update.
//
// Output: data/nightlight.json. It is kept apart from the wiki data, so a wiki
// refresh never touches it and a bad import never breaks the wiki data.
// NightLight asks API users to credit them: the source is stored in the file
// and shown wherever the numbers appear.
import fs from 'node:fs/promises';
import path from 'node:path';
import { DATA_DIR } from './refresh.js';

export const STATS_FILE = path.join(DATA_DIR, 'nightlight.json');
export const NIGHTLIGHT_PAGE = 'https://nightlight.gg/killers/viewer';

// ---------- name matching ----------

/** "Barbecue & Chilli" → "barbecueandchilli", "The Onryō" → "onryo". */
export function nameKey(s) {
  return String(s ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/^the\s+/, '')
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]/g, '');
}

function distance(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 99;
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return row[b.length];
}

/**
 * Returns a function name → our id. Exact key match first; otherwise a small
 * spelling difference (e.g. "Chili" vs "Chilli") when there is exactly one
 * close candidate.
 */
export function makeMatcher(list) {
  const byKey = new Map(list.map((x) => [nameKey(x.name), x.id]));
  return (name) => {
    const key = nameKey(name);
    if (byKey.has(key)) return byKey.get(key);
    if (key.length < 6) return null;
    const close = [...byKey.keys()].filter((k) => distance(k, key) <= 2);
    return close.length === 1 ? byKey.get(close[0]) : null;
  };
}

// ---------- parsing ----------

const pct = (v) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 100 ? v : null);
const int = (v) => (Number.isInteger(v) && v >= 0 ? v : null);
const killsOf = (row) => [0, 1, 2, 3, 4].map((n) => pct(row?.breakdown?.[n]));

function parseKillerFeed(feed, matchKiller, unmatched) {
  const killers = {};
  let average = null;
  for (const row of feed?.killers ?? []) {
    if (typeof row?.name !== 'string') continue;
    const entry = { matches: int(row.matches), pickRate: pct(row.pick_rate), killRate: pct(row.kill_rate), kills: killsOf(row) };
    if (row.name === 'Overall Average') {
      average = entry;
      continue;
    }
    const id = matchKiller(row.name);
    if (id) killers[id] = entry;
    else unmatched.push(row.name);
  }
  if (Object.keys(killers).length < 20 || !average) {
    throw new Error(`NightLight killer data incomplete (${Object.keys(killers).length} killers matched)`);
  }
  // The "Overall Average" row has matches: 0; the site shows the sum of all killers.
  average.matches = Object.values(killers).reduce((sum, k) => sum + (k.matches ?? 0), 0);
  return { killers, average };
}

function parseSurvivorFeed(feed, matchSurvivor, unmatched) {
  const survivors = {};
  let total = 0;
  let escapes = 0;
  for (const row of feed?.survivors ?? []) {
    if (typeof row?.name !== 'string' || row.name === 'Overall Average') continue;
    const entry = { matches: int(row.count), pickRate: pct(row.pick_rate), escapeRate: pct(row.escape_rate) };
    const id = matchSurvivor(row.name);
    if (!id) {
      unmatched.push(row.name);
      continue;
    }
    survivors[id] = entry;
    if (entry.matches && entry.escapeRate != null) {
      total += entry.matches;
      escapes += (entry.matches * entry.escapeRate) / 100;
    }
  }
  return { survivors, average: { matches: total, escapeRate: total ? Math.round((escapes / total) * 1e4) / 100 : null } };
}

/** Global perk usage: { ourPerkId: { role, usage, rate, count } }. */
function parsePerkFeeds(feeds, perkNames, matchPerk, unmatched) {
  const perks = {};
  const nlToOurs = {};
  for (const [role, feed, rateKey] of [
    ['killer', feeds.killerPerks, 'kill_rate'],
    ['survivor', feeds.survivorPerks, 'escape_rate'],
  ]) {
    for (const row of feed?.perks ?? []) {
      const name = perkNames[row.id];
      if (!name) continue;
      const id = matchPerk[role](name);
      if (!id) {
        unmatched.push(name);
        continue;
      }
      nlToOurs[row.id] = id;
      perks[id] = { role, usage: pct(row.pct), rate: pct(row[rateKey]), count: int(row.count) };
    }
  }
  return { perks, nlToOurs };
}

/** Maps a perk id from NightLight to ours, also for perks missing from the global feeds. */
function perkMapper(nlToOurs, perkNames, matchPerk, role) {
  return (nlId) => {
    if (nlId == null || nlId < 0) return null;
    return nlToOurs[nlId] ?? (perkNames[nlId] ? matchPerk[role](perkNames[nlId]) : null);
  };
}

function parsePage(page, role, mapPerk) {
  const rateKey = role === 'killer' ? 'kill_rate' : 'escape_rate';
  const winKey = role === 'killer' ? 'kills' : 'escapes';
  const topPerks = (page?.top_perks ?? [])
    .map((p) => ({ perk: mapPerk(p.perk_id), usage: pct(p.usage_rate), rate: pct(p[rateKey]) }))
    .filter((p) => p.perk && p.usage);
  const topBuilds = (page?.top_builds ?? [])
    .map((b) => ({
      perks: (b.perks ?? []).map(mapPerk).filter(Boolean),
      usage: pct(b.pct),
      rate: pct(b[rateKey]),
      // "survivors" counts survivor slots: 4 per killer match, 1 per survivor match.
      samples: int(b.survivors),
      wins: int(b[winKey]),
    }))
    .filter((b) => b.perks.length >= 3 && b.samples);
  return { since: page?.stats_since_patch ?? null, topPerks, topBuilds };
}

/** Adds up the survivor top builds of all survivor pages into one list. */
function popularSurvivorBuilds(survivors) {
  const byKey = new Map();
  for (const s of Object.values(survivors)) {
    for (const b of s.topBuilds ?? []) {
      const key = [...b.perks].sort().join('|');
      const cur = byKey.get(key) ?? { perks: [...b.perks].sort(), samples: 0, wins: 0 };
      cur.samples += b.samples ?? 0;
      cur.wins += b.wins ?? 0;
      byKey.set(key, cur);
    }
  }
  return [...byKey.values()]
    .map((b) => ({ ...b, rate: b.samples ? Math.round((b.wins / b.samples) * 1e4) / 100 : null }))
    .sort((a, b) => b.samples - a.samples)
    .slice(0, 40);
}

/**
 * Turns a collector export (or a single killers feed) into data/nightlight.json.
 * `data` = { killers, survivors, perks } from data/. Throws when the input does
 * not look as expected, so the old stats are kept.
 */
export function parseNightlight(raw, data, importedAt = new Date().toISOString()) {
  const unmatched = { killers: [], survivors: [], perks: [] };
  const matchKiller = makeMatcher(data.killers);
  const matchSurvivor = makeMatcher(data.survivors ?? []);
  const matchPerk = {
    killer: makeMatcher((data.perks ?? []).filter((p) => p.role === 'killer')),
    survivor: makeMatcher((data.perks ?? []).filter((p) => p.role === 'survivor')),
  };

  // A single saved killers feed: { status: 'success', data: { killers: [...] } }
  const singleFeed = raw?.status === 'success' && Array.isArray(raw?.data?.killers);
  if (!singleFeed && raw?.format !== 'dbd-toolbox-nightlight-export') {
    throw new Error('Not a NightLight export (run scripts/nightlight-collector.js in your browser first)');
  }
  const feeds = singleFeed ? { killers: raw.data } : raw.feeds ?? {};
  const k = parseKillerFeed(feeds.killers, matchKiller, unmatched.killers);
  const out = {
    source: {
      name: 'NightLight',
      url: NIGHTLIGHT_PAGE,
      note: 'Community stats from matches uploaded to NightLight; not official numbers.',
    },
    collectedAt: singleFeed ? importedAt : raw.collectedAt ?? importedAt,
    importedAt,
    period: { start: feeds.killers?.start ?? null, end: feeds.killers?.end ?? null },
    games: k.average.matches,
    average: k.average,
    killers: k.killers,
    survivorAverage: null,
    survivors: {},
    perks: {},
    popularSurvivorBuilds: [],
    unmatched,
  };
  if (singleFeed) return out;

  const perkNames = raw.perkNames ?? {};
  const s = parseSurvivorFeed(feeds.survivors, matchSurvivor, unmatched.survivors);
  out.survivors = s.survivors;
  out.survivorAverage = s.average;
  const { perks, nlToOurs } = parsePerkFeeds(feeds, perkNames, matchPerk, unmatched.perks);
  if (Object.keys(perks).length < 100) throw new Error(`Only ${Object.keys(perks).length} perks matched – check the export`);
  out.perks = perks;

  for (const [role, pages, target, match] of [
    ['killer', raw.pages?.killers, out.killers, matchKiller],
    ['survivor', raw.pages?.survivors, out.survivors, matchSurvivor],
  ]) {
    const mapPerk = perkMapper(nlToOurs, perkNames, matchPerk, role);
    for (const [name, page] of Object.entries(pages ?? {})) {
      const id = match(name);
      if (!id || !target[id]) continue; // only characters that are in the stats feed
      Object.assign(target[id], parsePage(page, role, mapPerk));
    }
  }
  out.popularSurvivorBuilds = popularSurvivorBuilds(out.survivors);
  for (const list of Object.values(unmatched)) list.splice(0, list.length, ...new Set(list));
  return out;
}

// ---------- perk stats from the perk viewer page text ----------

const PERIOD_RE = /\d{1,2} \w{3} \d{2}, \d{2}:\d{2} - \d{1,2} \w{3} \d{2}, \d{2}:\d{2}/;

/** "11 Oct 26, 18:00" → ISO date (UTC). */
function periodPart(s) {
  const m = s.match(/(\d{1,2}) (\w{3}) (\d{2}), (\d{2}):(\d{2})/);
  if (!m) return null;
  const month = 'JanFebMarAprMayJunJulAugSepOctNovDec'.indexOf(m[2]) / 3;
  if (month < 0) return null;
  return new Date(Date.UTC(2000 + Number(m[3]), month, Number(m[1]), Number(m[4]), Number(m[5]))).toISOString();
}

/**
 * Reads the perk list of https://nightlight.gg/perks/viewer (one role) from
 * either the page text (select all + copy in the browser, saved as .txt) or
 * simple lines "Name|games|pick rate|kill or escape rate" after a "role:" line.
 * Returns { role, period, rows: [{ name, games, pickRate, rate }] }.
 */
export function parsePerkText(text) {
  text = text.replace(/\r\n/g, '\n');
  const rows = [];
  let role = text.match(/^role:\s*(killer|survivor)\s*$/m)?.[1] ?? null;
  for (const m of text.matchAll(/^([^|\n#]+)\|(\d+)\|([\d.]+)\|([\d.]+)\s*$/gm)) {
    rows.push({ name: m[1].trim(), games: Number(m[2]), pickRate: Number(m[3]), rate: Number(m[4]) });
  }
  if (!rows.length) {
    // Page text: name, "N Games", pick-rate bar, kill/escape-rate bar.
    const re = /\n([^\n\t]+)\n(\d+) Games\n(?:\t\n)?0%\nPick Rate\n[\d.]+%\n([\d.]+)%\n0%\n(Escape|Kill) Rate\n100%\n([\d.]+)%/g;
    for (const m of text.matchAll(re)) {
      rows.push({ name: m[1].trim(), games: Number(m[2]), pickRate: Number(m[3]), rate: Number(m[5]) });
      role ??= m[4] === 'Kill' ? 'killer' : 'survivor';
    }
  }
  if (!role || rows.length < 50) {
    throw new Error('This does not look like the NightLight perk list (open nightlight.gg/perks/viewer, select all, copy)');
  }
  const period = text.match(PERIOD_RE)?.[0] ?? null;
  const [start, end] = period ? period.split(' - ').map(periodPart) : [null, null];
  return { role, period: { start, end }, rows };
}

/**
 * Puts one role's perk list into the stats (replacing that role's perks) and
 * stores the average kill/escape rate over all perk appearances of that role.
 */
export function mergePerkText(stats, parsed, perks) {
  const match = makeMatcher(perks.filter((p) => p.role === parsed.role));
  const out = { ...stats, perks: { ...(stats.perks ?? {}) } };
  for (const [id, p] of Object.entries(out.perks)) if (p.role === parsed.role) delete out.perks[id];
  const unmatched = [];
  let games = 0;
  let wins = 0;
  for (const row of parsed.rows) {
    // "Empty Slot" rows (builds with fewer than 4 perks) are no perk and are left
    // out of the average too: their kill rates are far off (up to 70%+), which
    // would make almost every real perk look below average.
    if (/^\d(st|nd|rd|th) Empty Slot$/i.test(row.name)) continue;
    games += row.games;
    wins += (row.games * row.rate) / 100;
    const id = match(row.name);
    if (!id) {
      unmatched.push(row.name);
      continue;
    }
    out.perks[id] = { role: parsed.role, usage: pct(row.pickRate), rate: pct(row.rate), count: row.games };
  }
  const average = games ? Math.round((wins / games) * 1e4) / 100 : null;
  out.perkAverage = { ...(stats.perkAverage ?? {}), [parsed.role]: average };
  out.perkPeriod = { ...(stats.perkPeriod ?? {}), [parsed.role]: parsed.period };
  if (parsed.role === 'survivor' && !stats.survivorAverage?.escapeRate) {
    out.survivorAverage = { matches: null, escapeRate: average, from: 'perk slots' };
  }
  out.unmatched = { ...(stats.unmatched ?? {}), perks: unmatched };
  out.importedAt = new Date().toISOString();
  return out;
}

/** Imports perk viewer text files (one per role) into data/nightlight.json. */
export async function importPerkText(files, { log = console.log } = {}) {
  const perks = await readJson(path.join(DATA_DIR, 'perks.json'), []);
  let stats = await readJson(STATS_FILE, null);
  if (!stats) throw new Error('Import the killer stats first (npm run update-stats -- --file ...)');
  for (const file of files) {
    const parsed = parsePerkText(await fs.readFile(file, 'utf8'));
    stats = mergePerkText(stats, parsed, perks);
    const n = Object.values(stats.perks).filter((p) => p.role === parsed.role).length;
    log(`  ${parsed.role} perks: ${n} of ${parsed.rows.length} rows matched, average ${stats.perkAverage[parsed.role]}% ${parsed.role === 'killer' ? 'kill' : 'escape'} rate`);
    if (stats.unmatched.perks.length) log(`  ? not found in our data: ${stats.unmatched.perks.join(', ')}`);
  }
  await fs.writeFile(STATS_FILE + '.tmp', JSON.stringify(stats, null, 2));
  await fs.rename(STATS_FILE + '.tmp', STATS_FILE);
  return { action: 'updated', perks: Object.keys(stats.perks).length };
}

async function readJson(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch {
    return fallback;
  }
}

/** Imports a collector export (or killers feed) file into data/nightlight.json. */
export async function importStats(file, { log = console.log } = {}) {
  const data = {
    killers: await readJson(path.join(DATA_DIR, 'killers.json'), []),
    survivors: await readJson(path.join(DATA_DIR, 'survivors.json'), []),
    perks: await readJson(path.join(DATA_DIR, 'perks.json'), []),
  };
  if (!data.killers.length) throw new Error('No killers in data/. Run "npm run refresh-data" first.');
  log(`Reading NightLight stats from ${file}...`);
  const raw = JSON.parse(await fs.readFile(file, 'utf8'));
  const stats = parseNightlight(raw, data);

  // A killers-only import keeps the survivor and perk stats of the previous import.
  const old = await readJson(STATS_FILE, null);
  if (!raw.format && old?.perks && Object.keys(old.perks).length) {
    for (const key of ['survivorAverage', 'survivors', 'perks', 'popularSurvivorBuilds']) stats[key] = old[key];
    for (const [id, k] of Object.entries(stats.killers)) {
      const prev = old.killers?.[id];
      if (prev?.topPerks) Object.assign(k, { since: prev.since, topPerks: prev.topPerks, topBuilds: prev.topBuilds });
    }
    log('  killers feed only: kept the survivor, perk and build stats of the previous import');
  }

  await fs.writeFile(STATS_FILE + '.tmp', JSON.stringify(stats, null, 2));
  await fs.rename(STATS_FILE + '.tmp', STATS_FILE);

  const count = (o) => Object.keys(o ?? {}).length;
  log(
    `  ${count(stats.killers)} killers, ${count(stats.survivors)} survivors, ${count(stats.perks)} perks, ` +
      `${stats.games} killer games (${stats.period.start?.slice(0, 10)} – ${stats.period.end?.slice(0, 10)})`,
  );
  const missing = data.killers.filter((k) => !stats.killers[k.id]).map((k) => k.name);
  if (missing.length) log(`  no stats yet for: ${missing.join(', ')}`);
  for (const [kind, names] of Object.entries(stats.unmatched)) {
    if (names.length) log(`  ? NightLight ${kind} not found in our data: ${names.join(', ')}`);
  }
  if (raw.failed?.length) log(`  ! pages the collector could not read: ${raw.failed.join('; ')}`);
  return { action: 'updated', killers: count(stats.killers), survivors: count(stats.survivors), perks: count(stats.perks) };
}

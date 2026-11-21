// Community stats from NightLight (https://nightlight.gg), built from matches
// that players upload. Pure parsing/merging lives in server/nightlight-core.js
// (shared with the Chrome extension); this file adds Node filesystem I/O.
import fs from 'node:fs/promises';
import path from 'node:path';
import { DATA_DIR } from './refresh.js';
import {
  NIGHTLIGHT_PAGE,
  nameKey,
  makeMatcher,
  parseNightlight,
  parsePerkText,
  mergePerkText,
  mergeNightlight,
} from './nightlight-core.js';

export {
  NIGHTLIGHT_PAGE,
  nameKey,
  makeMatcher,
  parseNightlight,
  parsePerkText,
  mergePerkText,
  mergeNightlight,
};

export const STATS_FILE = path.join(DATA_DIR, 'nightlight.json');

async function readJson(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch {
    return fallback;
  }
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

/** Imports an already-parsed NightLight export object into data/nightlight.json. */
export async function importStatsObject(raw, { log = console.log } = {}) {
  const data = {
    killers: await readJson(path.join(DATA_DIR, 'killers.json'), []),
    survivors: await readJson(path.join(DATA_DIR, 'survivors.json'), []),
    perks: await readJson(path.join(DATA_DIR, 'perks.json'), []),
  };
  if (!data.killers.length) throw new Error('No killers in data/. Run "npm run refresh-data" first.');
  const parsed = parseNightlight(raw, data);
  const old = await readJson(STATS_FILE, null);
  const singleFeed = !raw?.format;
  const stats = mergeNightlight(parsed, old, { singleFeed });

  if (singleFeed && old?.perks && Object.keys(old.perks).length) {
    log('  killers feed only: kept the survivor, perk and build stats of the previous import');
  } else if (raw?.mode && raw.mode !== 'full' && old) {
    log(`  ${raw.mode} mode: updated global stats and preserved missing character detail pages from previous import`);
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
  return {
    action: 'updated',
    mode: raw?.mode ?? (singleFeed ? 'killers-feed' : 'full'),
    killers: count(stats.killers),
    survivors: count(stats.survivors),
    perks: count(stats.perks),
    games: stats.games,
  };
}

/** Imports a collector export (or killers feed) file into data/nightlight.json. */
export async function importStats(file, { log = console.log } = {}) {
  log(`Reading NightLight stats from ${file}...`);
  const raw = JSON.parse(await fs.readFile(file, 'utf8'));
  return importStatsObject(raw, { log });
}

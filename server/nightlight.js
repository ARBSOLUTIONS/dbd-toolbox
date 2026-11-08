// Killer pick rate / kill rate stats from NightLight (https://nightlight.gg).
//
// NightLight builds these stats from matches that players upload. The numbers
// come from the same public JSON the page https://nightlight.gg/killers/viewer
// loads. NightLight asks API users to keep requests low and to credit them, so:
// - one request per update, at most once a day (see MIN_AGE_HOURS),
// - a clear User-Agent,
// - the credit is stored in the file and shown in the app.
//
// Output: data/killer-stats.json (kept separate from the wiki data, so a wiki
// refresh never touches it and a failed stats update never breaks the wiki data).
import fs from 'node:fs/promises';
import path from 'node:path';
import { DATA_DIR } from './refresh.js';

export const NIGHTLIGHT_URL = 'https://nightlight.gg/api/v1/stats/global/killers';
export const NIGHTLIGHT_PAGE = 'https://nightlight.gg/killers/viewer?shown=pick';
export const MIN_AGE_HOURS = 24;
const FILE = path.join(DATA_DIR, 'killer-stats.json');
const USER_AGENT = 'DBD-Toolbox/0.1 (fan build helper; one request per day; credits NightLight)';

const pct = (v) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 100 ? v : null);
const norm = (s) => s.normalize('NFKC').toLowerCase().replace(/^the\s+/, '').trim();

/**
 * Turns NightLight's response into our format. Killers are matched to
 * data/killers.json by name ("The Onryō" etc. match exactly; "The " is optional).
 * Throws when the response does not look as expected, so old data is kept.
 */
export function parseNightlight(json, killers, fetchedAt = new Date().toISOString()) {
  const d = json?.data;
  if (json?.status !== 'success' || !Array.isArray(d?.killers)) {
    throw new Error('NightLight response looks different than expected');
  }
  const byName = new Map(killers.map((k) => [norm(k.name), k.id]));
  const stats = {};
  const unmatched = [];
  let average = null;

  for (const row of d.killers) {
    if (typeof row?.name !== 'string') continue;
    const entry = {
      matches: Number.isInteger(row.matches) ? row.matches : null,
      pickRate: pct(row.pick_rate),
      killRate: pct(row.kill_rate),
      // Share of games with 0, 1, 2, 3 and 4 kills (percent).
      kills: [0, 1, 2, 3, 4].map((n) => pct(row.breakdown?.[n])),
    };
    if (row.name === 'Overall Average') {
      average = entry;
      continue;
    }
    const id = byName.get(norm(row.name));
    if (id) stats[id] = entry;
    else unmatched.push(row.name);
  }

  const matched = Object.keys(stats).length;
  if (matched < 20 || !average) throw new Error(`NightLight data incomplete (${matched} killers matched)`);
  // The "Overall Average" row has matches: 0; the page shows the sum of all killers.
  const total = Object.values(stats).reduce((sum, s) => sum + (s.matches ?? 0), 0);
  average.matches = total;

  return {
    source: {
      name: 'NightLight',
      url: NIGHTLIGHT_PAGE,
      note: 'Community stats from matches uploaded to NightLight.',
    },
    fetchedAt,
    period: { start: d.start ?? null, end: d.end ?? null },
    games: average.matches,
    average,
    killers: stats,
    unmatched,
  };
}

async function readJson(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch {
    return fallback;
  }
}

/**
 * Updates data/killer-stats.json. Skips the request when the stored stats are
 * younger than MIN_AGE_HOURS (unless force). Returns { action, why, ... }.
 */
export async function updateKillerStats({ force = false, file = null, log = console.log, now = new Date() } = {}) {
  const old = await readJson(FILE, null);
  const ageHours = old?.fetchedAt ? (now - new Date(old.fetchedAt)) / 36e5 : Infinity;
  if (!file && !force && ageHours < MIN_AGE_HOURS) {
    return { action: 'none', why: `stats are ${ageHours.toFixed(1)} h old (updates once per ${MIN_AGE_HOURS} h)` };
  }

  const killers = await readJson(path.join(DATA_DIR, 'killers.json'), []);
  if (!killers.length) throw new Error('No killers in data/. Run "npm run refresh-data" first.');

  let json;
  if (file) {
    // Manual import: a JSON file the user saved from NIGHTLIGHT_URL in their browser.
    log(`Reading NightLight stats from ${file}...`);
    json = JSON.parse(await fs.readFile(file, 'utf8'));
  } else {
    log(`Fetching killer stats from NightLight...`);
    const res = await fetch(NIGHTLIGHT_URL, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      signal: AbortSignal.timeout(30_000),
    });
    if (res.headers.get('cf-mitigated') === 'challenge') {
      // NightLight's Cloudflare shows a bot check to this client. We respect
      // that instead of working around it: use the manual import instead.
      throw new Error(
        `NightLight's bot protection blocked the automatic download – keeping the old stats.\n` +
          `  Open ${NIGHTLIGHT_URL} in your browser, save it as a .json file, then run:\n` +
          `  npm run update-stats -- --file <path to the saved file>`,
      );
    }
    if (!res.ok) throw new Error(`NightLight answered HTTP ${res.status} – keeping the old stats`);
    json = await res.json();
  }
  const stats = parseNightlight(json, killers, now.toISOString());

  // The stats cover a rolling 28-day window, so they change every day; the
  // file is rewritten each time (fetchedAt doubles as the "last checked" time).
  await fs.writeFile(FILE + '.tmp', JSON.stringify(stats, null, 2));
  await fs.rename(FILE + '.tmp', FILE);
  const missing = killers.filter((k) => !stats.killers[k.id]).map((k) => k.name);
  log(`  ${Object.keys(stats.killers).length} killers, ${stats.games} games (${stats.period.start?.slice(0, 10)} – ${stats.period.end?.slice(0, 10)})`);
  if (missing.length) log(`  no NightLight stats yet for: ${missing.join(', ')}`);
  if (stats.unmatched.length) log(`  ? NightLight killers not in our data: ${stats.unmatched.join(', ')}`);
  return { action: 'updated', games: stats.games, killers: Object.keys(stats.killers).length };
}

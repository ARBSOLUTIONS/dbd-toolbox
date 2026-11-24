// Pure-JS NightLight parser and merger (shared between Node CLI/tests and the Chrome extension).
// Zero Node-specific imports so it runs identically in browsers and Node.

export const NIGHTLIGHT_PAGE = 'https://nightlight.gg/killers/viewer';

// ---------- name matching ----------

/** "Barbecue & Chilli" → "barbecueandchilli", "The Onryō" → "onryo". */
export function nameKey(s) {
  return String(s ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
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

// Names NightLight uses that neither our name nor the wiki's search aliases cover.
const EXTRA_NAMES = {
  'Leon S. Kennedy': 'Leon Scott Kennedy',
  'Detective Tapp': 'David Tapp',
};

export function makeMatcher(list) {
  const byKey = new Map(list.map((x) => [nameKey(x.name), x.id]));
  const add = (name, id) => {
    const key = nameKey(name);
    if (key && !byKey.has(key)) byKey.set(key, id);
  };
  for (const x of list) {
    for (const n of [x.name, x.aliases ?? '']) {
      if (!n) continue;
      add(n, x.id);
      if (n.includes(' & ')) for (const part of n.split(' & ')) add(part, x.id);
    }
  }
  for (const [nl, ours] of Object.entries(EXTRA_NAMES)) {
    const id = byKey.get(nameKey(ours));
    if (id) add(nl, id);
  }
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
      samples: int(b.survivors),
      wins: int(b[winKey]),
    }))
    .filter((b) => b.perks.length >= 3 && b.samples);
  return { since: page?.stats_since_patch ?? null, topPerks, topBuilds };
}

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
 * `data` = { killers, survivors, perks } from data/.
 */
export function parseNightlight(raw, data, importedAt = new Date().toISOString()) {
  const unmatched = { killers: [], survivors: [], perks: [] };
  const matchKiller = makeMatcher(data.killers);
  const matchSurvivor = makeMatcher(data.survivors ?? []);
  const matchPerk = {
    killer: makeMatcher((data.perks ?? []).filter((p) => p.role === 'killer')),
    survivor: makeMatcher((data.perks ?? []).filter((p) => p.role === 'survivor')),
  };

  const singleFeed = raw?.status === 'success' && Array.isArray(raw?.data?.killers);
  if (!singleFeed && raw?.format !== 'dbd-toolbox-nightlight-export') {
    throw new Error('Not a NightLight export (run the collector in your browser first)');
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
  out.perkAverage = {};
  for (const role of ['killer', 'survivor']) {
    let games = 0;
    let wins = 0;
    for (const p of Object.values(perks)) {
      if (p.role !== role || !p.count || p.rate == null) continue;
      games += p.count;
      wins += (p.count * p.rate) / 100;
    }
    out.perkAverage[role] = games ? Math.round((wins / games) * 1e4) / 100 : null;
  }

  for (const [role, pages, target, match] of [
    ['killer', raw.pages?.killers, out.killers, matchKiller],
    ['survivor', raw.pages?.survivors, out.survivors, matchSurvivor],
  ]) {
    const mapPerk = perkMapper(nlToOurs, perkNames, matchPerk, role);
    for (const [name, page] of Object.entries(pages ?? {})) {
      const id = match(name);
      if (!id || !target[id]) continue;
      Object.assign(target[id], parsePage(page, role, mapPerk));
    }
  }
  out.popularSurvivorBuilds = popularSurvivorBuilds(out.survivors);
  for (const surv of Object.values(out.survivors)) {
    if (surv.topPerks?.length > 15) surv.topPerks = surv.topPerks.slice(0, 15);
    if (surv.topBuilds?.length > 10) surv.topBuilds = surv.topBuilds.slice(0, 10);
  }
  for (const list of Object.values(unmatched)) list.splice(0, list.length, ...new Set(list));
  return out;
}

// ---------- perk stats from the perk viewer page text ----------

const PERIOD_RE = /\d{1,2} \w{3} \d{2}, \d{2}:\d{2} - \d{1,2} \w{3} \d{2}, \d{2}:\d{2}/;

function periodPart(s) {
  const m = s.match(/(\d{1,2}) (\w{3}) (\d{2}), (\d{2}):(\d{2})/);
  if (!m) return null;
  const month = 'JanFebMarAprMayJunJulAugSepOctNovDec'.indexOf(m[2]) / 3;
  if (month < 0) return null;
  return new Date(Date.UTC(2000 + Number(m[3]), month, Number(m[1]), Number(m[4]), Number(m[5]))).toISOString();
}

export function parsePerkText(text) {
  text = text.replace(/\r\n/g, '\n');
  const rows = [];
  let role = text.match(/^role:\s*(killer|survivor)\s*$/m)?.[1] ?? null;
  for (const m of text.matchAll(/^([^|\n#]+)\|(\d+)\|([\d.]+)\|([\d.]+)\s*$/gm)) {
    rows.push({ name: m[1].trim(), games: Number(m[2]), pickRate: Number(m[3]), rate: Number(m[4]) });
  }
  if (!rows.length) {
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

export function mergePerkText(stats, parsed, perks) {
  const match = makeMatcher(perks.filter((p) => p.role === parsed.role));
  const out = { ...stats, perks: { ...(stats.perks ?? {}) } };
  const oldRole = Object.entries(stats.perks ?? {}).filter(([, p]) => p.role === parsed.role);
  const samePeriod = stats.perkPeriod?.[parsed.role]?.end && stats.perkPeriod[parsed.role].end === parsed.period.end;
  if (oldRole.length && !samePeriod) {
    out.previousPerks = {
      ...(stats.previousPerks ?? {}),
      [parsed.role]: Object.fromEntries(oldRole.map(([id, p]) => [id, { usage: p.usage, rate: p.rate, count: p.count }])),
    };
    out.previousPerkAverage = { ...(stats.previousPerkAverage ?? {}), [parsed.role]: stats.perkAverage?.[parsed.role] ?? null };
    out.previousPerkPeriod = { ...(stats.previousPerkPeriod ?? {}), [parsed.role]: stats.perkPeriod?.[parsed.role] ?? null };
  }
  for (const [id, p] of Object.entries(out.perks)) if (p.role === parsed.role) delete out.perks[id];
  const unmatched = [];
  let games = 0;
  let wins = 0;
  for (const row of parsed.rows) {
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

// ---------- too little new data ----------

/** Fewer killer games than this in an import: too few to replace the previous numbers. */
export const MIN_IMPORT_GAMES = 2000;
/** Perks need this many games to be ranked (same as MIN_PERK_GAMES in src/lib/nlStats.js). */
const RANKABLE_GAMES = 100;

/**
 * Right after a patch NightLight only counts the new patch, so an import can
 * hold almost no games. Then the previous numbers stay instead of an empty
 * tier list:
 * - killers (with their average, games and period) when the import has fewer
 *   than MIN_IMPORT_GAMES killer games;
 * - survivors (and the popular survivor builds) when it has fewer than
 *   4 × MIN_IMPORT_GAMES survivor matches;
 * - the perks of a role when fewer than half as many of them can be ranked
 *   (100+ games) as in the previous import.
 * Only applies when the previous import had more. Returns what was kept.
 */
export function keepWhenTooFew(stats, old) {
  const kept = [];
  if (!old) return kept;
  const killerGames = (s) => s?.games ?? s?.average?.matches ?? 0;
  if (killerGames(stats) < MIN_IMPORT_GAMES && killerGames(old) > killerGames(stats) && old.killers) {
    for (const key of ['killers', 'average', 'games', 'period']) if (old[key] !== undefined) stats[key] = old[key];
    kept.push('killers');
  }
  const survivorMatches = (s) => s?.survivorAverage?.matches ?? 0;
  if (survivorMatches(stats) < 4 * MIN_IMPORT_GAMES && survivorMatches(old) > survivorMatches(stats) && old.survivors) {
    for (const key of ['survivors', 'survivorAverage', 'popularSurvivorBuilds']) if (old[key] !== undefined) stats[key] = old[key];
    kept.push('survivors');
  }
  const rankable = (s, role) => Object.values(s?.perks ?? {}).filter((p) => p.role === role && (p.count ?? 0) >= RANKABLE_GAMES).length;
  for (const role of ['killer', 'survivor']) {
    const before = rankable(old, role);
    if (!before || rankable(stats, role) >= before / 2) continue;
    const perks = Object.fromEntries(Object.entries(stats.perks ?? {}).filter(([, p]) => p.role !== role));
    for (const [id, p] of Object.entries(old.perks)) if (p.role === role) perks[id] = p;
    stats.perks = perks;
    stats.perkAverage = { ...(stats.perkAverage ?? {}), [role]: old.perkAverage?.[role] ?? null };
    stats.perkPeriod = { ...(stats.perkPeriod ?? {}), [role]: old.perkPeriod?.[role] ?? old.period ?? null };
    // Movement arrows keep comparing with the import before the kept one.
    for (const key of ['previousPerks', 'previousPerkAverage', 'previousPerkPeriod']) {
      const prev = old[key]?.[role];
      const next = { ...(stats[key] ?? {}) };
      if (prev === undefined) delete next[role];
      else next[role] = prev;
      stats[key] = next;
    }
    kept.push(`${role} perks`);
  }
  return kept;
}

/**
 * Merges a newly parsed NightLight export with the previous data/nightlight.json:
 * - Snapshots previous perk stats per role when the period changed (so Perk Ranking shows ▲/▼ movement).
 * - Preserves per-character topPerks/topBuilds and popularSurvivorBuilds when a
 *   quick/partial import (or a failed character page) omits them.
 */
export function mergeNightlight(fresh, old, { singleFeed = false } = {}) {
  const stats = { ...fresh };
  if (!old) return stats;

  if (singleFeed && old.perks && Object.keys(old.perks).length) {
    for (const key of ['survivorAverage', 'survivors', 'perks', 'perkAverage', 'popularSurvivorBuilds', 'previousPerks', 'previousPerkAverage', 'previousPerkPeriod']) {
      if (old[key] !== undefined) stats[key] = old[key];
    }
  }

  if (!singleFeed && old.perks && Object.keys(old.perks).length) {
    const samePeriod = old.period?.end && fresh.period?.end && old.period.end === fresh.period.end;
    if (samePeriod) {
      if (old.previousPerks) stats.previousPerks = old.previousPerks;
      if (old.previousPerkAverage) stats.previousPerkAverage = old.previousPerkAverage;
      if (old.previousPerkPeriod) stats.previousPerkPeriod = old.previousPerkPeriod;
    } else {
      const prevPerks = { killer: {}, survivor: {} };
      for (const [id, p] of Object.entries(old.perks)) {
        if (prevPerks[p.role]) prevPerks[p.role][id] = { usage: p.usage, rate: p.rate, count: p.count };
      }
      stats.previousPerks = prevPerks;
      stats.previousPerkAverage = { ...(old.perkAverage ?? {}) };
      stats.previousPerkPeriod = { killer: old.period ?? null, survivor: old.period ?? null };
    }
  }

  for (const group of ['killers', 'survivors']) {
    if (!stats[group] || !old[group]) continue;
    for (const [id, entry] of Object.entries(stats[group])) {
      const prev = old[group]?.[id];
      if (!prev) continue;
      if (!entry.topPerks?.length && prev.topPerks?.length) {
        entry.topPerks = prev.topPerks;
        entry.since ??= prev.since ?? null;
      }
      if (!entry.topBuilds?.length && prev.topBuilds?.length) {
        entry.topBuilds = prev.topBuilds;
        entry.since ??= prev.since ?? null;
      }
    }
  }
  if (!stats.popularSurvivorBuilds?.length && old.popularSurvivorBuilds?.length) {
    stats.popularSurvivorBuilds = old.popularSurvivorBuilds;
  }
  return stats;
}

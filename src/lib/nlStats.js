// Helpers for NightLight community stats (data/nightlight.json).
// Used by the app, the static site and the build generator.
//
// All numbers come from matches players upload to NightLight; they are a
// guide, not official numbers. Every place that shows them names NightLight.

/** Fewer survivor-slots than this (≈ 10 killer games) is too little to trust. */
export const MIN_SAMPLES = 40;

export const rateLabel = (role) => (role === 'killer' ? 'kill rate' : 'escape rate');

/** The average kill rate (killers) or escape rate (survivors) to compare with. */
export function baselineRate(stats, role) {
  return role === 'killer' ? stats?.average?.killRate ?? null : stats?.survivorAverage?.escapeRate ?? null;
}

/**
 * The average to compare a perk's kill/escape rate with: the rate over every
 * perk slot of that role (from the perk list), else the role average.
 */
export function perkBaseline(stats, role) {
  return stats?.perkAverage?.[role] ?? baselineRate(stats, role);
}

/**
 * Perk usage for a role: { perkId: { usage, rate, count } }. For a killer, that
 * killer's own top perks are used when known (they say more than the global
 * numbers), the global numbers otherwise.
 */
export function perkUsage(stats, role, killerId = null) {
  const out = {};
  for (const [id, p] of Object.entries(stats?.perks ?? {})) {
    if (p.role === role && p.usage != null) out[id] = { usage: p.usage, rate: p.rate, count: p.count ?? null, scope: 'all' };
  }
  for (const p of (killerId && stats?.killers?.[killerId]?.topPerks) || []) {
    out[p.perk] = { usage: p.usage, rate: p.rate, scope: 'killer' };
  }
  return out;
}

const key = (ids) => [...ids].sort().join('|');

/** Finds a NightLight top build with exactly these perks. */
function exactMatch(stats, role, perkIds, killerId) {
  if (perkIds.length !== 4) return null;
  const want = key(perkIds);
  if (role === 'killer') {
    if (!killerId) return null;
    const b = stats?.killers?.[killerId]?.topBuilds?.find((x) => key(x.perks) === want);
    return b ? { usage: b.usage, rate: b.rate, samples: b.samples } : null;
  }
  const b = stats?.popularSurvivorBuilds?.find((x) => key(x.perks) === want);
  return b ? { usage: null, rate: b.rate, samples: b.samples } : null;
}

/**
 * Stats for one build: per-perk usage and win rate, their averages, the role
 * baseline, and the build's own numbers when NightLight lists this exact build.
 * Returns null without stats.
 */
export function buildStats(build, stats) {
  if (!stats?.perks || !Object.keys(stats.perks).length) return null;
  const perks = (build.resolved?.perks ?? []).filter(Boolean);
  if (!perks.length) return null;
  const killerId = build.role === 'killer' ? build.resolved?.killer?.id ?? null : null;
  const usage = perkUsage(stats, build.role, killerId);
  const rows = perks.map((p) => {
    const u = (p.aliasIds ?? [p.id]).map((id) => usage[id]).find(Boolean);
    return { id: p.id, name: p.name, usage: u?.usage ?? 0, rate: u?.rate ?? null, scope: u?.scope ?? 'all' };
  });
  const rated = rows.filter((r) => r.rate != null);
  const round = (v) => Math.round(v * 10) / 10;
  return {
    perks: rows,
    avgUsage: round(rows.reduce((s, r) => s + r.usage, 0) / rows.length),
    avgRate: rated.length ? round(rated.reduce((s, r) => s + r.rate, 0) / rated.length) : null,
    baseline: perkBaseline(stats, build.role),
    rateLabel: rateLabel(build.role),
    killerScope: Boolean(killerId && stats.killers?.[killerId]?.topPerks?.length),
    exact: exactMatch(stats, build.role, perks.map((p) => p.id), killerId),
  };
}

/** Fewer games than this: too few to say if a perk is strong or weak. */
export const MIN_PERK_GAMES = 100;

export const PERK_VERDICTS = {
  strong: { label: 'Above average', short: '▲' },
  average: { label: 'About average', short: '●' },
  weak: { label: 'Below average', short: '▼' },
  few: { label: 'Too few games', short: '?' },
};

/**
 * NightLight numbers for every perk, ready to show: usage, rate, how it
 * compares with the average perk of its role, its rank by usage and a verdict.
 * Licensed copies (e.g. Will to Live = Decisive Strike) borrow their twin's
 * numbers. Returns { perkId: {...} }.
 */
export function perkStatsTable(perks, stats) {
  if (!stats?.perks || !Object.keys(stats.perks).length) return {};
  const out = {};
  const byRole = { killer: [], survivor: [] };
  for (const p of perks) {
    const id = [p.id, ...(p.aliasIds ?? [])].find((x) => stats.perks[x]?.role === p.role);
    const s = id ? stats.perks[id] : null;
    if (!s) continue;
    const average = perkBaseline(stats, p.role);
    const delta = s.rate != null && average != null ? round1(s.rate - average) : null;
    const verdict =
      (s.count ?? 0) < MIN_PERK_GAMES || delta == null
        ? 'few'
        : delta >= NEUTRAL_BAND
        ? 'strong'
        : delta <= -NEUTRAL_BAND
        ? 'weak'
        : 'average';
    out[p.id] = { ...s, average, delta, verdict, borrowedFrom: id !== p.id ? id : null, rateLabel: rateLabel(p.role) };
    if (id === p.id) byRole[p.role]?.push(out[p.id]);
  }
  for (const list of Object.values(byRole)) {
    const max = Math.max(0, ...list.map((x) => x.usage ?? 0));
    list.sort((a, b) => (b.usage ?? 0) - (a.usage ?? 0)).forEach((x, i) => Object.assign(x, { rank: i + 1, of: list.length, maxUsage: max }));
  }
  // Licensed copies share their twin's place in the ranking.
  for (const x of Object.values(out)) {
    const twin = x.borrowedFrom && out[x.borrowedFrom];
    if (twin) Object.assign(x, { rank: twin.rank, of: twin.of, maxUsage: twin.maxUsage });
  }
  return out;
}

// ---------- perk ranking ----------

/**
 * "Prior" games for the strength score: a perk's distance from the average is
 * shrunk by games / (games + PRIOR_GAMES). A perk with 20 games and a wild
 * kill rate stays near the middle; a perk with thousands of games keeps its
 * full difference.
 */
export const PRIOR_GAMES = 300;

export const TIERS = [
  { id: 'S', min: 3, label: 'Wins much more often than average' },
  { id: 'A', min: 1.25, label: 'Wins more often than average' },
  { id: 'B', min: -1.25, label: 'About average' },
  { id: 'C', min: -3, label: 'Wins less often than average' },
  { id: 'D', min: -Infinity, label: 'Wins much less often than average' },
];

/**
 * Ranks the perks of one role with NightLight numbers. `by`:
 *   'strength'   – kill/escape rate vs average, shrunk for small samples (default)
 *   'popularity' – how often the perk is used
 * Each perk gets { strength, tier, place, movement } where movement compares
 * with the previous import (null when there is none). Perks under
 * MIN_PERK_GAMES games are returned in `unranked`.
 */
export function rankPerks(perks, stats, { role, by = 'strength' } = {}) {
  const table = perkStatsTable(perks, stats);
  const previous = stats?.previousPerks?.[role] ?? null;
  const prevAverage = stats?.previousPerkAverage?.[role] ?? null;
  const strengthOf = (rate, count, average) =>
    rate == null || average == null ? null : round1(((rate - average) * count) / (count + PRIOR_GAMES));

  // Previous places, to show who moved up or down since the last import.
  let prevPlace = null;
  if (previous && prevAverage != null) {
    const prevList = Object.entries(previous)
      .filter(([, p]) => (p.count ?? 0) >= MIN_PERK_GAMES)
      .map(([id, p]) => [id, by === 'popularity' ? p.usage : strengthOf(p.rate, p.count, prevAverage)])
      .sort((a, b) => b[1] - a[1]);
    prevPlace = Object.fromEntries(prevList.map(([id], i) => [id, i + 1]));
  }

  const ranked = [];
  const unranked = [];
  for (const p of perks) {
    const s = table[p.id];
    if (p.role !== role || !s || s.borrowedFrom) continue;
    const entry = { perk: p, ...s, strength: strengthOf(s.rate, s.count ?? 0, s.average) };
    entry.tier = TIERS.find((t) => entry.strength >= t.min)?.id ?? 'D';
    if ((s.count ?? 0) < MIN_PERK_GAMES || entry.strength == null) unranked.push(entry);
    else ranked.push(entry);
  }
  const key = by === 'popularity' ? (e) => e.usage : (e) => e.strength;
  ranked.sort((a, b) => key(b) - key(a) || (b.count ?? 0) - (a.count ?? 0));
  ranked.forEach((e, i) => {
    e.place = i + 1;
    const before = prevPlace?.[e.perk.id];
    e.movement = prevPlace ? (before ? before - e.place : 'new') : null;
  });
  unranked.sort((a, b) => (b.count ?? 0) - (a.count ?? 0));
  const tiers = TIERS.map((t) => ({ ...t, perks: ranked.filter((e) => e.tier === t.id) }));
  return { role, by, ranked, unranked, tiers, average: perkBaseline(stats, role), period: stats?.perkPeriod?.[role] ?? stats?.period ?? null };
}

/** Games before a perk's numbers count fully in the score (fewer: they count less). */
export const FULL_WEIGHT_GAMES = 400;
/** Score points per point of kill/escape rate above or below average, and the cap. */
const POINTS_PER_RATE = 0.6;
const MAX_POINTS = 10;

/**
 * The "community" part of a build's score: how often its perks win on
 * NightLight compared with the average perk slot of that role. Killer perks
 * use that killer's own numbers when known, compared with that killer's kill
 * rate. Perks with few games count less; perks without numbers count 0.
 *
 * Returns { points (-10..+10), perks: [...], pros, cons } or null without perk stats.
 */
export function communityScore(perks, role, stats, killerId = null) {
  if (!stats?.perks || !Object.keys(stats.perks).length) return null;
  const list = perks.filter(Boolean);
  if (!list.length) return null;
  const usage = perkUsage(stats, role, killerId);
  const average = perkBaseline(stats, role);
  const killerRate = killerId ? stats.killers?.[killerId]?.killRate ?? null : null;
  const label = rateLabel(role);

  const rows = list.map((p) => {
    const u = (p.aliasIds ?? [p.id]).map((id) => usage[id]).find(Boolean);
    if (!u || u.rate == null) return { id: p.id, name: p.name, rate: null, base: null, delta: null, weight: 0, usage: u?.usage ?? 0 };
    const killerScope = u.scope === 'killer' && killerRate != null;
    const base = killerScope ? killerRate : average;
    const weight = killerScope ? Math.min(1, u.usage / 5) : Math.min(1, (u.count ?? 0) / FULL_WEIGHT_GAMES);
    return { id: p.id, name: p.name, rate: u.rate, base, delta: round1(u.rate - base), weight, usage: u.usage, scope: killerScope ? 'killer' : 'all' };
  });

  const sum = rows.reduce((s, r) => s + (r.delta ?? 0) * r.weight, 0);
  const points = Math.max(-MAX_POINTS, Math.min(MAX_POINTS, Math.round(sum * POINTS_PER_RATE)));
  const pros = [];
  const cons = [];
  if (points >= 2) pros.push(`Community stats: these perks win more often than average on NightLight (+${points}).`);
  if (points <= -2) cons.push(`Community stats: these perks win less often than average on NightLight (${points}).`);
  const solid = rows.filter((r) => r.delta != null && r.weight >= 0.5);
  for (const r of solid.filter((x) => x.delta >= 4).sort((a, b) => b.delta - a.delta).slice(0, 2)) {
    pros.push(`${r.name} has a high ${label} on NightLight (${r.rate.toFixed(1)}% vs ${r.base.toFixed(1)}% average).`);
  }
  for (const r of solid.filter((x) => x.delta <= -4).sort((a, b) => a.delta - b.delta).slice(0, 2)) {
    cons.push(`${r.name} has a low ${label} on NightLight (${r.rate.toFixed(1)}% vs ${r.base.toFixed(1)}% average).`);
  }
  const unknown = rows.filter((r) => r.weight < 0.25).map((r) => r.name);
  if (unknown.length) cons.push(`Too few games on NightLight to judge: ${unknown.join(', ')}.`);
  return { points, average, perks: rows, pros, cons };
}

/**
 * Most played builds from NightLight, as plain perk-id lists, for the generator.
 * Killers: per killer, the most used build and (when different) the build with
 * the best kill rate. Survivors: the most used builds across all survivors.
 */
export function popularBuildSpecs(stats, { survivorCount = 4 } = {}) {
  const specs = [];
  for (const [killerId, k] of Object.entries(stats?.killers ?? {})) {
    const builds = (k.topBuilds ?? []).filter((b) => b.perks.length === 4 && b.samples >= MIN_SAMPLES);
    if (!builds.length) continue;
    const most = [...builds].sort((a, b) => b.usage - a.usage || b.samples - a.samples)[0];
    specs.push({ role: 'killer', killerId, kind: 'most-played', ...most });
    const best = builds
      .filter((b) => b.samples >= MIN_SAMPLES * 2 && b !== most)
      .sort((a, b) => b.rate - a.rate)[0];
    if (best && best.rate > most.rate) specs.push({ role: 'killer', killerId, kind: 'top-rate', ...best });
  }
  const surv = (stats?.popularSurvivorBuilds ?? []).filter((b) => b.perks.length === 4 && b.samples >= MIN_SAMPLES);
  surv.slice(0, survivorCount).forEach((b, i) => specs.push({ role: 'survivor', kind: 'most-played', rank: i + 1, ...b }));
  const best = surv.filter((b) => b.samples >= MIN_SAMPLES * 2).sort((a, b) => b.rate - a.rate)[0];
  if (best && !surv.slice(0, survivorCount).includes(best)) specs.push({ role: 'survivor', kind: 'top-rate', ...best });
  return specs;
}

/** How far above/below the average (in points) still counts as "about average". */
export const NEUTRAL_BAND = 1.5;

/**
 * A verdict on one build from NightLight numbers, used for community builds.
 *
 * Uses, best first: the build's own numbers when NightLight lists this exact
 * build, else the average of its four perks. Killer builds are compared with
 * that killer's own kill rate when the perk numbers are for that killer (a
 * Nurse build should beat the Nurse, not the average killer). Without any perk
 * numbers, killer builds still get the killer's own kill and pick rate.
 *
 * Also points out the weakest perk and, when NightLight knows a clearly better
 * and often played perk for the same role (and killer), suggests a swap.
 *
 * `perksById` is { id: perk } for the game data, used to name suggestions.
 * Returns null when NightLight has nothing at all about this build.
 */
export function analyseBuild(build, stats, perksById = {}) {
  if (!stats) return null;
  const killerId = build.role === 'killer' ? build.resolved?.killer?.id ?? null : null;
  const kStats = killerId ? stats.killers?.[killerId] ?? null : null;
  const killer = kStats?.killRate != null
    ? {
        name: build.resolved.killer.name,
        killRate: kStats.killRate,
        pickRate: kStats.pickRate ?? null,
        matches: kStats.matches ?? null,
        vsAverage: stats.average?.killRate != null ? round1(kStats.killRate - stats.average.killRate) : null,
      }
    : null;

  const nl = build.nl ?? buildStats(build, stats);
  if (!nl && !killer) return null;

  const label = rateLabel(build.role);
  if (!nl) return { verdict: 'unknown', rate: null, delta: null, killer, rateLabel: label, perkData: false };

  // Which number to judge, and against what.
  const exact = nl.exact?.rate != null ? nl.exact : null;
  const rate = exact ? exact.rate : nl.avgRate;
  const vsKiller = Boolean(killer && nl.killerScope);
  const baseline = vsKiller ? killer.killRate : nl.baseline;
  const delta = rate != null && baseline != null ? round1(rate - baseline) : null;
  const verdict = delta == null ? 'unknown' : delta >= NEUTRAL_BAND ? 'strong' : delta <= -NEUTRAL_BAND ? 'weak' : 'average';

  // How much to trust it.
  const rated = nl.perks.filter((p) => p.rate != null && p.usage >= 1);
  const confidence = exact
    ? exact.samples >= MIN_SAMPLES * 2 ? 'high' : exact.samples >= MIN_SAMPLES ? 'medium' : 'low'
    : rated.length === nl.perks.length && nl.perks.length === 4 ? 'medium' : 'low';

  // Weakest perk and a possible swap.
  const inBuild = new Set((build.resolved?.perks ?? []).filter(Boolean).flatMap((p) => [p.id, ...(p.aliasIds ?? [])]));
  const weakest = [...rated].sort((a, b) => a.rate - b.rate)[0] ?? null;
  let swap = null;
  if (weakest && baseline != null && weakest.rate < baseline) {
    const byAnyId = {};
    for (const p of Object.values(perksById)) for (const id of [p.id, ...(p.aliasIds ?? [])]) byAnyId[id] ??= p;
    const best = Object.entries(perkUsage(stats, build.role, killerId))
      .filter(([id, u]) => !inBuild.has(id) && u.rate != null && u.usage >= 3 && u.rate >= weakest.rate + 2 && byAnyId[id])
      .sort((a, b) => b[1].rate - a[1].rate)[0];
    if (best) swap = { out: weakest, in: { id: byAnyId[best[0]].id, name: byAnyId[best[0]].name, ...best[1] } };
  }

  return {
    verdict,
    rate,
    delta,
    baseline,
    vsKiller,
    source: exact ? 'exact' : 'perks',
    games: exact ? (build.role === 'killer' ? Math.round(exact.samples / 4) : exact.samples) : null,
    confidence,
    unrated: nl.perks.filter((p) => p.rate == null || p.usage < 1).map((p) => p.name),
    weakest: weakest && baseline != null && weakest.rate < baseline ? weakest : null,
    swap,
    killer,
    rateLabel: label,
    perkData: true,
  };
}

const round1 = (v) => Math.round(v * 10) / 10;

/**
 * Sort key for "best NightLight numbers first": builds judged on perk numbers
 * first, then killer builds that only have the killer's own kill rate, then
 * builds NightLight knows nothing about.
 */
export const analysisSortKey = (a) => (a?.delta != null ? a.delta : a?.killer?.vsAverage != null ? a.killer.vsAverage - 100 : -Infinity);

/** "11 Oct – 8 Nov" */
export function periodLabel(stats) {
  const fmt = (iso) => (iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }) : '?');
  return `${fmt(stats?.period?.start)} – ${fmt(stats?.period?.end)}`;
}

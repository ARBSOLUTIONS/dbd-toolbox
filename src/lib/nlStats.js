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
 * Perk usage for a role: { perkId: { usage, rate } }. For a killer, that
 * killer's own top perks are used when known (they say more than the global
 * numbers), the global numbers otherwise.
 */
export function perkUsage(stats, role, killerId = null) {
  const out = {};
  for (const [id, p] of Object.entries(stats?.perks ?? {})) {
    if (p.role === role && p.usage != null) out[id] = { usage: p.usage, rate: p.rate, scope: 'all' };
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
    baseline: baselineRate(stats, build.role),
    rateLabel: rateLabel(build.role),
    killerScope: Boolean(killerId && stats.killers?.[killerId]?.topPerks?.length),
    exact: exactMatch(stats, build.role, perks.map((p) => p.id), killerId),
  };
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

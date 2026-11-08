// Automatic build generator.
// Builds new combinations from the CURRENT data every time the app loads, so
// after a patch (new perks, changed perks) the generated builds update by themselves.
//
// How a build is made (greedy search):
//   1. Start with a seed perk: for a killer, its own unique perk that fits the
//      playstyle (if any); otherwise the best-known perk with that main purpose.
//   2. Add the perk that raises the build's synergy score the most
//      (playstyle fit, known strong pairs, balance, no conflicts), until 4 perks.
//   3. Pick an item / add-ons whose effects match the perks.
// The "off-meta" variant skips perks that already appear in 2+ hand-picked
// builds (and, with NightLight stats, perks that 12%+ of players use), so it
// finds less common combinations.
//
// With NightLight community stats (data/nightlight.json), perks that many
// players use and that win more often than average get a small bonus, and
// the most played builds from NightLight are added as "Most played" builds.

import { PLAYSTYLES } from './tags.js';
import { scoreBuild } from './builds.js';
import { suggestItemTypes, suggestAddons } from './combos.js';
import { keywordTags } from './tags.js';
import { bestOffering } from './offeringRatings.js';
import { perkUsage, baselineRate, popularBuildSpecs, periodLabel, rateLabel } from './nlStats.js';

/** Small bonus (max ~6.5) for perks players use a lot and that win more than average. */
function statsBonus(usage, baseline, id) {
  const u = usage?.[id];
  if (!u) return 0;
  const popular = Math.min(u.usage, 30) / 6;
  const winning =
    u.rate != null && baseline != null && u.usage >= 1 ? Math.max(-1.5, Math.min(1.5, (u.rate - baseline) / 3)) : 0;
  return popular + winning;
}

const TIPS = {
  stealth: 'Avoid chases, work on gens far from the killer and break line of sight early.',
  chase: 'Take chases on purpose and use your perks to make them last as long as possible.',
  'gen-rush': 'Stay on generators, work together and leave chases to your teammates.',
  altruism: 'Be the one who unhooks and heals; keep an eye on the hooks.',
  aura: 'Use the information to decide where to go before the killer finds you.',
  'anti-tunnel': 'After an unhook, stay close to your team and use your second chances.',
  healing: 'Heal yourself and others quickly so the team stays healthy.',
  endgame: 'Play safe early; your perks win games once the gates are powered.',
  sabotage: 'Follow chases from a distance and make carrying and hooking hard.',
  boon: 'Bless a central totem and bring injured teammates to it.',
  items: 'Visit chests early to upgrade your item.',
  totems: 'Clear totems early to remove hexes and power your perks.',
  slowdown: 'Spread hooks over different survivors and let your perks hold the gens.',
  hex: 'Defend your hex totem when survivors get close to it.',
  scourge: 'Hook survivors on the white scourge hooks whenever you can.',
  'anti-heal': 'Hit many survivors once; they will waste time healing.',
  snowball: 'Get your first down quickly; the perks make each next down easier.',
  info: 'Use every notification to pick your next target.',
};

// Styles for per-killer builds. "chase" is left out on purpose: a killer's
// power is already their chase tool, and generic chase perks make weak builds.
const STYLE_FOR_KILLER_ADDONS = ['slowdown', 'aura', 'stealth', 'anti-heal', 'snowball', 'info'];

function popularityMap(curated) {
  const pop = {};
  for (const b of curated) for (const p of b.resolved.perks) if (p) pop[p.id] = (pop[p.id] ?? 0) + 1;
  return pop;
}

/** Greedy perk selection for one role/playstyle. Returns 4 perks (or fewer if not possible). */
export function pickPerks(
  allPerks,
  role,
  style,
  { seed = [], exclude = new Set(), popularity = {}, usage = null, baseline = null } = {},
) {
  const pool = allPerks.filter((p) => p.role === role && !exclude.has(p.id));
  const chosen = [...seed];
  const taken = () => new Set(chosen.flatMap((p) => p.aliasIds ?? [p.id]));

  if (!chosen.length) {
    const first = pool
      .filter((p) => p.tags[0] === style)
      .sort(
        (a, b) =>
          (popularity[b.id] ?? 0) - (popularity[a.id] ?? 0) ||
          statsBonus(usage, baseline, b.id) - statsBonus(usage, baseline, a.id) ||
          a.name.localeCompare(b.name),
      )[0];
    if (first) chosen.push(first);
  }

  while (chosen.length < 4) {
    const used = taken();
    let best = null;
    let bestValue = -Infinity;
    for (const c of pool) {
      if (used.has(c.id)) continue;
      const { score } = scoreBuild([...chosen, c], role, [style]);
      const value =
        score +
        (c.tags[0] === style ? 3 : c.tags.includes(style) ? 1 : 0) +
        Math.min(popularity[c.id] ?? 0, 3) * 1.5 +
        statsBonus(usage, baseline, c.id) -
        (c.tagSource === 'manual' ? 0 : 2);
      if (value > bestValue || (value === bestValue && c.name < best.name)) {
        best = c;
        bestValue = value;
      }
    }
    if (!best) break;
    chosen.push(best);
  }
  return chosen;
}

function bestItemFor(perks, data) {
  const type = suggestItemTypes(perks)[0]?.type ?? 'medkit';
  const order = ['common', 'uncommon', 'rare', 'very-rare'];
  const item = data.items
    .filter((i) => i.type === type && order.includes(i.rarity))
    .sort((a, b) => order.indexOf(b.rarity) - order.indexOf(a.rarity))[0];
  const addons = suggestAddons(perks, data.addons.filter((a) => a.itemType === type), 2).map((x) => x.addon);
  return { item, addons };
}

function makeBuild({ id, name, role, style, perks, killer = null, item = null, addons = [], variant, patch, offering = null, type = 'auto', why = null }) {
  const rating = scoreBuild(perks, role, [style]);
  const label = PLAYSTYLES[role][style];
  return {
    id,
    name,
    role,
    type,
    variant,
    killer: killer?.name ?? null,
    playstyles: [style],
    perks: perks.map((p) => p.name),
    item: item?.name ?? null,
    itemAddons: role === 'survivor' ? addons.map((a) => a.name) : undefined,
    addons: role === 'killer' ? addons.map((a) => a.name) : undefined,
    offering: offering?.name ?? null,
    why:
      why ??
      `Generated automatically for patch ${patch ?? '?'} from perk tags and known synergies` +
      `${variant === 'off-meta' ? ', avoiding the most common perks' : ''}. ` +
      (rating.pros.slice(0, 2).join(' ') || `All perks support a ${label.toLowerCase()} playstyle.`),
    howToPlay: TIPS[style] ?? '',
    resolved: { perks, killer, item, addons, offering },
    missing: [],
    rating,
  };
}

/**
 * Generates builds from the data. `curated` = resolved hand-picked builds
 * (used for popularity and to skip exact duplicates).
 */
export function generateBuilds(data, curated = [], changes = null) {
  const popularity = popularityMap(curated);
  const common = new Set(Object.entries(popularity).filter(([, n]) => n >= 2).map(([id]) => id));
  const stats = data.stats ?? null;
  const usageFor = { survivor: perkUsage(stats, 'survivor'), killer: perkUsage(stats, 'killer') };
  const baseline = { survivor: baselineRate(stats, 'survivor'), killer: baselineRate(stats, 'killer') };
  for (const [id, p] of Object.entries(stats?.perks ?? {})) if (p.usage >= 12) common.add(id);
  const opts = (role, extra = {}) => ({ popularity, usage: usageFor[role], baseline: baseline[role], ...extra });
  const seen = new Set(curated.map((b) => b.resolved.perks.filter(Boolean).map((p) => p.id).sort().join('|')));
  const patch = data.meta?.patch;
  const out = [];

  const add = (build) => {
    if (build.resolved.perks.length < 4) return;
    // Pick the best-rated offering that fits the build's role and playstyle.
    const offering = bestOffering(data.offerings, build.role, build.playstyles[0]);
    if (offering) {
      build.offering = offering.name;
      build.resolved.offering = offering;
    }
    const key = build.resolved.perks.map((p) => p.id).sort().join('|') + (build.killer ?? '');
    if (seen.has(key)) return;
    seen.add(key);
    out.push(build);
  };

  // Most played builds from NightLight community stats (if imported).
  const perksByIdAll = Object.fromEntries(data.perks.map((p) => [p.id, p]));
  for (const spec of popularBuildSpecs(stats)) {
    const perks = spec.perks.map((id) => perksByIdAll[id]).filter(Boolean);
    if (perks.length < 4) continue;
    const killer = spec.killerId ? data.killers.find((k) => k.id === spec.killerId) : null;
    if (spec.role === 'killer' && !killer) continue;
    const short = killer?.name.replace(/^The /, '');
    const tagCount = {};
    for (const p of perks) for (const t of p.tags) tagCount[t] = (tagCount[t] ?? 0) + 1;
    const styles = Object.keys(PLAYSTYLES[spec.role]);
    const style = styles.filter((s) => tagCount[s]).sort((a, b) => tagCount[b] - tagCount[a])[0] ?? styles[0];
    const extra =
      spec.role === 'survivor'
        ? bestItemFor(perks, data)
        : {
            item: null,
            addons: suggestAddons(
              perks,
              data.addons.filter((a) => a.killer === killer.name && a.rarity !== 'event'),
              2,
            ).map((x) => x.addon),
          };
    const who = spec.role === 'killer' ? short : 'survivor';
    const games = spec.role === 'killer' ? `${Math.round(spec.samples / 4)} ${short} games` : `${spec.samples} survivor games`;
    const rate = `${spec.rate?.toFixed(1)}% ${rateLabel(spec.role)}`;
    const why =
      spec.kind === 'top-rate'
        ? `The best ${rateLabel(spec.role)} among the most played ${who} builds on NightLight: ${rate} over ${games} (${periodLabel(stats)}).`
        : `One of the most played ${who} builds on NightLight${spec.usage ? ` (${spec.usage}% of ${short} games)` : ''}: ${rate} over ${games} (${periodLabel(stats)}).`;
    const name =
      spec.role === 'killer'
        ? `${short}: ${spec.kind === 'top-rate' ? 'Top kill rate' : 'Most played'}`
        : spec.kind === 'top-rate'
        ? 'Top escape rate'
        : `Most played #${spec.rank}`;
    add(
      makeBuild({
        id: `popular-${spec.role}-${spec.killerId ?? 'all'}-${spec.kind}-${spec.rank ?? 1}`,
        name,
        role: spec.role,
        style,
        perks,
        killer,
        item: extra.item,
        addons: extra.addons,
        variant: spec.kind,
        patch,
        type: 'popular',
        why,
      }),
    );
  }

  // Survivor: one standard and one off-meta build per playstyle.
  for (const style of Object.keys(PLAYSTYLES.survivor)) {
    const label = PLAYSTYLES.survivor[style];
    for (const variant of ['standard', 'off-meta']) {
      const perks = pickPerks(
        data.perks,
        'survivor',
        style,
        opts('survivor', { exclude: variant === 'off-meta' ? common : new Set() }),
      );
      const { item, addons } = bestItemFor(perks, data);
      add(
        makeBuild({
          id: `auto-survivor-${style}-${variant}`,
          name: variant === 'off-meta' ? `Off-meta ${label}` : `${label} Core`,
          role: 'survivor',
          style,
          perks,
          item,
          addons,
          variant,
          patch,
        }),
      );
    }
  }

  // Killer: generic builds per playstyle (any killer).
  for (const style of Object.keys(PLAYSTYLES.killer)) {
    const label = PLAYSTYLES.killer[style];
    for (const variant of ['standard', 'off-meta']) {
      const perks = pickPerks(
        data.perks,
        'killer',
        style,
        opts('killer', { exclude: variant === 'off-meta' ? common : new Set() }),
      );
      add(
        makeBuild({
          id: `auto-killer-${style}-${variant}`,
          name: variant === 'off-meta' ? `Off-meta ${label}` : `${label} Kit`,
          role: 'killer',
          style,
          perks,
          variant,
          patch,
        }),
      );
    }
  }

  // Killer: one build per killer, built around its own perks and add-ons.
  const perksById = Object.fromEntries(data.perks.map((p) => [p.id, p]));
  for (const killer of data.killers) {
    const ownAddons = data.addons.filter((a) => a.killer === killer.name && a.rarity !== 'event');
    const ownPerks = (killer.perks ?? []).map((id) => perksById[id]).filter(Boolean);
    // Playstyle: what the killer's add-ons and own perks are most about.
    const counts = {};
    for (const a of ownAddons) for (const t of keywordTags(a, 'killer')) counts[t] = (counts[t] ?? 0) + 1;
    for (const p of ownPerks) for (const t of p.tags) counts[t] = (counts[t] ?? 0) + 3;
    const style =
      STYLE_FOR_KILLER_ADDONS.filter((s) => counts[s]).sort((a, b) => counts[b] - counts[a])[0] ?? 'slowdown';
    const seed = ownPerks.filter((p) => p.tags.includes(style)).slice(0, 1);
    // This killer's own NightLight perk usage says more than the global numbers.
    const perks = pickPerks(data.perks, 'killer', style, opts('killer', { seed, usage: perkUsage(stats, 'killer', killer.id) }));
    const addons = suggestAddons(perks, ownAddons, 2).map((x) => x.addon);
    const short = killer.name.replace(/^The /, '');
    add(
      makeBuild({
        id: `auto-killer-${killer.id}`,
        name: `${short}: ${PLAYSTYLES.killer[style]}`,
        role: 'killer',
        style,
        perks,
        killer,
        addons,
        variant: 'killer',
        patch,
      }),
    );
  }

  // Spotlight builds: one build around every perk that is new since the previous
  // refresh. New perks have no popularity yet, so the normal search would rarely
  // pick them; this way each new perk is tried out in a full combination.
  const fresh = new Set(changes?.newPerkIds ?? []);
  for (const perk of data.perks.filter((p) => fresh.has(p.id))) {
    const style = perk.tags[0] ?? (perk.role === 'killer' ? 'slowdown' : 'chase');
    const perks = pickPerks(data.perks, perk.role, style, opts(perk.role, { seed: [perk] }));
    const extra = perk.role === 'survivor' ? bestItemFor(perks, data) : { item: null, addons: [] };
    add(
      makeBuild({
        id: `auto-new-${perk.role}-${perk.id}`,
        name: `New: ${perk.name}`,
        role: perk.role,
        style,
        perks,
        item: extra.item,
        addons: extra.addons,
        variant: 'new',
        patch,
      }),
    );
  }

  // Perk spotlights: every perk gets at least one build. Perks that no hand-picked
  // or generated build uses yet get a build of their own, made around that perk.
  const covered = new Set();
  for (const b of [...curated, ...out]) for (const p of b.resolved.perks) if (p) for (const id of p.aliasIds ?? [p.id]) covered.add(id);
  for (const perk of data.perks) {
    if (covered.has(perk.id)) continue;
    const style = perk.tags[0] ?? (perk.role === 'killer' ? 'slowdown' : 'chase');
    const perks = pickPerks(data.perks, perk.role, style, opts(perk.role, { seed: [perk] }));
    const extra = perk.role === 'survivor' ? bestItemFor(perks, data) : { item: null, addons: [] };
    const before = out.length;
    add(
      makeBuild({
        id: `auto-spotlight-${perk.role}-${perk.id}`,
        name: `${perk.name} Spotlight`,
        role: perk.role,
        style,
        perks,
        item: extra.item,
        addons: extra.addons,
        variant: 'spotlight',
        patch,
      }),
    );
    if (out.length > before) for (const p of perks) for (const id of p.aliasIds ?? [p.id]) covered.add(id);
  }

  // Mark builds that use perks that are new since the previous refresh.
  for (const b of out) b.newPerks = b.resolved.perks.filter((p) => fresh.has(p.id)).map((p) => p.name);
  return out;
}

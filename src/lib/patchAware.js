// Keeps hand-picked builds (builds/builds.json) correct after a patch, without
// anyone editing the file:
//   - a perk that was renamed is matched to its new name
//   - a perk that was removed is replaced by the best fitting perk
//   - a perk whose description changed in the latest patch is flagged
//   - add-ons / items / offerings that no longer exist are dropped
// Each fix is listed in build.patchNotes and explained in the "why" text.
import { pickPerks } from './generator.js';
import { makeQuery } from './search.js';
import { tagsFor } from './tags.js';

const MISSING_PERK = /^perk: (.+)$/;

/** Finds the probable new name of a renamed perk ("Hex: Ruin" -> "Ruin", small spelling changes). */
function findRenamed(name, candidates) {
  const query = makeQuery(name.replace(/^(hex|boon|scourge hook|invocation):\s*/i, ''));
  let best = null;
  let bestRank = Infinity;
  for (const p of candidates) {
    const rank = Math.min(query.rank(p.name), query.rank(p.name.replace(/^(hex|boon|scourge hook|invocation):\s*/i, '')));
    if (rank < bestRank) {
      best = p;
      bestRank = rank;
    }
  }
  // Only accept close matches: same start, contained, or a typo or two.
  return bestRank <= 2 ? best : null;
}

function mainStyle(build, perks) {
  if (build.playstyles?.length) return build.playstyles[0];
  const count = {};
  for (const p of perks) for (const t of p.tags ?? tagsFor(p).tags) count[t] = (count[t] ?? 0) + 1;
  return Object.entries(count).sort((a, b) => b[1] - a[1])[0]?.[0] ?? (build.role === 'killer' ? 'slowdown' : 'chase');
}

/**
 * Takes a resolved build (from resolveBuild) and returns a repaired copy.
 * `changes` is data/changes.json (may be null).
 */
export function repairBuild(build, data, changes) {
  const patch = changes?.toPatch ?? data.meta?.patch ?? null;
  const notes = [];
  const perks = [...build.resolved.perks];
  const names = [...build.perks];
  const used = () => new Set(perks.filter(Boolean).flatMap((p) => p.aliasIds ?? [p.id]));

  // Beginner builds stay beginner friendly: replacements come from the General perks.
  const allowed = (p) => p.role === build.role && (build.type !== 'beginner' || !p.character);

  // 1. Renamed perks.
  perks.forEach((p, i) => {
    if (p || !names[i]) return;
    const taken = used();
    const match = findRenamed(names[i], data.perks.filter((c) => allowed(c) && !taken.has(c.id)));
    if (match) {
      notes.push({ kind: 'renamed', from: names[i], to: match.name });
      perks[i] = match;
    }
  });

  // 2. Removed perks: fill the empty slots with the best fitting perks.
  const empty = perks.map((p, i) => (!p && names[i] ? i : -1)).filter((i) => i >= 0);
  if (empty.length) {
    const kept = perks.filter(Boolean);
    const exclude = new Set(data.perks.filter((p) => !allowed(p)).map((p) => p.id));
    const filled = pickPerks(data.perks, build.role, mainStyle(build, kept), { seed: kept, exclude });
    const extra = filled.slice(kept.length);
    empty.forEach((slot, n) => {
      if (!extra[n]) return;
      notes.push({ kind: 'replaced', from: names[slot], to: extra[n].name });
      perks[slot] = extra[n];
    });
  }

  // 3. Perks whose text changed in the latest patch (labels look like "Name (role)").
  const changed = new Set((changes?.perks?.changed ?? []).map((l) => l.toLowerCase()));
  for (const p of perks) {
    if (p && changed.has(`${p.name} (${p.role})`.toLowerCase())) notes.push({ kind: 'changed', perk: p.name });
  }

  // 4. Other names that no longer exist are simply dropped.
  const perkMissing = new Set(names.filter((n, i) => n && !build.resolved.perks[i]));
  const fixedPerks = new Set(notes.filter((n) => n.from).map((n) => n.from));
  const missing = [];
  for (const m of build.missing) {
    const perk = m.match(MISSING_PERK)?.[1];
    if (perk && perkMissing.has(perk)) {
      if (!fixedPerks.has(perk)) missing.push(m);
      continue;
    }
    notes.push({ kind: 'dropped', what: m });
  }
  const resolved = {
    ...build.resolved,
    perks,
    addons: build.resolved.addons.filter(Boolean),
  };

  if (!notes.length) return build;

  const swaps = notes.filter((n) => n.from).map((n) => `${n.from} → ${n.to}`);
  const dropped = notes.filter((n) => n.kind === 'dropped').map((n) => n.what.replace(/^[^:]+: /, ''));
  const extraWhy = [
    swaps.length && `Updated automatically${patch ? ` for patch ${patch}` : ''}: ${swaps.join(', ')}.`,
    dropped.length && `No longer in the game: ${dropped.join(', ')}.`,
  ]
    .filter(Boolean)
    .join(' ');

  return {
    ...build,
    perks: perks.map((p, i) => p?.name ?? names[i]),
    item: resolved.item ? build.item : null,
    resolved,
    missing,
    why: extraWhy ? [build.why, extraWhy].filter(Boolean).join(' ') : build.why,
    patchNotes: notes,
    patch,
  };
}

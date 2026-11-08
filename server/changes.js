// Compares old and new data after a refresh, so the app can show
// "what changed in this patch": new perks, changed perks, new killers, ...

const byKey = (list, key) => new Map((list ?? []).map((x) => [key(x), x]));

/** Short summary of a list difference: names added, removed and changed. */
function diffList(oldList, newList, { key = (x) => x.id, label = (x) => x.name, compare } = {}) {
  const before = byKey(oldList, key);
  const after = byKey(newList, key);
  const added = [...after.keys()].filter((k) => !before.has(k)).map((k) => label(after.get(k)));
  const removed = [...before.keys()].filter((k) => !after.has(k)).map((k) => label(before.get(k)));
  const changed = compare
    ? [...after.keys()]
        .filter((k) => before.has(k) && compare(before.get(k)) !== compare(after.get(k)))
        .map((k) => label(after.get(k)))
    : [];
  return { added, removed, changed };
}

/**
 * Returns a changes object, or null when nothing relevant changed.
 * `old` and `fresh` are { meta, perks, killers, survivors, items, addons, offerings }.
 * On the very first refresh (no old data) it returns null: everything is "new".
 */
export function computeChanges(old, fresh) {
  if (!old?.perks?.length) return null;
  const desc = (x) => x.description;
  const changes = {
    fromPatch: old.meta?.patch ?? null,
    toPatch: fresh.meta?.patch ?? null,
    date: fresh.meta?.fetchedAt ?? new Date().toISOString(),
    perks: diffList(old.perks, fresh.perks, {
      key: (p) => `${p.role}:${p.id}`,
      label: (p) => `${p.name} (${p.role})`,
      compare: desc,
    }),
    killers: diffList(old.killers, fresh.killers),
    survivors: diffList(old.survivors, fresh.survivors),
    items: diffList(old.items, fresh.items, { compare: desc }),
    addons: diffList(old.addons, fresh.addons, {
      key: (a) => `${a.killer ?? a.itemType}:${a.id}`,
      label: (a) => `${a.name} (${a.killer ?? a.itemType})`,
      compare: desc,
    }),
    offerings: diffList(old.offerings, fresh.offerings, { compare: desc }),
  };
  const total = ['perks', 'killers', 'survivors', 'items', 'addons', 'offerings'].reduce(
    (n, k) => n + changes[k].added.length + changes[k].removed.length + changes[k].changed.length,
    0,
  );
  if (!total && changes.fromPatch === changes.toPatch) return null;
  changes.total = total;
  // Plain ids of new perks, so the app can mark builds that use them.
  changes.newPerkIds = fresh.perks
    .filter((p) => !old.perks.some((o) => o.role === p.role && o.id === p.id))
    .map((p) => p.id);
  return changes;
}

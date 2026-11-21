// URL query helpers for deep-linking tabs, builds, combos and Build Maker loadouts.

export function readUrlState(validTabs) {
  if (typeof window === 'undefined') return { tab: 'home', buildId: null, comboPerk: null, buildFilter: {}, makerInitial: null };
  const p = new URLSearchParams(window.location.search);
  const rawTab = p.get('tab');
  const buildId = p.get('build') || null;
  const comboPerk = p.get('perk') || null;
  let tab = rawTab && validTabs.has(rawTab) ? rawTab : null;
  if (!tab) {
    if (buildId) tab = 'builds';
    else if (comboPerk) tab = 'combos';
    else tab = 'home';
  }
  const buildFilter = {};
  if (p.get('role') === 'killer' || p.get('role') === 'survivor') buildFilter.role = p.get('role');
  if (p.get('type')) buildFilter.type = p.get('type');

  let makerInitial = null;
  if (tab === 'maker' && (p.get('perks') || p.get('killer') || p.get('item'))) {
    const perks = (p.get('perks') || '')
      .split(',')
      .map((x) => x.trim() || null)
      .slice(0, 4);
    while (perks.length < 4) perks.push(null);
    const addons = (p.get('addons') || '')
      .split(',')
      .map((x) => x.trim() || null)
      .slice(0, 2);
    while (addons.length < 2) addons.push(null);
    makerInitial = {
      role: p.get('role') === 'killer' ? 'killer' : 'survivor',
      killer: p.get('killer') || '',
      perks,
      item: p.get('item') || null,
      addons,
      offering: p.get('offering') || null,
      playstyles: (p.get('styles') || '').split(',').filter(Boolean),
      name: p.get('name') || '',
    };
  }
  return { tab, buildId, comboPerk, buildFilter, makerInitial };
}

export function buildAppUrl({ tab = 'home', buildId = null, perkId = null, role = null, type = null } = {}) {
  const p = new URLSearchParams();
  if (tab && tab !== 'home') p.set('tab', tab);
  if (buildId) p.set('build', buildId);
  if (tab === 'combos' && perkId) p.set('perk', perkId);
  if (tab === 'builds' && role) p.set('role', role);
  if (tab === 'builds' && type && type !== 'all') p.set('type', type);
  const qs = p.toString();
  return qs ? `/?${qs}` : '/';
}

export function makerShareUrl({ role, killer, perks, item, addons, offering, playstyles, name }) {
  const p = new URLSearchParams();
  p.set('tab', 'maker');
  p.set('role', role === 'killer' ? 'killer' : 'survivor');
  if (role === 'killer' && killer) p.set('killer', killer);
  if (role !== 'killer' && item) p.set('item', item);
  const perkIds = (perks ?? []).map((x) => x || '').join(',');
  if (perkIds.replace(/,/g, '')) p.set('perks', perkIds);
  const addonIds = (addons ?? []).map((x) => x || '').join(',');
  if (addonIds.replace(/,/g, '')) p.set('addons', addonIds);
  if (offering) p.set('offering', offering);
  if (playstyles?.length) p.set('styles', playstyles.join(','));
  if (name?.trim()) p.set('name', name.trim());
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return `${origin}/?${p.toString()}`;
}

export function buildCardShareUrl(build) {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  if (build.type === 'custom' || build.type === 'community') {
    return makerShareUrl({
      role: build.role,
      killer: build.killer ?? '',
      perks: (build.resolved?.perks ?? []).map((p) => p?.id ?? null),
      item: build.resolved?.item?.id ?? null,
      addons: (build.resolved?.addons ?? []).map((a) => a?.id ?? null),
      offering: build.resolved?.offering?.id ?? null,
      playstyles: build.playstyles ?? [],
      name: build.name,
    });
  }
  return `${origin}${buildAppUrl({ tab: 'builds', buildId: build.id })}`;
}

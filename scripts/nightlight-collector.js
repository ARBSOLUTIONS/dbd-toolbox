// NightLight stats collector – runs in YOUR browser, not in Node.
//
// NightLight's bot protection blocks scripts, so the stats are collected by
// you, in a normal browser tab, at a slow pace:
//   1. Open https://nightlight.gg/perks/viewer in your browser.
//   2. Open the developer console (F12 → Console).
//   3. Paste this whole file and press Enter. (Chrome may ask you to type
//      "allow pasting" first.)
//   4. Wait about 3 minutes. A file "nightlight-export-<date>.json" is downloaded.
//   5. In this project:  npm run update-stats -- --file <that file>
//
// What it reads (about 105 requests, one every 1.5 seconds):
//   - the 4 public stats feeds the viewer pages use (killers, survivors, both perk lists)
//   - every killer page and survivor page (top perks and top builds)
//   - the perk id → name list that the site already loaded in this tab
// NightLight asks to keep requests low and to credit them: please do not run
// this more than about once a week. Everything stays on your PC until you commit it.
(async () => {
  const DELAY_MS = 1500;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  if (location.hostname !== 'nightlight.gg') {
    alert('Open https://nightlight.gg/perks/viewer first, then run this again.');
    return;
  }

  // Character pages answer in React Router's "turbo-stream" format: one flat
  // array where objects refer to other entries by index. This turns it back
  // into normal objects.
  function decodeTurboStream(arr) {
    const SPECIAL = { '-1': undefined, '-2': undefined, '-3': NaN, '-4': Infinity, '-5': -Infinity, '-6': -0, '-7': null };
    const memo = new Map();
    const dec = (i) => {
      if (i < 0) return SPECIAL[i];
      if (memo.has(i)) return memo.get(i);
      const v = arr[i];
      if (Array.isArray(v)) {
        if (typeof v[0] === 'string' && /^[A-Z]$/.test(v[0])) return v[0] === 'D' ? v[1] : null;
        const out = [];
        memo.set(i, out);
        for (const x of v) out.push(dec(x));
        return out;
      }
      if (v && typeof v === 'object') {
        const out = {};
        memo.set(i, out);
        for (const [k, x] of Object.entries(v)) out[arr[Number(k.slice(1))]] = dec(x);
        return out;
      }
      memo.set(i, v);
      return v;
    };
    return dec(0);
  }

  let requests = 0;
  async function get(path) {
    if (requests++) await sleep(DELAY_MS);
    const res = await fetch(path, { headers: { Accept: 'application/json, text/x-script' } });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${path}`);
    return JSON.parse(await res.text());
  }

  // 1. Perk id → name. The perk list is bundled in a script this tab already loaded.
  const perkNames = {};
  const scripts = new Set([
    ...performance.getEntriesByType('resource').map((e) => e.name),
    ...[...document.querySelectorAll('script[src], link[rel="modulepreload"]')].map((e) => e.src || e.href),
  ]);
  const re = /"(\d+)":\{"n":"((?:[^"\\]|\\.)*)","i":"[^"]*","u":"\/perks\//g;
  for (const url of scripts) {
    if (!url.startsWith(location.origin + '/assets/') || !url.endsWith('.js')) continue;
    const text = await (await fetch(url)).text(); // already in the browser cache
    for (const m of text.matchAll(re)) perkNames[m[1]] = JSON.parse(`"${m[2]}"`);
    if (Object.keys(perkNames).length > 100) break;
  }
  if (Object.keys(perkNames).length < 100) {
    alert('Could not find the perk list. Open https://nightlight.gg/perks/viewer, wait until it has loaded, then run this again.');
    return;
  }
  console.log(`[collector] ${Object.keys(perkNames).length} perk names`);

  // 2. The public stats feeds (same data as the viewer pages).
  const feeds = {};
  for (const [key, path] of [
    ['killers', '/api/v1/stats/global/killers'],
    ['survivors', '/api/v1/stats/global/survivors'],
    ['killerPerks', '/api/v1/stats/global/killer-perks'],
    ['survivorPerks', '/api/v1/stats/global/survivor-perks'],
  ]) {
    feeds[key] = (await get(path)).data;
    console.log(`[collector] feed ${key} ✓`);
  }

  // 3. Every killer and survivor page: top perks and top builds.
  const KEEP = ['pick_rate', 'kill_rate', 'escape_rate', 'top_perks', 'top_builds', 'stats_since_patch', 'last_update'];
  const pages = { killers: {}, survivors: {} };
  const failed = [];
  for (const [kind, list] of [
    ['killers', feeds.killers.killers],
    ['survivors', feeds.survivors.survivors],
  ]) {
    const names = list.map((x) => x.name).filter((n) => n !== 'Overall Average');
    for (const name of names) {
      const slug = encodeURIComponent(name.replace(/^The /, '').replace(/ /g, '_'));
      try {
        const route = decodeTurboStream(await get(`/${kind}/${slug}.data`));
        const data = Object.entries(route).find(([k]) => k.startsWith(`routes/${kind}.`))?.[1]?.data?.data;
        if (!data) throw new Error('no data');
        pages[kind][name] = Object.fromEntries(KEEP.map((k) => [k, data[k] ?? null]));
        console.log(`[collector] ${kind} ${Object.keys(pages[kind]).length}/${names.length}: ${name} ✓`);
      } catch (err) {
        failed.push(`${name}: ${err.message}`);
        console.warn(`[collector] ${name} failed: ${err.message}`);
      }
    }
  }

  const exportData = {
    format: 'dbd-toolbox-nightlight-export',
    version: 1,
    collectedAt: new Date().toISOString(),
    source: 'https://nightlight.gg',
    perkNames,
    feeds,
    pages,
    failed,
  };
  const blob = new Blob([JSON.stringify(exportData)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `nightlight-export-${exportData.collectedAt.slice(0, 10)}.json`;
  a.click();
  console.log(`[collector] Done: ${requests} requests, ${failed.length} failed. File downloaded.`);
})();

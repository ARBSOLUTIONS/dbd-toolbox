// NightLight stats collector – runs in YOUR browser, not in Node.
//
// Modes (set via window.__DBD_COLLECTOR__ = { mode: 'quick' | 'killers' | 'full', receiverUrl, token }):
//   - 'quick'   (4 requests, ~5 sec):  global killer, survivor & perk feeds. Updates all perk
//                                      rankings, perk cards, and build rating scores; existing
//                                      per-character top perks/builds are preserved on import.
//   - 'killers' (~49 requests, ~70 s): global feeds + every killer page (killer-specific build
//                                      ratings & "Most played" killer builds).
//   - 'full'    (~105 requests, ~3 m): global feeds + every killer and survivor page.
//
// When launched via `npm run weekly-stats`, the collector posts directly to a temporary
// localhost receiver (with automatic fallback to downloading nightlight-export-<date>.json).
(async () => {
  const cfg = (typeof window !== 'undefined' && window.__DBD_COLLECTOR__) || {};
  const MODE = ['quick', 'killers', 'full'].includes(cfg.mode) ? cfg.mode : 'full';
  const DELAY_MS = 1500;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  if (location.hostname !== 'nightlight.gg') {
    alert('Open https://nightlight.gg/perks/viewer first, then run this again.');
    return;
  }

  // Small non-intrusive status badge in the bottom-right corner so you see progress without DevTools.
  const badge = document.createElement('div');
  Object.assign(badge.style, {
    position: 'fixed',
    right: '16px',
    bottom: '16px',
    zIndex: '999999',
    padding: '10px 14px',
    borderRadius: '10px',
    background: '#111116',
    color: '#f4f4f5',
    border: '1px solid #3f3f46',
    font: '600 13px/1.4 system-ui, sans-serif',
    boxShadow: '0 8px 24px rgba(0,0,0,0.45)',
  });
  document.body.appendChild(badge);
  const status = (msg) => {
    badge.textContent = `DBD-Toolbox (${MODE}): ${msg}`;
    console.log(`[collector] ${msg}`);
  };

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

  try {
    status('reading perk names…');
    const perkNames = {};
    const scripts = new Set([
      ...performance.getEntriesByType('resource').map((e) => e.name),
      ...[...document.querySelectorAll('script[src], link[rel="modulepreload"]')].map((e) => e.src || e.href),
    ]);
    const re = /"(\d+)":\{"n":"((?:[^"\\]|\\.)*)","i":"[^"]*","u":"\/perks\//g;
    for (const url of scripts) {
      if (!url.startsWith(location.origin + '/assets/') || !url.endsWith('.js')) continue;
      const text = await (await fetch(url)).text();
      for (const m of text.matchAll(re)) perkNames[m[1]] = JSON.parse(`"${m[2]}"`);
      if (Object.keys(perkNames).length > 100) break;
    }
    if (Object.keys(perkNames).length < 100) {
      throw new Error('Could not find perk names. Open https://nightlight.gg/perks/viewer, wait until loaded, and retry.');
    }
    status(`${Object.keys(perkNames).length} perks found`);

    const patch =
      performance
        .getEntriesByType('resource')
        .map((e) => (e.name.includes('patch=') ? new URL(e.name).searchParams.get('patch') : null))
        .find(Boolean) ?? document.body.innerText.match(/Patch (\d+\.\d+\.\d+)/)?.[1];
    if (!patch) {
      throw new Error('Could not detect NightLight patch. Reload https://nightlight.gg/perks/viewer and retry.');
    }

    const feeds = {};
    const feedDefs = [
      ['killers', '/api/v1/stats/global/killers'],
      ['survivors', '/api/v1/stats/global/survivors'],
      ['killerPerks', '/api/v1/stats/global/killer-perks'],
      ['survivorPerks', '/api/v1/stats/global/survivor-perks'],
    ];
    for (let i = 0; i < feedDefs.length; i++) {
      const [key, path] = feedDefs[i];
      status(`patch ${patch} · feed ${i + 1}/${feedDefs.length} (${key})…`);
      feeds[key] = (await get(`${path}?patch=${encodeURIComponent(patch)}`)).data;
    }

    const KEEP = ['pick_rate', 'kill_rate', 'escape_rate', 'top_perks', 'top_builds', 'stats_since_patch', 'last_update'];
    const pages = { killers: {}, survivors: {} };
    const failed = [];
    const groups =
      MODE === 'quick'
        ? []
        : MODE === 'killers'
        ? [['killers', feeds.killers.killers]]
        : [
            ['killers', feeds.killers.killers],
            ['survivors', feeds.survivors.survivors],
          ];

    for (const [kind, list] of groups) {
      const names = list.map((x) => x.name).filter((n) => n !== 'Overall Average');
      for (let i = 0; i < names.length; i++) {
        const name = names[i];
        const slug = encodeURIComponent(name.replace(/^The /, '').replace(/ /g, '_'));
        status(`${kind} ${i + 1}/${names.length}: ${name}`);
        try {
          const route = decodeTurboStream(await get(`/${kind}/${slug}.data`));
          const data = Object.entries(route).find(([k]) => k.startsWith(`routes/${kind}.`))?.[1]?.data?.data;
          if (!data) throw new Error('no data');
          pages[kind][name] = Object.fromEntries(KEEP.map((k) => [k, data[k] ?? null]));
        } catch (err) {
          failed.push(`${name}: ${err.message}`);
          console.warn(`[collector] ${name} failed: ${err.message}`);
        }
      }
    }

    const exportData = {
      format: 'dbd-toolbox-nightlight-export',
      version: 1,
      mode: MODE,
      collectedAt: new Date().toISOString(),
      source: 'https://nightlight.gg',
      patch,
      perkNames,
      feeds,
      pages,
      failed,
    };

    let sent = false;
    if (cfg.receiverUrl) {
      try {
        status('sending directly to DBD-Toolbox…');
        const res = await fetch(cfg.receiverUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(cfg.token ? { 'X-Import-Token': cfg.token } : {}),
          },
          body: JSON.stringify(exportData),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        sent = true;
        badge.style.borderColor = '#3ecf8e';
        status(`✓ Sent (${requests} requests, ${failed.length} failed)! You can close this tab.`);
      } catch (err) {
        console.warn(`[collector] direct send failed (${err.message}), falling back to file download`);
      }
    }

    if (!sent) {
      const blob = new Blob([JSON.stringify(exportData)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `nightlight-export-${exportData.collectedAt.slice(0, 10)}.json`;
      a.click();
      badge.style.borderColor = '#3ecf8e';
      status(`✓ Downloaded (${requests} requests, ${failed.length} failed).`);
    }
    setTimeout(() => badge.remove(), 12000);
  } catch (err) {
    badge.style.borderColor = '#ef4444';
    status(`✗ ${err.message}`);
    alert(`DBD-Toolbox collector error: ${err.message}`);
  }
})();

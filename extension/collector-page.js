// Runs in the MAIN world of https://nightlight.gg/perks/viewer so fetch() and
// performance.getEntriesByType('resource') use the user's normal Chrome session.
(async () => {
  const MODE = window.__DBD_EXT_MODE__ || 'full';
  const DELAY_MS = 1500;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const emit = (msg) => window.postMessage({ source: 'dbd-toolbox-ext', ...msg }, '*');

  if (location.hostname !== 'nightlight.gg') {
    emit({ type: 'collector-error', error: 'Niet op nightlight.gg' });
    return;
  }

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
    if (!res.ok) throw new Error(`HTTP ${res.status} voor ${path}`);
    return JSON.parse(await res.text());
  }

  async function findPerkNamesAndPatch() {
    const re = /"(\d+)":\{"n":"((?:[^"\\]|\\.)*)","i":"[^"]*","u":"\/perks\//g;
    // Wait up to 20s for NightLight's SPA scripts & initial patch request to load.
    for (let attempt = 0; attempt < 20; attempt++) {
      const perkNames = {};
      const scripts = new Set([
        ...performance.getEntriesByType('resource').map((e) => e.name),
        ...[...document.querySelectorAll('script[src], link[rel="modulepreload"]')].map((e) => e.src || e.href),
      ]);
      for (const url of scripts) {
        if (!url.startsWith(location.origin + '/assets/') || !url.endsWith('.js')) continue;
        try {
          const text = await (await fetch(url)).text();
          for (const m of text.matchAll(re)) perkNames[m[1]] = JSON.parse(`"${m[2]}"`);
          if (Object.keys(perkNames).length > 100) break;
        } catch {
          /* retry next tick */
        }
      }
      const patch =
        performance
          .getEntriesByType('resource')
          .map((e) => (e.name.includes('patch=') ? new URL(e.name).searchParams.get('patch') : null))
          .find(Boolean) ?? document.body.innerText.match(/Patch (\d+\.\d+\.\d+)/)?.[1];
      if (Object.keys(perkNames).length > 100 && patch) {
        return { perkNames, patch };
      }
      emit({ type: 'collector-progress', percent: 5, message: 'Wachten tot NightLight is geladen…' });
      await sleep(1000);
    }
    throw new Error('NightLight perk-lijst of patch niet gevonden. Controleer of nightlight.gg bereikbaar is (of doorloop eventuele Cloudflare-check in het tabblad).');
  }

  try {
    emit({ type: 'collector-progress', percent: 3, message: 'NightLight-pagina uitlezen…' });
    const { perkNames, patch } = await findPerkNamesAndPatch();

    const feeds = {};
    const feedDefs = [
      ['killers', '/api/v1/stats/global/killers'],
      ['survivors', '/api/v1/stats/global/survivors'],
      ['killerPerks', '/api/v1/stats/global/killer-perks'],
      ['survivorPerks', '/api/v1/stats/global/survivor-perks'],
    ];

    for (let i = 0; i < feedDefs.length; i++) {
      const [key, path] = feedDefs[i];
      const pctBase = MODE === 'quick' ? 15 + Math.round(((i + 1) / feedDefs.length) * 65) : 8 + i * 2;
      emit({
        type: 'collector-progress',
        percent: pctBase,
        message: `Patch ${patch} · global feed ${i + 1}/${feedDefs.length} (${key})…`,
      });
      feeds[key] = (await get(`${path}?patch=${encodeURIComponent(patch)}`)).data;
    }

    const KEEP = ['pick_rate', 'kill_rate', 'escape_rate', 'top_perks', 'top_builds', 'stats_since_patch', 'last_update'];
    const pages = { killers: {}, survivors: {} };
    const failed = [];
    const groups =
      MODE === 'quick'
        ? []
        : [
            ['killers', feeds.killers.killers],
            ['survivors', feeds.survivors.survivors],
          ];

    const totalPages = groups.reduce(
      (sum, [, list]) => sum + list.filter((x) => x.name !== 'Overall Average').length,
      0,
    );
    let donePages = 0;

    for (const [kind, list] of groups) {
      const names = list.map((x) => x.name).filter((n) => n !== 'Overall Average');
      for (const name of names) {
        donePages++;
        const percent = 16 + Math.round((donePages / Math.max(1, totalPages)) * 72);
        emit({
          type: 'collector-progress',
          percent,
          message: `${kind === 'killers' ? 'Killers' : 'Survivors'} ${donePages}/${totalPages}: ${name}`,
        });
        const slug = encodeURIComponent(name.replace(/^The /, '').replace(/ /g, '_'));
        try {
          const route = decodeTurboStream(await get(`/${kind}/${slug}.data`));
          const data = Object.entries(route).find(([k]) => k.startsWith(`routes/${kind}.`))?.[1]?.data?.data;
          if (!data) throw new Error('no data');
          pages[kind][name] = Object.fromEntries(KEEP.map((k) => [k, data[k] ?? null]));
        } catch (err) {
          failed.push(`${name}: ${err.message}`);
        }
      }
    }

    emit({
      type: 'collector-done',
      payload: {
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
        requests,
      },
    });
  } catch (err) {
    emit({ type: 'collector-error', error: err.message || String(err) });
  }
})();

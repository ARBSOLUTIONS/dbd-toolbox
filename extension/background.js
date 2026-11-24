import { parseNightlight, mergeNightlight } from './lib/nightlight-core.js';

const DEFAULT_CONFIG = {
  repo: 'ARBSOLUTIONS/dbd-toolbox',
  branch: 'test-toolbox',
  token: '',
  notifyPatches: true,
};

const ALARM_NAME = 'dbd-patch-check';
const WIKI_MAIN = 'https://deadbydaylight.wiki.gg/wiki/Dead_by_Daylight_Wiki';
const NL_VIEWER = 'https://nightlight.gg/perks/viewer';

// ---------- storage helpers ----------

async function getConfig() {
  const { config } = await chrome.storage.local.get('config');
  return { ...DEFAULT_CONFIG, ...(config || {}) };
}

async function setRunState(patch) {
  const { runState } = await chrome.storage.local.get('runState');
  const next = { ...(runState || {}), ...patch, updatedAt: new Date().toISOString() };
  await chrome.storage.local.set({ runState: next });
  return next;
}

async function getRunState() {
  const { runState } = await chrome.storage.local.get('runState');
  return runState || { running: false };
}

// ---------- UTF-8 safe base64 ----------

function utf8ToBase64(str) {
  const bytes = new TextEncoder().encode(str);
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function base64ToUtf8(b64) {
  const binary = atob(b64.replace(/\s+/g, ''));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

// ---------- GitHub API helpers ----------

function ghHeaders(token, accept = 'application/vnd.github+json') {
  const h = { Accept: accept, 'X-GitHub-Api-Version': '2022-11-28' };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

async function ghGetJsonFile(cfg, filePath, { optional = false } = {}) {
  const url = `https://api.github.com/repos/${cfg.repo}/contents/${filePath}?ref=${encodeURIComponent(cfg.branch)}`;
  const metaRes = await fetch(url, { headers: ghHeaders(cfg.token) });
  if (metaRes.status === 404 && optional) return { sha: null, data: null };
  if (!metaRes.ok) {
    const errText = await metaRes.text().catch(() => '');
    throw new Error(`GitHub leesfout (${filePath}): HTTP ${metaRes.status} ${errText.slice(0, 120)}`);
  }
  const meta = await metaRes.json();
  // GitHub returns empty `content` for files > 1 MB; fetch raw media type in that case.
  let text;
  if (meta.content) {
    text = base64ToUtf8(meta.content);
  } else {
    const rawRes = await fetch(url, { headers: ghHeaders(cfg.token, 'application/vnd.github.raw+json') });
    if (!rawRes.ok) throw new Error(`GitHub raw-leesfout (${filePath}): HTTP ${rawRes.status}`);
    text = await rawRes.text();
  }
  return { sha: meta.sha, data: JSON.parse(text) };
}

async function ghPutJsonFile(cfg, filePath, jsonObj, sha, message) {
  const url = `https://api.github.com/repos/${cfg.repo}/contents/${filePath}`;
  const body = {
    message,
    content: utf8ToBase64(JSON.stringify(jsonObj, null, 2)),
    branch: cfg.branch,
    ...(sha ? { sha } : {}),
  };
  const res = await fetch(url, {
    method: 'PUT',
    headers: { ...ghHeaders(cfg.token), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`GitHub commit mislukt: HTTP ${res.status} ${errText.slice(0, 160)}`);
  }
  return res.json();
}

async function ghTriggerWikiWorkflow(cfg) {
  const url = `https://api.github.com/repos/${cfg.repo}/actions/workflows/update-data.yml/dispatches`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { ...ghHeaders(cfg.token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ ref: cfg.branch, inputs: { force: 'true' } }),
  });
  if (res.status === 204) return { triggered: true };
  const errText = await res.text().catch(() => '');
  return { triggered: false, reason: `HTTP ${res.status} ${errText.slice(0, 100)}` };
}

// ---------- Automatic Wiki patch watcher ----------

async function fetchLiveWikiPatch() {
  const res = await fetch(WIKI_MAIN);
  if (!res.ok) throw new Error(`Wiki HTTP ${res.status}`);
  const html = await res.text();
  const match = html.match(/<a[^>]+href="\/wiki\/Patch_[^"]*"[^>]*>\s*(\d+\.\d+[^<]*?)\s*<\/a>/i);
  return match ? match[1].trim() : null;
}

async function checkPatchAndStatus({ notify = true } = {}) {
  const cfg = await getConfig();
  const status = { checkedAt: new Date().toISOString(), livePatch: null, repoPatch: null, nlCollectedAt: null, nlGames: null, patchAvailable: false, error: null };

  try {
    const [livePatch, metaFile, nlFile] = await Promise.all([
      fetchLiveWikiPatch().catch(() => null),
      ghGetJsonFile(cfg, 'data/meta.json', { optional: true }).catch(() => ({ data: null })),
      ghGetJsonFile(cfg, 'data/nightlight.json', { optional: true }).catch(() => ({ data: null })),
    ]);

    status.livePatch = livePatch;
    status.repoPatch = metaFile.data?.patch ?? null;
    status.nlCollectedAt = nlFile.data?.collectedAt ?? nlFile.data?.importedAt ?? null;
    status.nlGames = nlFile.data?.games ?? null;
    status.patchAvailable = Boolean(livePatch && status.repoPatch && livePatch !== status.repoPatch);

    const nlAgeDays = status.nlCollectedAt ? (Date.now() - Date.parse(status.nlCollectedAt)) / 86400e3 : Infinity;
    status.nlAgeDays = Number.isFinite(nlAgeDays) ? Math.floor(nlAgeDays) : null;

    if (status.patchAvailable) {
      await chrome.action.setBadgeText({ text: 'NEW' });
      await chrome.action.setBadgeBackgroundColor({ color: '#ef4444' });

      const { lastNotifiedPatch } = await chrome.storage.local.get('lastNotifiedPatch');
      if (notify && cfg.notifyPatches && lastNotifiedPatch !== livePatch) {
        await chrome.storage.local.set({ lastNotifiedPatch: livePatch });
        chrome.notifications.create(`patch-${livePatch}`, {
          type: 'basic',
          iconUrl: 'icon128.png',
          title: `Nieuwe DBD patch ${livePatch} is live!`,
          message: `DBD-Toolbox staat nog op ${status.repoPatch}. Klik om de extensie te openen en alle data in 1 klik bij te werken.`,
          priority: 2,
        });
      }
    } else if (nlAgeDays >= 7) {
      await chrome.action.setBadgeText({ text: '7d+' });
      await chrome.action.setBadgeBackgroundColor({ color: '#f59e0b' });
    } else {
      await chrome.action.setBadgeText({ text: '' });
    }
  } catch (err) {
    status.error = err.message;
  }

  await chrome.storage.local.set({ patchStatus: status });
  return status;
}

// ---------- 1-click full update orchestration ----------

let activeTabId = null;
let activeMode = 'full';

async function closeActiveTab() {
  if (activeTabId != null) {
    const id = activeTabId;
    activeTabId = null;
    await chrome.tabs.remove(id).catch(() => {});
  }
}

function waitForTabComplete(tabId, timeoutMs = 45000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(onUpdated);
      reject(new Error('Tabblad nightlight.gg laden duurde te lang.'));
    }, timeoutMs);
    function onUpdated(id, info) {
      if (id === tabId && info.status === 'complete') {
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(onUpdated);
        resolve();
      }
    }
    chrome.tabs.onUpdated.addListener(onUpdated);
  });
}

async function startUpdate({ mode = 'full', triggerWiki = true } = {}) {
  const current = await getRunState();
  if (current.running) return { ok: false, error: 'Er loopt al een update.' };

  const cfg = await getConfig();
  if (!cfg.token) {
    return { ok: false, error: 'Vul eerst je GitHub Token in bij Instellingen.' };
  }

  activeMode = mode;
  await setRunState({
    running: true,
    mode,
    percent: 2,
    message: triggerWiki ? 'Wiki patch-check starten op GitHub Actions…' : 'NightLight tabblad openen…',
    wikiTriggered: null,
    error: null,
    startedAt: new Date().toISOString(),
  });

  try {
    let wikiResult = null;
    if (triggerWiki) {
      wikiResult = await ghTriggerWikiWorkflow(cfg);
      await setRunState({
        percent: 5,
        wikiTriggered: wikiResult,
        message: wikiResult.triggered
          ? 'Wiki-check gestart op GitHub ✓ · NightLight openen…'
          : `Wiki-check overgeslagen (${wikiResult.reason}) · NightLight openen…`,
      });
    }

    const tab = await chrome.tabs.create({ url: NL_VIEWER, active: false });
    activeTabId = tab.id;
    await waitForTabComplete(tab.id);

    await setRunState({ percent: 8, message: 'Collector injecteren op nightlight.gg…' });
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['bridge.js'] });
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: 'MAIN',
      func: (m) => {
        window.__DBD_EXT_MODE__ = m;
      },
      args: [mode],
    });
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, world: 'MAIN', files: ['collector-page.js'] });
    return { ok: true };
  } catch (err) {
    await closeActiveTab();
    await setRunState({ running: false, error: err.message, message: `Fout: ${err.message}` });
    return { ok: false, error: err.message };
  }
}

async function finishNightlightImport(rawPayload) {
  const cfg = await getConfig();
  try {
    await setRunState({ percent: 90, message: 'Game-data & huidige stats ophalen van GitHub…' });
    const [perksF, killersF, survivorsF, oldNlF] = await Promise.all([
      ghGetJsonFile(cfg, 'data/perks.json'),
      ghGetJsonFile(cfg, 'data/killers.json'),
      ghGetJsonFile(cfg, 'data/survivors.json'),
      ghGetJsonFile(cfg, 'data/nightlight.json', { optional: true }),
    ]);

    await setRunState({ percent: 94, message: 'NightLight-data parsen & samenvoegen…' });
    const parsed = parseNightlight(rawPayload, {
      perks: perksF.data,
      killers: killersF.data,
      survivors: survivorsF.data,
    });
    const merged = mergeNightlight(parsed, oldNlF.data, { singleFeed: false });

    // Safety net: a quick run collects no character pages, so it depends on the
    // previous file for top perks and builds. Never commit a file that loses them.
    const pageCount = (s) =>
      Object.values(s?.killers ?? {}).filter((k) => k.topPerks?.length).length +
      Object.values(s?.survivors ?? {}).filter((k) => k.topBuilds?.length).length;
    if ((rawPayload.mode ?? activeMode) === 'quick' && !oldNlF.data) {
      throw new Error('Quick update gestopt: de huidige nightlight.json kon niet gelezen worden, dan zouden de top-builds verdwijnen. Doe een volledige update.');
    }
    if (pageCount(oldNlF.data) > 0 && pageCount(merged) < pageCount(oldNlF.data) / 2) {
      throw new Error(`Update gestopt: top-perks/builds zouden verdwijnen (${pageCount(oldNlF.data)} → ${pageCount(merged)}). Herlaad de extensie op chrome://extensions en probeer opnieuw.`);
    }
    if (oldNlF.data?.popularSurvivorBuilds?.length && !merged.popularSurvivorBuilds?.length) {
      throw new Error('Update gestopt: de populaire survivor-builds zouden verdwijnen. Herlaad de extensie en probeer opnieuw.');
    }

    await setRunState({ percent: 97, message: `Committen naar GitHub (${cfg.branch})…` });
    const dateStr = new Date().toISOString().slice(0, 10);
    const commitRes = await ghPutJsonFile(
      cfg,
      'data/nightlight.json',
      merged,
      oldNlF.sha,
      `Update NightLight stats (${rawPayload.mode ?? activeMode}, ${dateStr})`,
    );

    await closeActiveTab();
    const commitUrl = commitRes?.commit?.html_url ?? `https://github.com/${cfg.repo}/commits/${cfg.branch}`;
    const summary = `${Object.keys(merged.perks).length} perks · ${Object.keys(merged.killers).length} killers · ${merged.games?.toLocaleString?.() ?? merged.games} games`;

    await setRunState({
      running: false,
      percent: 100,
      error: null,
      message: `Klaar! Gepusht naar ${cfg.branch} (${summary}). Cloudflare bouwt nu (~2 min).`,
      lastCommitUrl: commitUrl,
      lastSuccessAt: new Date().toISOString(),
      lastSummary: summary,
    });

    await checkPatchAndStatus({ notify: false });

    chrome.notifications.create(`done-${Date.now()}`, {
      type: 'basic',
      iconUrl: 'icon128.png',
      title: 'DBD-Toolbox data bijgewerkt ✓',
      message: `${summary} gepusht naar ${cfg.branch}. Cloudflare Pages herbouwt de site binnen ~2 minuten.`,
      priority: 1,
    });
  } catch (err) {
    await closeActiveTab();
    await setRunState({ running: false, error: err.message, message: `Fout bij upload: ${err.message}` });
    chrome.notifications.create(`err-${Date.now()}`, {
      type: 'basic',
      iconUrl: 'icon128.png',
      title: 'DBD-Toolbox update mislukt',
      message: err.message,
      priority: 2,
    });
  }
}

// ---------- Listeners ----------

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create(ALARM_NAME, { periodInMinutes: 360 });
  checkPatchAndStatus({ notify: true });
});

chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create(ALARM_NAME, { periodInMinutes: 360 });
  checkPatchAndStatus({ notify: true });
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) checkPatchAndStatus({ notify: true });
});

chrome.notifications.onClicked.addListener(async (id) => {
  chrome.notifications.clear(id);
  if (id.startsWith('patch-')) {
    const cfg = await getConfig();
    const url = cfg.branch === 'main' ? 'https://dbdtoolbox.wiki/' : 'https://test-toolbox.pages.dev/';
    chrome.tabs.create({ url });
  }
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'collector-progress') {
    setRunState({ percent: msg.percent, message: msg.message });
    return false;
  }
  if (msg?.type === 'collector-done') {
    finishNightlightImport(msg.payload);
    return false;
  }
  if (msg?.type === 'collector-error') {
    closeActiveTab();
    setRunState({ running: false, error: msg.error, message: `Fout: ${msg.error}` });
    return false;
  }
  if (msg?.type === 'start-update') {
    startUpdate({ mode: msg.mode || 'full', triggerWiki: msg.triggerWiki !== false }).then(sendResponse);
    return true;
  }
  if (msg?.type === 'cancel-update') {
    closeActiveTab().then(() => setRunState({ running: false, message: 'Update geannuleerd.' })).then(() => sendResponse({ ok: true }));
    return true;
  }
  if (msg?.type === 'check-patch-now') {
    checkPatchAndStatus({ notify: false }).then((status) => sendResponse({ ok: true, status }));
    return true;
  }
  return false;
});

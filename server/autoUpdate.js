// Automatic updates with patch prediction.
//
// While the server runs, it checks the wiki main page (ONE small request) to see
// whether a new patch is live. How often depends on the prediction (predict.js):
//   - normally every AUTO_UPDATE_HOURS (default 12)
//   - on a predicted patch day (announced chapter or the usual Tuesday rhythm):
//     every hour from the afternoon, then every 4 hours for two more days
//   - 24 hours after an update, one follow-up refresh, because the wiki keeps
//     filling in new perks and changes for a while after a release
// Only when the patch number changed (or data is very old) does it download everything.
//
// Settings (environment variables, all optional):
//   AUTO_UPDATE=off          turn automatic checks off
//   AUTO_UPDATE_HOURS=12     hours between normal checks (minimum 1)
//   AUTO_UPDATE_MAX_DAYS=14  also refresh when data is older than this
import fs from 'node:fs/promises';
import path from 'node:path';
import { refreshData, fetchMainPage, readCurrentData, updatePatchHistory, DATA_DIR } from './refresh.js';
import { predictNextPatch, hotWindows, intervalAt, nextCheckAt } from './predict.js';

const STATE_FILE = path.join(DATA_DIR, 'auto-update.json');
const HISTORY_FILE = path.join(DATA_DIR, 'patch-history.json');
const FOLLOW_UP_HOURS = 24;

export const settings = {
  enabled: process.env.AUTO_UPDATE !== 'off',
  hours: Math.max(1, Number(process.env.AUTO_UPDATE_HOURS) || 12),
  maxDays: Number(process.env.AUTO_UPDATE_MAX_DAYS) || 14,
};

// Shared refresh state: used by the "Refresh data" button and the auto-updater.
export const refresh = { running: false, log: [], error: null, finishedAt: null, reason: null };

export function startRefresh(reason = 'manual', onDone) {
  if (refresh.running) return false;
  Object.assign(refresh, { running: true, log: [], error: null, finishedAt: null, reason });
  const log = (msg) => {
    console.log(`[refresh] ${msg}`);
    refresh.log.push(msg);
  };
  log(`Starting refresh (${reason})...`);
  refreshData(log)
    .then(() => onDone?.())
    .catch((err) => {
      refresh.error = err.message;
      log(`Refresh failed: ${err.message}`);
    })
    .finally(() => {
      refresh.running = false;
      refresh.finishedAt = new Date().toISOString();
    });
  return true;
}

async function readJsonFile(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch {
    return fallback;
  }
}
const readState = () => readJsonFile(STATE_FILE, {});

async function writeState(patch) {
  const state = { ...(await readState()), ...patch };
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(STATE_FILE, JSON.stringify(state, null, 2));
  return state;
}

/** Prediction based on stored history and the latest known announcements. */
async function currentPrediction(state, now = new Date()) {
  const history = await readJsonFile(HISTORY_FILE, []);
  const { meta } = await readCurrentData();
  const announcements = state.announcements ?? meta?.announcements ?? [];
  const prediction = predictNextPatch(history, announcements, now);
  return { prediction, windows: hotWindows(prediction.predictions) };
}

/** Public status for the app: last check, next check and the prediction. */
export async function autoUpdateStatus() {
  const state = await readState();
  const { prediction, windows } = await currentPrediction(state);
  const last = state.lastCheck ? Date.parse(state.lastCheck) : null;
  let next = settings.enabled ? nextCheckAt(last, windows, settings.hours) : null;
  if (next && state.followUpAt) next = Math.min(next, Date.parse(state.followUpAt));
  return {
    ...settings,
    ...state,
    nextCheck: next ? new Date(next).toISOString() : null,
    checkEveryHoursNow: intervalAt(Date.now(), windows, settings.hours),
    prediction,
  };
}

/**
 * Checks whether a refresh is needed and starts one if so.
 * Skips the check when it is not due yet (so restarts cause no extra requests).
 */
export async function checkForUpdate({ force = false, wait = false } = {}) {
  // wait=true (used by GitHub Actions): run the refresh and wait until it is done.
  const run = async (reason, onDone) => {
    if (!wait) return startRefresh(reason, onDone);
    console.log(`[auto-update] refreshing (${reason})...`);
    await refreshData((m) => console.log(`[refresh] ${m}`));
    await onDone?.();
  };
  const state = await readState();
  const now = Date.now();
  if (refresh.running) return { skipped: true, reason: 'refresh already running' };

  // Follow-up refresh one day after an update (the wiki is still being filled in).
  if (!force && state.followUpAt && now >= Date.parse(state.followUpAt)) {
    await writeState({ followUpAt: null, lastResult: { action: 'refresh', why: 'follow-up 24h after an update' } });
    await run('auto: follow-up after update');
    return { action: 'refresh', why: 'follow-up' };
  }

  const { windows } = await currentPrediction(state);
  const last = state.lastCheck ? Date.parse(state.lastCheck) : null;
  if (!force && last && now < nextCheckAt(last, windows, settings.hours)) return { skipped: true };

  const { meta } = await readCurrentData();
  let result;
  let announcements = state.announcements ?? [];
  try {
    const live = await fetchMainPage();
    announcements = live.announcements;
    const ageDays = meta ? (now - Date.parse(meta.fetchedAt)) / 86400e3 : Infinity;
    if (!meta) result = { action: 'refresh', why: 'no data yet', livePatch: live.patch };
    else if (live.patch && live.patch !== meta.patch)
      result = { action: 'refresh', why: `new patch ${live.patch} (had ${meta.patch})`, livePatch: live.patch };
    else if (ageDays > settings.maxDays)
      result = { action: 'refresh', why: `data older than ${settings.maxDays} days`, livePatch: live.patch };
    else result = { action: 'none', why: `still on patch ${live.patch}`, livePatch: live.patch };
  } catch (err) {
    result = { action: 'error', why: err.message };
  }

  await writeState({ lastCheck: new Date(now).toISOString(), lastResult: result, announcements });
  console.log(`[auto-update] ${result.action}: ${result.why}`);
  if (result.action === 'refresh') {
    const isPatch = result.why.startsWith('new patch');
    await run(`auto: ${result.why}`, async () => {
      if (isPatch) await writeState({ followUpAt: new Date(Date.now() + FOLLOW_UP_HOURS * 3600e3).toISOString() });
    });
  }
  return result;
}

/** Makes sure there is a patch history to predict from (one-time download). */
async function ensureHistory() {
  const history = await readJsonFile(HISTORY_FILE, []);
  if (!history.length) {
    console.log('[auto-update] downloading patch history once (for predictions)...');
    await updatePatchHistory((m) => console.log(`[auto-update] ${m}`));
  }
}

/** Starts the timer: a check shortly after start-up, then every 5 minutes we see whether a check is due. */
export function startAutoUpdate() {
  if (!settings.enabled) {
    console.log('[auto-update] off (AUTO_UPDATE=off)');
    return;
  }
  console.log(
    `[auto-update] on: every ${settings.hours}h normally, every hour on predicted patch days`,
  );
  const tick = () => checkForUpdate().catch((err) => console.error('[auto-update]', err.message));
  setTimeout(() => ensureHistory().catch(() => {}).finally(tick), 10_000);
  setInterval(tick, 5 * 60_000).unref();
}

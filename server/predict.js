// Predicts when the next Dead by Daylight patch will come out, and plans the
// update checks around it. Pure functions (no network), so they are easy to test.
//
// Inputs:
//   - patch history from the wiki (version + release date), e.g. 10.2.2a on 29 Oct 2026
//   - announcements on the wiki main page, e.g. "a Chapter DLC set to release on 24 November 2026"
//
// Observations from the history (2026): most patches release on a Tuesday;
// hotfixes follow 1–2 weeks after a big patch. The wiki only has dates, no times.
// ASSUMPTION: patches usually go live in the afternoon/evening European time, so the
// "hot" checking window on a predicted day starts at RELEASE_HOUR_UTC.
import * as cheerio from 'cheerio';

export const RELEASE_HOUR_UTC = 14;
const DAY = 86400e3;
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** "24 November 2026" or "24_November_2026" -> Date (UTC midnight), or null. */
export function parseWikiDate(text) {
  const m = String(text).replace(/_/g, ' ').match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
  if (!m) return null;
  const month = MONTHS.indexOf(m[2].toLowerCase());
  return month < 0 ? null : new Date(Date.UTC(Number(m[3]), month, Number(m[1])));
}

const isoDay = (d) => d.toISOString().slice(0, 10);

/** Parses a /wiki/Patches/<year> page: [{ version, date: 'YYYY-MM-DD' }], newest first. */
export function parsePatchHistory(html) {
  const out = [];
  const re = /id="Patch_([0-9][0-9.a-z]*)_-_(\d{1,2}_[A-Za-z]+_\d{4})"/g;
  for (const m of html.matchAll(re)) {
    const date = parseWikiDate(m[2]);
    if (date) out.push({ version: m[1], date: isoDay(date) });
  }
  return out;
}

/**
 * Finds announced future releases on the wiki main page, e.g.
 * "He will be introduced as the Killer of Terrifier, a Chapter DLC set to release on 24 November 2026."
 */
export function parseAnnouncements(html) {
  const $ = cheerio.load(html);
  const text = $('#mw-content-text').text().replace(/\s+/g, ' ');
  const out = [];
  const re = /([^.]{0,120}?)\b(?:set to release|will (?:be )?release|releasing|releases?) on (\d{1,2} [A-Z][a-z]+ \d{4})/g;
  for (const m of text.matchAll(re)) {
    const date = parseWikiDate(m[2]);
    if (!date) continue;
    const ctx = m[1];
    const name =
      ctx.match(/of ([A-Z][^,]{1,40}), an? (?:Chapter|DLC|Paragraph|Collection)/)?.[1] ??
      ctx.match(/([A-Z][\w'’ :-]{2,40}),? an? (?:Chapter|DLC)/)?.[1] ??
      'Announced release';
    const kind = /chapter/i.test(ctx) ? 'chapter' : 'release';
    out.push({ name: name.trim(), kind, date: isoDay(date) });
  }
  // Unique by date+name
  return out.filter((a, i) => out.findIndex((b) => b.date === a.date && b.name === a.name) === i);
}

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null;
};

/**
 * Predicts the next patch.
 * Returns { lastPatch, medianDays, usualWeekday, weekdayShare, announced: [...], predictions: [...] }
 * where each prediction is { date, source: 'announced'|'pattern', label, confidence }.
 */
export function predictNextPatch(history, announcements = [], now = new Date()) {
  const today = isoDay(now);
  const sorted = [...history].sort((a, b) => b.date.localeCompare(a.date));
  const last = sorted[0] ?? null;

  // Intervals between consecutive patches (last 12 months is enough to follow the current rhythm).
  const recent = sorted.filter((p) => now - new Date(p.date) < 365 * DAY);
  const gaps = recent.slice(0, -1).map((p, i) => (new Date(p.date) - new Date(recent[i + 1].date)) / DAY);
  const medianDays = median(gaps) ?? 14;

  // Most common release weekday.
  const counts = Array(7).fill(0);
  for (const p of recent) counts[new Date(p.date).getUTCDay()]++;
  const usual = counts.indexOf(Math.max(...counts));
  const weekdayShare = recent.length ? counts[usual] / recent.length : 0;

  const predictions = [];
  for (const a of announcements.filter((x) => x.date >= today)) {
    predictions.push({
      date: a.date,
      source: 'announced',
      label: `${a.name}${a.kind === 'chapter' ? ' chapter' : ''} (announced on the wiki)`,
      confidence: 'high',
    });
  }

  if (last) {
    // last patch + typical gap, moved to the usual weekday; never in the past.
    let d = new Date(new Date(last.date).getTime() + Math.round(medianDays) * DAY);
    if (d < new Date(today)) d = new Date(today);
    while (d.getUTCDay() !== usual) d = new Date(d.getTime() + DAY);
    const date = isoDay(d);
    if (!predictions.some((p) => Math.abs(new Date(p.date) - d) <= 2 * DAY)) {
      predictions.push({
        date,
        source: 'pattern',
        label: `Likely patch: ~${Math.round(medianDays)} days after ${last.version}, on a ${WEEKDAYS[usual]}`,
        confidence: weekdayShare >= 0.7 ? 'medium' : 'low',
      });
    }
  }

  predictions.sort((a, b) => a.date.localeCompare(b.date));
  return {
    lastPatch: last,
    medianDays,
    usualWeekday: WEEKDAYS[usual],
    weekdayShare: Math.round(weekdayShare * 100) / 100,
    predictions,
  };
}

/**
 * Turns predictions into "hot" time windows in which we check often:
 *   predicted day from RELEASE_HOUR_UTC until the end of the next day -> every hour
 *   the two days after that (the wiki is still being updated)           -> every 4 hours
 */
export function hotWindows(predictions) {
  const windows = [];
  for (const p of predictions) {
    const start = new Date(`${p.date}T00:00:00Z`).getTime() + RELEASE_HOUR_UTC * 3600e3;
    const dayEnd = new Date(`${p.date}T00:00:00Z`).getTime() + 2 * DAY;
    windows.push({ start, end: dayEnd, everyHours: 1, label: p.label });
    windows.push({ start: dayEnd, end: dayEnd + 2 * DAY, everyHours: 4, label: `${p.label} (follow-up)` });
  }
  return windows;
}

/** How many hours between checks at time `t` (base interval outside hot windows). */
export function intervalAt(t, windows, baseHours) {
  const w = windows.filter((x) => t >= x.start && t < x.end);
  return w.length ? Math.min(...w.map((x) => x.everyHours)) : baseHours;
}

/**
 * When the next check should happen, given the last check.
 * Normally lastCheck + base interval, but earlier if a hot window starts before that.
 */
export function nextCheckAt(lastCheck, windows, baseHours) {
  if (!lastCheck) return Date.now();
  const normal = lastCheck + intervalAt(lastCheck, windows, baseHours) * 3600e3;
  const upcoming = windows.map((w) => w.start).filter((s) => s > lastCheck && s < normal);
  return Math.min(normal, ...upcoming);
}

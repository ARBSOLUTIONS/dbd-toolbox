// Tests for patch prediction and check planning (server/predict.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  parseWikiDate,
  parseAnnouncements,
  predictNextPatch,
  hotWindows,
  intervalAt,
  nextCheckAt,
  RELEASE_HOUR_UTC,
} from '../server/predict.js';

const history = JSON.parse(fs.readFileSync(new URL('../data/patch-history.json', import.meta.url), 'utf8'));
const H = 3600e3;

test('parses wiki dates', () => {
  assert.equal(parseWikiDate('24 November 2026').toISOString(), '2026-11-24T00:00:00.000Z');
  assert.equal(parseWikiDate('6_October_2026').toISOString(), '2026-10-06T00:00:00.000Z');
  assert.equal(parseWikiDate('soon'), null);
});

test('finds an announced chapter on the main page', () => {
  const html = `<div id="mw-content-text">He will be introduced as the Killer of Terrifier,
    a Chapter DLC set to release on 24 November 2026. Read more</div>`;
  assert.deepEqual(parseAnnouncements(html), [{ name: 'Terrifier', kind: 'chapter', date: '2026-11-24' }]);
});

test('pattern prediction lands on the usual weekday, never in the past', () => {
  const now = new Date('2026-11-08T03:00:00Z'); // a Sunday
  const p = predictNextPatch(history, [], now);
  assert.equal(p.usualWeekday, 'Tuesday');
  const next = p.predictions[0];
  assert.equal(next.source, 'pattern');
  assert.ok(next.date >= '2026-11-08');
  assert.equal(new Date(next.date).getUTCDay(), 2);
});

test('announced release is included; a pattern date close to it is merged away', () => {
  const now = new Date('2026-11-20T03:00:00Z');
  const p = predictNextPatch(history, [{ name: 'Terrifier', kind: 'chapter', date: '2026-11-24' }], now);
  assert.equal(p.predictions.length, 1, JSON.stringify(p.predictions));
  assert.equal(p.predictions[0].source, 'announced');
});

test('past announcements are ignored', () => {
  const p = predictNextPatch(history, [{ name: 'Old', kind: 'chapter', date: '2026-08-25' }], new Date('2026-11-08'));
  assert.ok(!p.predictions.some((x) => x.source === 'announced'));
});

test('checks every hour on a predicted day, every 4h after, base interval otherwise', () => {
  const w = hotWindows([{ date: '2026-11-24', label: 'x' }]);
  const day = Date.parse('2026-11-24T00:00:00Z');
  assert.equal(intervalAt(day + (RELEASE_HOUR_UTC + 1) * H, w, 12), 1);
  assert.equal(intervalAt(day + 2 * 24 * H + 5 * H, w, 12), 4);
  assert.equal(intervalAt(day - 3 * 24 * H, w, 12), 12);
});

test('next check jumps forward to the start of a patch window', () => {
  const w = hotWindows([{ date: '2026-11-24', label: 'x' }]);
  const windowStart = Date.parse('2026-11-24T00:00:00Z') + RELEASE_HOUR_UTC * H;
  const last = windowStart - 2 * H; // normal next check would be 10h after the window opened
  assert.equal(nextCheckAt(last, w, 12), windowStart);
  assert.equal(nextCheckAt(windowStart + 30 * 60e3, w, 12), windowStart + 30 * 60e3 + H);
});

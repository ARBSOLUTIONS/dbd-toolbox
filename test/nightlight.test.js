// Tests for the NightLight killer stats import.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseNightlight } from '../server/nightlight.js';

const killers = JSON.parse(fs.readFileSync(new URL('../data/killers.json', import.meta.url), 'utf8'));

function response(rows) {
  return {
    status: 'success',
    error: null,
    data: { killers: rows, start: '2026-10-11T16:00:00Z', end: '2026-11-08T16:00:00Z' },
  };
}
const row = (name, i) => ({
  name,
  kill_rate: 40 + (i % 10),
  pick_rate: 2 + i / 10,
  matches: 100 + i,
  breakdown: { 0: 30, 1: 20, 2: 15, 3: 15, 4: 20 },
});

test('matches NightLight names to our killer ids and keeps the average apart', () => {
  const rows = killers.slice(0, 30).map((k, i) => row(k.name, i));
  rows.push(row('Overall Average', 0), row('The Brand New Killer', 1));
  const s = parseNightlight(response(rows), killers, '2026-11-08T00:00:00Z');
  assert.equal(Object.keys(s.killers).length, 30);
  assert.equal(s.killers[killers[0].id].matches, 100);
  assert.deepEqual(s.killers[killers[0].id].kills, [30, 20, 15, 15, 20]);
  assert.equal(s.games, killers.slice(0, 30).reduce((sum, _k, i) => sum + 100 + i, 0));
  assert.deepEqual(s.unmatched, ['The Brand New Killer']);
  assert.equal(s.source.name, 'NightLight');
});

test('names match without "The" and with special letters (Onryō)', () => {
  const others = killers.filter((k) => k.id !== 'the-onryo').slice(0, 25);
  const rows = others.map((k, i) => row(k.name.replace(/^The /, ''), i));
  rows.push(row('Overall Average', 0), row('Onryō', 2));
  const s = parseNightlight(response(rows), killers);
  assert.ok(s.killers['the-onryo']);
  assert.equal(Object.keys(s.killers).length, 26);
  assert.equal(s.unmatched.length, 0);
});

test('bad or incomplete responses throw, so old stats are kept', () => {
  assert.throws(() => parseNightlight({ status: 'error' }, killers));
  assert.throws(() => parseNightlight(response([row('The Trapper', 1)]), killers));
});

test('out-of-range numbers become null instead of breaking the page', () => {
  const rows = killers.slice(0, 25).map((k, i) => row(k.name, i));
  rows[0].kill_rate = 250;
  rows.push(row('Overall Average', 0));
  const s = parseNightlight(response(rows), killers);
  assert.equal(s.killers[killers[0].id].killRate, null);
});

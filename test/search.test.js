import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { makeQuery } from '../src/lib/search.js';

const perks = JSON.parse(fs.readFileSync(new URL('../data/perks.json', import.meta.url), 'utf8'));
const find = (query) => perks.filter((p) => makeQuery(query).matches(p.name)).map((p) => p.name);

test('search: accents, spaces and punctuation do not matter', () => {
  for (const q of ['deja vu', 'dejavu', 'DEJA-VU', 'Déjà Vu']) assert.ok(find(q).includes('Déjà Vu'), q);
  assert.ok(find('hex ruin').includes('Hex: Ruin'));
  assert.ok(find('popgoestheweasel').includes('Pop Goes the Weasel'));
  assert.ok(find('well make it').includes("We'll Make It"));
});

test('search: small typos still find the perk', () => {
  assert.ok(find('barbeque').some((n) => n.startsWith('Barbecue')));
  assert.ok(find('decisive strik').includes('Decisive Strike'));
  assert.ok(find('dejavo').includes('Déjà Vu'));
  assert.ok(find('adrenalin').includes('Adrenaline'));
});

test('search: every perk name is found by its plain spelling', () => {
  for (const p of perks) {
    const plain = p.name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, '');
    assert.ok(makeQuery(plain).matches(p.name), p.name);
  }
});

test('search: short queries stay strict', () => {
  assert.equal(makeQuery('xyz').matches('Lithe'), false);
});

test('search: skipped words still match', () => {
  assert.ok(makeQuery('pop goes weasel').matches('Pop Goes the Weasel'));
  assert.ok(makeQuery('no one escapes').matches('Hex: No One Escapes Death'));
});

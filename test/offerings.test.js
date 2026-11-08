// Tests for offering ratings.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { withOfferingRatings, OFFERING_RATINGS } from '../src/lib/offeringRatings.js';

const offerings = withOfferingRatings(JSON.parse(fs.readFileSync(new URL('../data/offerings.json', import.meta.url), 'utf8')));

test('every hand-rated offering name exists in the data', () => {
  const names = new Set(offerings.map((o) => o.name));
  const unknown = Object.keys(OFFERING_RATINGS).filter((n) => !names.has(n));
  assert.deepEqual(unknown, [], `renamed or removed: ${unknown.join(', ')}`);
});

test('every available offering has 1-5 stars and a reason', () => {
  for (const o of offerings.filter((x) => x.rating.available)) {
    assert.ok(o.rating.stars >= 1 && o.rating.stars <= 5, o.name);
    assert.ok(o.rating.why.length > 10, o.name);
  }
});

test('Bloodpoint offerings never rank above 1 star; Ebony Mori is the best killer offering', () => {
  assert.ok(offerings.filter((o) => o.rating.kind === 'bloodpoints').every((o) => o.rating.stars === 1));
  const ebony = offerings.find((o) => o.name === 'Ebony Memento Mori');
  assert.equal(ebony.rating.stars, 5);
  assert.equal(ebony.rating.role, 'killer');
});

test('retired offerings are marked as not available', () => {
  const retired = offerings.filter((o) => /no longer available|was retired/i.test(o.description));
  assert.ok(retired.length > 0);
  assert.ok(retired.every((o) => !o.rating.available));
});

test('new, unknown offerings still get a sensible rating', () => {
  const [bp, realm] = withOfferingRatings([
    { name: 'New Wreath', role: 'killer', category: 'Bonus Bloodpoints', description: 'Grants +100% bonus Bloodpoints in the Chaos category.' },
    { name: 'New Map', role: 'both', category: 'Realm Selection', description: 'Increases the chances to be sent to a new map.' },
  ]);
  assert.equal(bp.rating.kind, 'bloodpoints');
  assert.equal(realm.rating.kind, 'situational');
});

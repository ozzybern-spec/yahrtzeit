import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shortPlace } from '../scripts/place-names.mjs';

test('curated names for well-known attacks', () => {
  assert.equal(shortPlace('רעים, פסטיבל "נובה" סמוך לקיבוץ'), 'פסטיבל נובה, רעים');
});

test('"City - spot" becomes "spot, City" without quotes', () => {
  assert.equal(shortPlace('ירושלים - שוק מחנה יהודה'), 'שוק מחנה יהודה, ירושלים');
  assert.equal(shortPlace('תל אביב - מלון "סבוי"'), 'מלון סבוי, תל אביב');
});

test('short names stay as they are', () => {
  assert.equal(shortPlace('בארי'), undefined);
  assert.equal(shortPlace(undefined), undefined);
});

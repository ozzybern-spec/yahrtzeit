import { test } from 'node:test';
import assert from 'node:assert/strict';
import { months } from '@hebcal/hdate';
import { toSoldier } from '../scripts/build-data.mjs';

// Synthetic record in the shape scrape-izkor.mjs produces (not a real person).
const raw = {
  person_id: 'en_test', legacy_id: '123', full_name: 'פלוני אלמוני', rank: 'סמל', unit: 'חיל רגלים',
  gender: 'נ', age: '20', parents_label: 'בת שרה ויעקב', jewish_death_date: 'כ"ז באייר  תשכ"ז',
  death_date: '6-6-1967', birth_city: 'חיפה', cemetery_name: 'הר הרצל', is_mia: false, has_image: true,
  life_story: 'טקסט', en: { full_name: 'Ploni Almoni', rank: 'Sergeant', unit: 'Infantry', birth_city: 'HAIFA', parents_label: 'Daughter of Sarah and Yaakov' },
};

test('toSoldier maps the official record', () => {
  const p = toSoldier(raw);
  assert.equal(p.id, 'izkor-123');
  assert.equal(p.gender, 'f');
  assert.equal(p.died, '1967-06-06');
  assert.deepEqual(p.hebrewDate, { yy: 5727, mm: months.IYYAR, dd: 27 });
  assert.equal(p.name.en, 'Ploni Almoni');
  assert.equal(p.hometown.en, 'Haifa');
  assert.equal(p.photo, 'https://www.izkor.gov.il/assets/person/images/000123.jpg');
});

test('a Hebrew date that disagrees with the Gregorian date is dropped', () => {
  const p = toSoldier({ ...raw, jewish_death_date: 'א\' בניסן תשכ"ז' });
  assert.equal(p.hebrewDate, undefined);
  assert.equal(p.dateMismatch, true);
});

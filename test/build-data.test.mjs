import { test } from 'node:test';
import assert from 'node:assert/strict';
import { months } from '@hebcal/hdate';
import { toSoldier, fatherFromLabel } from '../scripts/build-data.mjs';

// Synthetic record in the shape scrape-izkor.mjs produces (not a real person).
const raw = {
  person_id: 'en_test', legacy_id: '123', full_name: 'פלוני אלמוני', rank: 'סמל', unit: 'חיל רגלים',
  gender: 'נ', age: '20', father_name: 'יעקב', mother_name: 'שרה', parents_label: 'בת שרה ויעקב', jewish_death_date: 'כ"ז באייר  תשכ"ז',
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

test("a soldier's father comes from the official field", () => {
  assert.equal(toSoldier(raw).father, 'יעקב');
});

test("fatherFromLabel reads a civilian's parents line (mother first)", () => {
  const names = { male: new Set(['שלום', 'סאלם', 'שלמה']), female: new Set(['שושנה', 'רבקה']) };
  assert.equal(fatherFromLabel('בן שושנה ושלמה', names), 'שלמה');
  // One parent whose surname starts with ו.
  assert.equal(fatherFromLabel('בן הרב שלום וינברגר', names), 'הרב שלום וינברגר');
  assert.equal(fatherFromLabel('בן שלום וולף', names), 'שלום וולף');
  // One name: the father if it is a father's name, otherwise unknown.
  assert.equal(fatherFromLabel('בן סאלם', names), 'סאלם');
  assert.equal(fatherFromLabel('בת רבקה', names), undefined);
  assert.equal(fatherFromLabel('', names), undefined);
});

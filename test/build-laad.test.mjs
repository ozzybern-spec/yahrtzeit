import { test } from 'node:test';
import assert from 'node:assert/strict';
import { months } from '@hebcal/hdate';
import { parseDeath, toPerson } from '../scripts/build-laad.mjs';

// Synthetic record in the shape scrape-laad.mjs produces (not a real person).
const raw = {
  id: 1, name: 'פלונית אלמונית', nick: '', age: 'בת 40 במותה', parents: 'בת שרה ויעקב',
  birthPlace: '', birth: '', lived: 'התגוררה בחיפה', cause: 'חללת פעולת איבה',
  death: 'בכ"ב בתשרי תשפ"ד, 7/10/2023', eventPlace: 'מקום אירוע: כביש 232',
  eventDate: '', backDate: '', region: '', grave: 'הובאה למנוחת עולמים בחיפה\nחלקה: 1', photo: '',
};

test('parseDeath reads Hebrew and Gregorian parts', () => {
  assert.deepEqual(parseDeath('בכ"ב בתשרי תשפ"ד, 7/10/2023'),
    { greg: '2023-10-07', hebrew: { yy: 5784, mm: months.TISHREI, dd: 22 } });
  assert.deepEqual(parseDeath('בי"ח באדר ב\' תשנ"ה, 19/3/1995').hebrew, { yy: 5755, mm: months.ADAR_II, dd: 18 });
  assert.deepEqual(parseDeath('ב- 13/1/1978'), { greg: '1978-01-13', hebrew: null });
});

test('toPerson maps fields and keeps a consistent Hebrew date', () => {
  const p = toPerson(raw);
  assert.equal(p.gender, 'f');
  assert.equal(p.age, 40);
  assert.equal(p.hometown.he, 'חיפה');
  assert.equal(p.place.he, 'כביש 232');
  assert.equal(p.burial.he, 'חיפה');
  assert.deepEqual(p.hebrewDate, { yy: 5784, mm: months.TISHREI, dd: 22 });
});

test('after-sunset Hebrew date (next day) is kept', () => {
  const p = toPerson({ ...raw, death: 'בכ"ג בתשרי תשפ"ד, 7/10/2023' });
  assert.equal(p.hebrewDate.dd, 23);
});

test('inconsistent Hebrew date falls back to Gregorian', () => {
  const p = toPerson({ ...raw, death: 'בה\' בניסן תשפ"ד, 7/10/2023' });
  assert.equal(p.hebrewDate, undefined);
  assert.equal(p.dateMismatch, true);
});

test('years written with a final letter parse ("תש״ך")', () => {
  assert.deepEqual(parseDeath('בכ"ה בחשון תש"ך, 26/11/1959').hebrew, { yy: 5720, mm: months.CHESHVAN, dd: 25 });
});

test('an official Hebrew date one day earlier is kept', () => {
  const p = toPerson({ ...raw, death: 'בכ"א בתשרי תשפ"ד, 7/10/2023' });
  assert.equal(p.hebrewDate.dd, 21);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HDate, months } from '@hebcal/hdate';
import { deathHDate, yahrzeitIn, yahrzeitsOn, anniversaryNumber, prayerName, nextYahrzeit } from '../src/yahrzeit.js';

const p = (died, extra = {}) => ({ id: died, name: { he: 'פלוני', en: 'Ploni' }, died, ...extra });

test('7 Oct 2023 → 22 Tishrei; yahrzeit 5787 is 3 Oct 2026', () => {
  const x = p('2023-10-07');
  assert.equal(deathHDate(x).toString(), '22 Tishrei 5784');
  assert.equal(yahrzeitIn(x, 5787).greg().toDateString(), new Date(2026, 9, 3).toDateString());
});

test('death after sunset moves to the next Hebrew day', () => {
  assert.equal(deathHDate(p('2023-10-07', { afterSunset: true })).toString(), '23 Tishrei 5784');
});

test('explicit hebrewDate overrides Gregorian date', () => {
  const x = p('2000-01-01', { hebrewDate: { yy: 5760, mm: months.TEVET, dd: 1 } });
  assert.equal(deathHDate(x).toString(), '1 Tevet 5760');
});

test('Adar (non-leap) death → Adar I in a leap year (hebcal default)', () => {
  const x = p('2021-02-25'); // 13 Adar 5781
  assert.equal(yahrzeitIn(x, 5784).getMonth(), months.ADAR_I);
});

test('no yahrzeit in the year of death', () => {
  assert.equal(yahrzeitIn(p('2023-10-07'), 5784), undefined);
});

test('yahrzeitsOn filters by Hebrew date', () => {
  const people = [p('2023-10-07'), p('1973-10-06'), p('2006-07-12')];
  const hits = yahrzeitsOn(people, new HDate(22, months.TISHREI, 5787));
  assert.deepEqual(hits.map((x) => x.died), ['2023-10-07']);
});

test('anniversary number and next yahrzeit', () => {
  const x = p('2023-10-07');
  assert.equal(anniversaryNumber(x, 5787), 3);
  assert.equal(nextYahrzeit(x, new HDate(new Date(2026, 9, 16))).toString(), '22 Tishrei 5788');
});

test('prayer name uses ben/bat', () => {
  assert.equal(prayerName(p('2023-10-07', { father: { he: 'אלמוני' } }), 'he'), 'פלוני בן אלמוני');
  assert.equal(prayerName(p('2023-10-07', { gender: 'f', father: { en: 'Almoni' } }), 'en'), 'Ploni bat Almoni');
});

test('Sephardi custom moves a regular-year Adar death to Adar II', () => {
  const x = p('2021-02-25'); // 13 Adar 5781
  assert.equal(yahrzeitIn(x, 5784, 'II').toString(), '13 Adar II 5784');
  assert.equal(yahrzeitIn(x, 5785, 'II').toString(), '13 Adar 5785');
});

test('prayer name uses the official parents line when present', () => {
  assert.equal(prayerName(p('2023-10-07', { parents: 'בן אלמוני ופלונית' }), 'he'), 'פלוני בן אלמוני ופלונית');
});

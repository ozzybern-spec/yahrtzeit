// Yahrzeit logic. Pure functions, shared by the browser app and the tests.
import { HDate, yahrzeit } from '@hebcal/hdate';

/** Parse 'YYYY-MM-DD' as a local date (avoids UTC off-by-one). */
export function parseISO(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function toISO(date) {
  const p = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}

/**
 * Hebrew date of death. A death after sunset belongs to the next Hebrew day.
 * An explicit `hebrewDate` ({yy, mm, dd}) on the record wins over both.
 */
export function deathHDate(person) {
  if (person.hebrewDate) {
    const { yy, mm, dd } = person.hebrewDate;
    return new HDate(dd, mm, yy);
  }
  const hd = new HDate(parseISO(person.died));
  return person.afterSunset ? hd.next() : hd;
}

/** Yahrzeit (as HDate) of `person` in Hebrew year `hyear`, or undefined. */
export function yahrzeitIn(person, hyear) {
  return yahrzeit(hyear, deathHDate(person));
}

/** Everyone whose yahrzeit falls on Hebrew date `hd`. */
export function yahrzeitsOn(people, hd) {
  const hyear = hd.getFullYear();
  const abs = hd.abs();
  return people.filter((p) => yahrzeitIn(p, hyear)?.abs() === abs);
}

/** Next upcoming yahrzeit (HDate) on or after `hd`. */
export function nextYahrzeit(person, hd) {
  const y = hd.getFullYear();
  const thisYear = yahrzeitIn(person, y);
  if (thisYear && thisYear.abs() >= hd.abs()) return thisYear;
  return yahrzeitIn(person, y + 1);
}

/** Which anniversary this is (1st, 2nd, ...) in Hebrew year `hyear`. */
export function anniversaryNumber(person, hyear) {
  return hyear - deathHDate(person).getFullYear();
}

/** The name as used in prayer: "Ploni ben Ploni". */
export function prayerName(person, lang) {
  const n = person.name[lang] || person.name.he;
  const f = person.father?.[lang] || person.father?.he;
  if (!f) return n;
  const rel = lang === 'he'
    ? (person.gender === 'f' ? 'בת' : 'בן')
    : (person.gender === 'f' ? 'bat' : 'ben');
  return `${n} ${rel} ${f}`;
}

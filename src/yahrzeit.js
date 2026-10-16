// Yahrzeit logic. Pure functions, shared by the browser app and the tests.
import { HDate, yahrzeit, isLeapYear, months } from '@hebcal/hdate';

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

/**
 * Yahrzeit (as HDate) of `person` in Hebrew year `hyear`, or undefined.
 * `adar` is the custom for a death in Adar of a regular year when the
 * yahrzeit falls in a leap year: 'I' (Ashkenazi, hebcal default) or
 * 'II' (Sephardi, per the Shulhan Arukh).
 */
export function yahrzeitIn(person, hyear, adar = 'I') {
  const died = deathHDate(person);
  const y = yahrzeit(hyear, died);
  if (y && adar === 'II' && died.getMonth() === months.ADAR_I && !isLeapYear(died.getFullYear())
    && isLeapYear(hyear) && y.getMonth() === months.ADAR_I) {
    return new HDate(y.getDate(), months.ADAR_II, hyear);
  }
  return y;
}

/** Everyone whose yahrzeit falls on Hebrew date `hd`. */
export function yahrzeitsOn(people, hd, adar = 'I') {
  const hyear = hd.getFullYear();
  const abs = hd.abs();
  return people.filter((p) => yahrzeitIn(p, hyear, adar)?.abs() === abs);
}

/**
 * Index of yahrzeits for one Hebrew year: Map<absoluteDay, person[]>.
 * Lets the UI look up many days without rescanning every record.
 */
export function buildIndex(people, hyear, adar = 'I') {
  const index = new Map();
  for (const p of people) {
    const y = yahrzeitIn(p, hyear, adar);
    if (!y) continue;
    const abs = y.abs();
    if (!index.has(abs)) index.set(abs, []);
    index.get(abs).push(p);
  }
  return index;
}

/** Next upcoming yahrzeit (HDate) on or after `hd`. */
export function nextYahrzeit(person, hd, adar = 'I') {
  const y = hd.getFullYear();
  const thisYear = yahrzeitIn(person, y, adar);
  if (thisYear && thisYear.abs() >= hd.abs()) return thisYear;
  return yahrzeitIn(person, y + 1, adar);
}

/** Which anniversary this is (1st, 2nd, ...) in Hebrew year `hyear`. */
export function anniversaryNumber(person, hyear) {
  return hyear - deathHDate(person).getFullYear();
}

/** The name as used in prayer: "Ploni ben Ploni". */
export function prayerName(person, lang) {
  const n = person.name[lang] || person.name.he;
  if (person.parents) return `${n} ${person.parents}`;
  const f = person.father?.[lang] || person.father?.he;
  if (!f) return n;
  const rel = lang === 'he'
    ? (person.gender === 'f' ? 'בת' : 'בן')
    : (person.gender === 'f' ? 'bat' : 'ben');
  return `${n} ${rel} ${f}`;
}

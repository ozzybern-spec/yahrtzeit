// Generates clearly-labelled placeholder records (NOT real people) so the UI
// has something on every Hebrew calendar day. Run: npm run demo-data
import { writeFileSync } from 'node:fs';
import { HDate, months, isLeapYear, daysInMonth } from '@hebcal/hdate';
import { toISO } from '../src/yahrzeit.js';

let seed = 5787;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const pick = (a) => a[Math.floor(rand() * a.length)];
const int = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));

const towns = [
  ['ירושלים', 'Jerusalem'], ['תל אביב', 'Tel Aviv'], ['חיפה', 'Haifa'], ['באר שבע', 'Beersheba'],
  ['צפת', 'Safed'], ['אשדוד', 'Ashdod'], ['נתיבות', 'Netivot'], ['קריית שמונה', 'Kiryat Shmona'],
  ['מודיעין', "Modi'in"], ['רמת גן', 'Ramat Gan'], ['אילת', 'Eilat'], ['שדרות', 'Sderot'],
];

// Broad periods by Gregorian year, used only for the demo context line.
const eras = [
  [1947, 1949, 'מלחמת העצמאות', 'War of Independence'],
  [1950, 1966, 'פעולות ביטחון שוטף', 'Routine security operations'],
  [1967, 1967, 'מלחמת ששת הימים', 'Six-Day War'],
  [1968, 1972, 'מלחמת ההתשה ופעולות ביטחון', 'War of Attrition and security operations'],
  [1973, 1973, 'מלחמת יום הכיפורים', 'Yom Kippur War'],
  [1974, 1981, 'פעולות ביטחון שוטף', 'Routine security operations'],
  [1982, 2000, 'לבנון ופעולות ביטחון', 'Lebanon and security operations'],
  [2001, 2005, 'האינתיפאדה השנייה', 'Second Intifada'],
  [2006, 2006, 'מלחמת לבנון השנייה', 'Second Lebanon War'],
  [2007, 2022, 'פעולות ביטחון ומבצעים', 'Security operations'],
  [2023, 2025, 'מלחמת חרבות ברזל', 'Swords of Iron War'],
];
const eraFor = (y) => eras.find(([a, b]) => y >= a && y <= b);

const people = [];
let n = 0;
// Walk every day of a leap year so each Hebrew date (incl. Adar I/II) is covered.
for (let hd = new HDate(1, months.TISHREI, 5784); hd.getFullYear() === 5784; hd = hd.next()) {
  const copies = int(1, 3);
  for (let c = 0; c < copies; c++) {
    const yy = int(5708, 5785);
    let mm = hd.getMonth();
    if (!isLeapYear(yy) && mm === months.ADAR_II) mm = months.ADAR_I;
    const dd = Math.min(hd.getDate(), daysInMonth(mm, yy));
    const died = new HDate(dd, mm, yy).greg();
    const gy = died.getFullYear();
    const terror = rand() < 0.22;
    const gender = rand() < (terror ? 0.45 : 0.08) ? 'f' : 'm';
    const id = String(++n).padStart(4, '0');
    const [heTown, enTown] = pick(towns);
    const era = eraFor(gy);
    people.push({
      id: `demo-${id}`,
      category: terror ? 'terror' : 'soldier',
      name: { he: `שם לדוגמה ${id}`, en: `Sample Name ${id}` },
      father: { he: `אב לדוגמה`, en: `Sample Father` },
      gender,
      age: terror ? int(4, 86) : int(18, 48),
      died: toISO(died),
      hometown: { he: heTown, en: enTown },
      ...(terror ? {} : { rank: { he: 'סמל', en: 'Sergeant' } }),
      context: terror
        ? { he: 'פיגוע (נתון לדוגמה)', en: 'Terror attack (sample data)' }
        : { he: `${era[2]} (נתון לדוגמה)`, en: `${era[3]} (sample data)` },
    });
  }
}

const out = { demo: true, generated: toISO(new Date()), people };
writeFileSync(new URL('../data/fallen.json', import.meta.url), JSON.stringify(out));
console.log(`wrote ${people.length} demo records`);

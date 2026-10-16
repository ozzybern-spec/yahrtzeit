// Turn data/raw/laad.jsonl (from scrape-laad.mjs) into data/fallen.json.
// Usage: node scripts/build-laad.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { HDate, gematriyaStrToNum, months } from '@hebcal/hdate';
import { parseISO, toISO } from '../src/yahrzeit.js';

const MONTHS = {
  'תשרי': months.TISHREI, 'חשון': months.CHESHVAN, 'חשוון': months.CHESHVAN, 'מרחשון': months.CHESHVAN,
  'מרחשוון': months.CHESHVAN, 'כסלו': months.KISLEV, 'כסליו': months.KISLEV, 'טבת': months.TEVET,
  'שבט': months.SHVAT, 'אדר': months.ADAR_I, "אדר א'": months.ADAR_I, "אדר ב'": months.ADAR_II,
  'ניסן': months.NISAN, 'אייר': months.IYYAR, 'סיון': months.SIVAN, 'סיוון': months.SIVAN,
  'תמוז': months.TAMUZ, 'אב': months.AV, 'מנחם אב': months.AV, 'אלול': months.ELUL,
};

/** "בכ"ג בסיון תשפ"ה, 19/6/2025" → { greg: '2025-06-19', hebrew: {yy, mm, dd} | null } */
export function parseDeath(text) {
  const g = text.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!g) return null;
  const greg = toISO(new Date(+g[3], +g[2] - 1, +g[1]));
  const h = text.match(/^ב(\S+) ב(.+?) (\S+),/);
  let hebrew = null;
  if (h && MONTHS[h[2]] != null) {
    const dd = gematriyaStrToNum(h[1]);
    let yy = gematriyaStrToNum(h[3]);
    if (yy < 1000) yy += 5000;
    if (dd >= 1 && dd <= 30) hebrew = { yy, mm: MONTHS[h[2]], dd };
  }
  return { greg, hebrew };
}

const clean = (s, prefix) => s.replace(prefix, '').trim() || undefined;
const he = (s) => (s ? { he: s } : undefined);

export function toPerson(r) {
  const d = parseDeath(r.death);
  if (!d) return null;
  const female = r.parents.startsWith('בת') || /במותה|נולדה|חללת|התגוררה/.test(`${r.age} ${r.birth} ${r.cause} ${r.lived}`);
  const person = {
    id: `laad-${r.id}`,
    category: 'terror',
    name: { he: r.name },
    nick: r.nick || undefined,
    parents: r.parents || undefined,
    gender: female ? 'f' : 'm',
    age: Number(r.age.match(/\d+/)?.[0]) || undefined,
    died: d.greg,
    hometown: he(clean(r.lived, /^התגורר[הו]?\s*ב/)),
    place: he(clean(r.eventPlace, /^מקום אירוע:\s*/)),
    burial: he(clean(r.grave.split('\n')[0], /^הובא[הו]?\s+למנוחת עולמים\s*ב/)),
    source: `https://laad.btl.gov.il/Web/He/TerrorVictims/Page/Default.aspx?ID=${r.id}`,
  };
  // Keep the official Hebrew date only when it agrees with the Gregorian date
  // (same day, or the next day for a death after sunset).
  if (d.hebrew) {
    try {
      const diff = new HDate(d.hebrew.dd, d.hebrew.mm, d.hebrew.yy).abs() - new HDate(parseISO(d.greg)).abs();
      if (diff === 0 || diff === 1) person.hebrewDate = d.hebrew;
      else person.dateMismatch = true;
    } catch { /* invalid Hebrew date: fall back to Gregorian */ }
  }
  return person;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const lines = readFileSync(new URL('../data/raw/laad.jsonl', import.meta.url), 'utf8').split('\n').filter(Boolean);
  const people = [];
  let skipped = 0, mismatched = 0;
  for (const l of lines) {
    const p = toPerson(JSON.parse(l));
    if (!p) { skipped++; continue; }
    if (p.dateMismatch) { mismatched++; delete p.dateMismatch; }
    people.push(p);
  }
  people.sort((a, b) => a.died.localeCompare(b.died));
  writeFileSync(new URL('../data/fallen.json', import.meta.url),
    JSON.stringify({ demo: false, source: 'laad.btl.gov.il', generated: toISO(new Date()), people }));
  console.log(`wrote ${people.length} records (${skipped} without a usable date, ${mismatched} Hebrew/Gregorian mismatches using Gregorian)`);
}

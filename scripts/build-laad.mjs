// Turn data/raw/laad.jsonl (from scrape-laad.mjs) into data/fallen.json.
// Usage: node scripts/build-laad.mjs
import { existsSync, readFileSync } from 'node:fs';
import { HDate, gematriyaStrToNum, months } from '@hebcal/hdate';
import { parseISO, toISO } from '../src/yahrzeit.js';
import { shortPlace } from './place-names.mjs';

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
    // gematriyaStrToNum does not read final letters ("תש״ך"), so normalise them.
    const plain = (x) => x.replace(/ך/g, 'כ').replace(/ם/g, 'מ').replace(/ן/g, 'נ').replace(/ף/g, 'פ').replace(/ץ/g, 'צ');
    const dd = gematriyaStrToNum(plain(h[1]));
    let yy = gematriyaStrToNum(plain(h[3]));
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
    placeShort: he(shortPlace(clean(r.eventPlace, /^מקום אירוע:\s*/))),
    burial: he(clean(r.grave.split('\n')[0], /^הובא[הו]?\s+למנוחת עולמים\s*ב/)),
    source: `https://laad.btl.gov.il/Web/He/TerrorVictims/Page/Default.aspx?ID=${r.id}`,
    photo: r.photo ? `https://laad.btl.gov.il${r.photo}` : undefined,
    diedOfWounds: /^נפטר/.test(r.cause) || undefined,
    survivors: he(clean(r.bereaved || '', /^הותיר[הו]?:\s*/)),
    hasBio: Boolean(r.cv) || undefined,
  };
  // Keep the official Hebrew date when it is within a day of the Gregorian date
  // (after sunset it is the next day; a death at night is often recorded a day
  // apart); larger gaps are data errors, so fall back to the Gregorian date.
  if (d.hebrew) {
    try {
      const diff = new HDate(d.hebrew.dd, d.hebrew.mm, d.hebrew.yy).abs() - new HDate(parseISO(d.greg)).abs();
      if (Math.abs(diff) <= 1) person.hebrewDate = d.hebrew;
      else person.dateMismatch = true;
    } catch { /* invalid Hebrew date: fall back to Gregorian */ }
  }
  return person;
}

/** All civilian records from data/raw, as toPerson() objects plus `cv`. */
export function loadLaad() {
  const lines = readFileSync(new URL('../data/raw/laad.jsonl', import.meta.url), 'utf8').split('\n').filter(Boolean);
  // Biographies from scrape-laad-bio.mjs (newer crawls include them in laad.jsonl).
  const bioFile = new URL('../data/raw/laad-bio.jsonl', import.meta.url);
  const bios = new Map(existsSync(bioFile)
    ? readFileSync(bioFile, 'utf8').split('\n').filter(Boolean).map((l) => { const b = JSON.parse(l); return [b.id, b]; }) : []);
  const people = [];
  const review = [];
  const seen = new Set();
  for (const l of lines) {
    const r = { ...JSON.parse(l) };
    Object.assign(r, bios.get(r.id) && { cv: bios.get(r.id).cv, bereaved: bios.get(r.id).bereaved });
    if (seen.has(r.id)) continue; // a restarted crawl can record an ID twice
    seen.add(r.id);
    const p = toPerson(r);
    if (!p) { review.push(`no usable date | ${r.id} | ${r.name} | ${r.death}`); continue; }
    if (p.dateMismatch) { review.push(`Hebrew/Gregorian mismatch | ${r.id} | ${r.name} | ${r.death}`); delete p.dateMismatch; }
    p.cv = r.cv || '';
    people.push(p);
  }
  return { people, review };
}

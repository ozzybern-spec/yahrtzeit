// Build the app's data from both official sources:
//   data/raw/laad.jsonl  (+ laad-bio.jsonl)  civilian victims of terror
//   data/raw/izkor.jsonl                     fallen soldiers and security personnel
//
// Output:
//   data/index.json          compact list for the daily view and search
//   data/people/<id>.json    details and biography, loaded when a person is opened
//   data/needs-review.txt    records whose official dates disagree or are partial
//
// Usage: node scripts/build-data.mjs
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { HDate } from '@hebcal/hdate';
import { parseISO, toISO } from '../src/yahrzeit.js';
import { loadLaad, parseDeath } from './build-laad.mjs';
import { englishMaps, englishName, englishPlace } from './english.mjs';

const root = new URL('../data/', import.meta.url);
const titleCase = (s) => (s ? s.toLowerCase().replace(/(^|[\s-])\p{L}/gu, (c) => c.toUpperCase()) : s);
const hebrewArr = (h) => (h ? [h.yy, h.mm, h.dd] : undefined);

/** "6-6-1967" → "1967-06-06" */
function isoFromDmy(s) {
  const m = s?.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  return m ? toISO(new Date(+m[3], +m[2] - 1, +m[1])) : null;
}

/** Check an official Hebrew date against the Gregorian one: within a day either way (see build-laad.mjs). */
function consistent(h, iso) {
  try {
    const diff = new HDate(h.dd, h.mm, h.yy).abs() - new HDate(parseISO(iso)).abs();
    return Math.abs(diff) <= 1;
  } catch { return false; }
}

export function toSoldier(r) {
  const died = isoFromDmy(r.death_date);
  if (!died) return null;
  // Reuse the civilian parser: it expects "ב<day> ב<month> <year>, d/m/yyyy".
  const parsed = parseDeath(`ב${r.jewish_death_date.replace(/\s+/g, ' ')}, ${died.split('-').reverse().join('/')}`);
  const hebrew = parsed?.hebrew && consistent(parsed.hebrew, died) ? parsed.hebrew : null;
  const en = r.en || {};
  return {
    id: `izkor-${r.legacy_id}`,
    category: 'soldier',
    name: { he: r.full_name, en: en.full_name || undefined },
    gender: r.gender === 'נ' ? 'f' : 'm',
    age: Number(r.age) || undefined,
    died,
    hebrewDate: hebrew || undefined,
    dateMismatch: Boolean(parsed?.hebrew && !hebrew),
    rank: r.rank ? { he: r.rank, en: en.rank || undefined } : undefined,
    unit: r.unit ? { he: r.unit, en: en.unit || undefined } : undefined,
    hometown: r.birth_city ? { he: r.birth_city, en: titleCase(en.birth_city) || undefined } : undefined,
    burial: r.cemetery_name ? { he: r.cemetery_name } : undefined,
    parents: r.parents_label || undefined,
    parentsEn: en.parents_label || undefined,
    mia: r.is_mia || undefined,
    photo: r.has_image ? `https://www.izkor.gov.il/assets/person/images/${String(r.legacy_id).padStart(6, '0')}.jpg` : undefined,
    source: `https://www.izkor.gov.il/x/${r.person_id}`,
    cv: r.life_story || '',
    rawDeath: `${r.jewish_death_date}, ${r.death_date}`,
  };
}

function readIzkorRaw() {
  const file = new URL('raw/izkor.jsonl', root);
  return existsSync(file) ? readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
}

function loadIzkor(raw) {
  const people = [];
  const review = [];
  const seen = new Set();
  for (const r of raw) {
    if (seen.has(r.legacy_id)) continue;
    seen.add(r.legacy_id);
    const p = toSoldier(r);
    if (!p) { review.push(`no usable date | izkor-${r.legacy_id} | ${r.full_name} | ${r.death_date}`); continue; }
    if (p.dateMismatch) review.push(`Hebrew/Gregorian mismatch | ${p.id} | ${r.full_name} | ${p.rawDeath}`);
    delete p.dateMismatch;
    delete p.rawDeath;
    people.push(p);
  }
  return { people, review };
}

const LAAD_PHOTO = 'https://laad.btl.gov.il';

/** Compact index entry; the app expands it back (see expand() in src/app.js). */
function indexEntry(p) {
  const o = { i: p.id, c: p.category, n: p.name.he, d: p.died };
  if (p.name.en) o.e = p.name.en;
  if (p.gender === 'f') o.g = 'f';
  if (p.age) o.a = p.age;
  if (p.hebrewDate) o.h = hebrewArr(p.hebrewDate);
  if (p.placeShort?.he || p.place?.he) o.l = p.placeShort?.he || p.place.he;
  if (p.placeEn) o.le = p.placeEn;
  if (p.rank?.he) o.r = p.rank.he;
  if (p.rank?.en) o.re = p.rank.en;
  if (p.unit?.he) o.u = p.unit.he;
  if (p.unit?.en) o.ue = p.unit.en;
  if (p.hometown?.he) o.t = p.hometown.he;
  if (p.hometown?.en) o.te = p.hometown.en;
  if (p.photo) o.f = p.photo.startsWith(LAAD_PHOTO) ? p.photo.slice(LAAD_PHOTO.length) : 1;
  if (p.cv) o.b = 1;
  return o;
}

function details(p) {
  const keys = ['parents', 'parentsEn', 'place', 'burial', 'survivors', 'diedOfWounds', 'mia', 'source', 'cv'];
  return Object.fromEntries(keys.filter((k) => p[k]).map((k) => [k, p[k]]));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const laad = loadLaad();
  const raw = readIzkorRaw();
  const izkor = loadIzkor(raw);
  const people = [...laad.people, ...izkor.people].sort((a, b) => a.died.localeCompare(b.died));

  // Fill English where the sources have none (official spellings first; see english.mjs).
  const maps = englishMaps(raw);
  const missingEn = { name: 0, place: 0 };
  for (const p of people) {
    p.name.en ||= englishName(p.name.he, maps);
    if (!p.name.en) missingEn.name++;
    if (p.hometown?.he) p.hometown.en ||= englishPlace(p.hometown.he, maps);
    const place = p.placeShort?.he || p.place?.he;
    if (place) {
      p.placeEn = englishPlace(place, maps);
      if (!p.placeEn) missingEn.place++;
    }
    if (p.unit?.he) p.unit.en ||= maps.units.get(p.unit.he);
    if (p.rank?.he) p.rank.en ||= maps.ranks.get(p.rank.he);
    if (p.burial?.he) p.burial.en ||= maps.burials.get(p.burial.he.trim());
    if (p.survivors?.he) {
      // A few official lines contain a line break; translate the parts and join them.
      p.survivors.en ||= maps.survivors.get(p.survivors.he) || p.survivors.he.split('\n')
        .map((part, i) => { const en = maps.survivors.get(part.trim()); return en && (i ? en[0].toLowerCase() + en.slice(1) : en); })
        .reduce((acc, x) => (acc === undefined || x === undefined ? undefined : `${acc} ${x}`.trim()), '') || undefined;
    }
  }

  const peopleDir = new URL('people/', root);
  rmSync(peopleDir, { recursive: true, force: true });
  mkdirSync(peopleDir, { recursive: true });
  for (const p of people) writeFileSync(new URL(`${p.id}.json`, peopleDir), JSON.stringify(details(p)));

  writeFileSync(new URL('index.json', root), JSON.stringify({
    generated: toISO(new Date()),
    sources: ['laad.btl.gov.il', 'izkor.gov.il'],
    people: people.map(indexEntry),
  }));
  writeFileSync(new URL('needs-review.txt', root), [...laad.review, ...izkor.review].sort().join('\n') + '\n');

  // Old single-file layout, replaced by index.json + people/.
  rmSync(new URL('fallen.json', root), { force: true });
  rmSync(new URL('bio/', root), { recursive: true, force: true });

  console.log(`civilians: ${laad.people.length}, security forces: ${izkor.people.length}, total: ${people.length}`);
  console.log(`needs review: ${laad.review.length + izkor.review.length}`);
  const noEn = (k) => people.filter((p) => p[k]?.he && !p[k].en).length;
  console.log(`without English: ${missingEn.name} names, ${missingEn.place} places of attack, ${noEn('burial')} burial places, ${noEn('survivors')} survivor lines`);
}


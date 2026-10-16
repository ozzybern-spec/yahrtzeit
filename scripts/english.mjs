// English for names and places. Official spellings come first: about 24,500
// izkor.gov.il records give Hebrew/English pairs for names, towns, units and
// ranks. Anything left is filled from data/en/names.json and data/en/places.json
// (transliterated; edit those files to correct a spelling).
import { existsSync, readFileSync } from 'node:fs';

const readJson = (url) => (existsSync(url) ? JSON.parse(readFileSync(url, 'utf8')) : {});
const words = (s) => s.replace(/[()]/g, ' ').split(/\s+/).filter(Boolean);
const titleCase = (s) => s.toLowerCase().replace(/(^|[\s'-])\p{L}/gu, (c) => c.toUpperCase());

/** Most common English value for each Hebrew key. */
function majority(pairs) {
  const counts = new Map();
  for (const [he, en] of pairs) {
    if (!counts.has(he)) counts.set(he, new Map());
    const c = counts.get(he);
    c.set(en, (c.get(en) || 0) + 1);
  }
  return new Map([...counts].map(([he, c]) => [he, [...c].sort((a, b) => b[1] - a[1])[0][0]]));
}

export function englishMaps(izkorRaw) {
  const nameWords = [];
  const towns = [];
  const units = [];
  const ranks = [];
  for (const r of izkorRaw) {
    const en = r.en || {};
    if (en.full_name) {
      const he = words(r.full_name);
      const ee = words(en.full_name);
      if (he.length === ee.length) he.forEach((w, i) => nameWords.push([w, ee[i]]));
    }
    if (r.birth_city && en.birth_city) towns.push([r.birth_city, titleCase(en.birth_city)]);
    if (r.unit && en.unit) units.push([r.unit, en.unit]);
    if (r.rank && en.rank) ranks.push([r.rank, en.rank]);
  }
  const manualNames = readJson(new URL('../data/en/names.json', import.meta.url));
  const manualPlaces = readJson(new URL('../data/en/places.json', import.meta.url));
  return {
    words: new Map([...Object.entries(manualNames), ...majority(nameWords)]),
    places: new Map([...Object.entries(manualPlaces), ...majority(towns)]),
    units: majority(units),
    ranks: majority(ranks),
  };
}

/** "דודי (דוד) תורג'מן" → "Dudi (David) Turgeman"; undefined if any word is unknown. */
export function englishName(he, maps) {
  if (!he) return undefined;
  let missing = false;
  const out = he.replace(/[^\s()]+/g, (w) => {
    const en = maps.words.get(w);
    if (!en) missing = true;
    return en || w;
  });
  return missing ? undefined : out;
}

export const englishPlace = (he, maps) => (he ? maps.places.get(he) : undefined);

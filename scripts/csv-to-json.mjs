// Convert a CSV of real records into data/fallen.json.
// Usage: node scripts/csv-to-json.mjs path/to/records.csv
//
// Columns (header row required; only id, category, name_he, died are mandatory):
//   id, category (soldier|terror), name_he, name_en, father_he, father_en,
//   gender (m|f), age, died (YYYY-MM-DD), after_sunset (1|0),
//   hometown_he, hometown_en, place_he, place_en, rank_he, rank_en,
//   unit_he, unit_en, context_he, context_en, source_url
import { readFileSync, writeFileSync } from 'node:fs';
import { toISO } from '../src/yahrzeit.js';

function parseCSV(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += ch;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((f) => f.trim()));
}

const pair = (r, k) => (r[`${k}_he`] || r[`${k}_en`]
  ? { he: r[`${k}_he`] || r[`${k}_en`], en: r[`${k}_en`] || r[`${k}_he`] }
  : undefined);

const file = process.argv[2];
if (!file) { console.error('usage: node scripts/csv-to-json.mjs records.csv'); process.exit(1); }

const [header, ...lines] = parseCSV(readFileSync(file, 'utf8').replace(/^﻿/, ''));
const keys = header.map((h) => h.trim());
const errors = [];
const people = lines.map((cells, i) => {
  const r = Object.fromEntries(keys.map((k, j) => [k, (cells[j] ?? '').trim()]));
  if (!r.id || !r.name_he || !/^\d{4}-\d{2}-\d{2}$/.test(r.died) || !['soldier', 'terror'].includes(r.category)) {
    errors.push(`row ${i + 2}: needs id, name_he, category (soldier|terror), died (YYYY-MM-DD)`);
  }
  return {
    id: r.id,
    category: r.category,
    name: pair(r, 'name'),
    father: pair(r, 'father'),
    gender: r.gender === 'f' ? 'f' : 'm',
    age: r.age ? Number(r.age) : undefined,
    died: r.died,
    afterSunset: r.after_sunset === '1' || undefined,
    hometown: pair(r, 'hometown'),
    place: pair(r, 'place'),
    rank: pair(r, 'rank'),
    unit: pair(r, 'unit'),
    context: pair(r, 'context'),
    source: r.source_url || undefined,
  };
});

if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
writeFileSync(new URL('../data/fallen.json', import.meta.url),
  JSON.stringify({ demo: false, generated: toISO(new Date()), people }));
console.log(`wrote ${people.length} records`);

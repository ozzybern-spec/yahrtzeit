// Crawl the Ministry of Defense memorial site (izkor.gov.il) for fallen
// soldiers and security personnel. Person pages are listed in the sitemap;
// each page embeds the person's record as Astro component props.
//
// Usage: NODE_USE_ENV_PROXY=1 node scripts/scrape-izkor.mjs [concurrency] [shard] [shards]
// Output: data/raw/izkor.jsonl (one record per line; reruns skip IDs already done)
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';

const [conc = 4, shard = 0, shards = 1] = process.argv.slice(2).map(Number);
const SITE = 'https://www.izkor.gov.il';
const dir = new URL('../data/raw/', import.meta.url);
const out = new URL('izkor.jsonl', dir);
mkdirSync(dir, { recursive: true });

const unescape = (s) => s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

/** Astro serialises props as [type, value] pairs; 0 = plain/object, 1 = array. */
function decode(v) {
  if (Array.isArray(v) && v.length === 2 && Number.isInteger(v[0])) {
    const [t, x] = v;
    if (t === 0) return x && typeof x === 'object' ? Object.fromEntries(Object.entries(x).map(([k, y]) => [k, decode(y)])) : x;
    if (t === 1) return x.map(decode);
    return x;
  }
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, y]) => [k, decode(y)]));
  return v;
}

/** Merge every `person` object embedded in the page. */
export function personFrom(html) {
  const merged = {};
  for (const m of html.matchAll(/<astro-island[^>]*props="([^"]*)"/g)) {
    let d;
    try { d = decode(JSON.parse(unescape(m[1]))); } catch { continue; }
    if (d?.person && typeof d.person === 'object') Object.assign(merged, d.person);
    if (d?.data?.person && typeof d.data.person === 'object') Object.assign(merged, d.data.person);
  }
  return merged.person_id ? merged : null;
}

const trim = (s) => (typeof s === 'string' ? s.replace(/\s+/g, ' ').trim() : s ?? '');
const KEEP = ['person_id', 'legacy_id', 'full_name', 'first_name', 'last_name', 'alternate_name', 'rank', 'unit',
  'service_org', 'service_type', 'gender', 'age', 'father_name', 'mother_name', 'parents_label',
  'jewish_death_date', 'death_date', 'birth_city', 'cemetery_name', 'is_mia', 'is_kidnapped', 'has_image', 'religion'];

export function pick(p) {
  const rec = Object.fromEntries(KEEP.map((k) => [k, trim(p[k])]));
  rec.life_story = (p.life_story || '').trim();
  return rec;
}

export async function get(url, tries = 4) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 (israeli-yahrtzeit memorial project)' } });
      if (r.ok) return await r.text();
      if (r.status === 404) return '';
    } catch { /* retry */ }
    await new Promise((res) => setTimeout(res, 2000 * 2 ** i));
  }
  throw new Error(`failed ${url}`);
}

async function sitemapUrls() {
  const index = await get(`${SITE}/sitemap-index.xml`);
  const maps = [...index.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  const urls = [];
  for (const m of maps) urls.push(...[...(await get(m)).matchAll(/<loc>([^<]+)<\/loc>/g)].map((x) => x[1]));
  return urls;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const done = new Set(existsSync(out)
    ? readFileSync(out, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l).person_id) : []);
  const urls = await sitemapUrls();
  const english = new Set(urls.filter((u) => u.includes('/en/fallen/')).map((u) => u.split('/').pop()));
  const hebrew = urls.filter((u) => /\/en_[0-9a-f]+$/.test(u) && !u.includes('/en/') && !u.includes('/monument/'));
  const queue = hebrew.filter((u, i) => i % shards === shard && !done.has(u.split('/').pop()));
  console.log(`${hebrew.length} people in sitemap; shard ${shard}/${shards}: ${queue.length} to fetch`);

  let n = 0, found = 0, failed = 0;
  async function worker() {
    while (queue.length) {
      const url = queue.shift();
      const id = url.split('/').pop();
      try {
        const he = personFrom(await get(url));
        if (!he) { failed++; console.error(`no record ${url}`); continue; }
        const rec = pick(he);
        if (english.has(id)) {
          const en = personFrom(await get(`${SITE}/en/fallen/x/${id}`));
          if (en) rec.en = { full_name: trim(en.full_name), rank: trim(en.rank), unit: trim(en.unit), birth_city: trim(en.birth_city), parents_label: trim(en.parents_label) };
        }
        appendFileSync(out, JSON.stringify(rec) + '\n');
        found++;
      } catch (e) { failed++; console.error(e.message); }
      if (++n % 500 === 0) console.log(`${n} checked, ${found} saved, ${failed} failed`);
    }
  }
  await Promise.all(Array.from({ length: conc }, worker));
  console.log(`done: ${n} checked, ${found} saved, ${failed} failed`);
}

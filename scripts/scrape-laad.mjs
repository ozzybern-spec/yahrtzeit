// Crawl the National Insurance Institute memorial site (laad.btl.gov.il) for
// civilian victims of terror. The site's list view pages by POST, which its
// firewall blocks outside Israel, so this walks the per-person pages by ID.
//
// Usage: NODE_USE_ENV_PROXY=1 node scripts/scrape-laad.mjs [fromId] [toId] [concurrency]
// Output: data/raw/laad.jsonl (one record per line; reruns skip IDs already done)
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';

const [from = 30000, to = 48000, conc = 6] = process.argv.slice(2).map(Number);
const dir = new URL('../data/raw/', import.meta.url);
const out = new URL('laad.jsonl', dir);
const missFile = new URL('laad-empty.txt', dir);
mkdirSync(dir, { recursive: true });

const done = new Set();
if (existsSync(out)) for (const l of readFileSync(out, 'utf8').split('\n')) if (l) done.add(JSON.parse(l).id);
if (existsSync(missFile)) for (const l of readFileSync(missFile, 'utf8').split('\n')) if (l) done.add(Number(l));

const decode = (s) => s
  .replace(/<br\s*\/?>|<\/br>/gi, '\n')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
  .replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').trim();

export function span(html, id) {
  const m = html.match(new RegExp(`<span id="${id}"[^>]*>([\\s\\S]*?)</span>\\s*</(?:dd|div|h1|p|figcaption)`));
  return m ? decode(m[1]) : '';
}

/** Biography and survivors, which live on the same page. */
export function bio(html) {
  const cv = html.match(/<span id="lblCV">([\s\S]*?)<\/span>\s*<\/p>/);
  return {
    cv: cv ? decode(cv[1].replace(/<\/p>\s*<p[^>]*>/gi, '\n\n')) : '',
    bereaved: span(html, 'lblBereaved'),
  };
}

export function parse(html, id) {
  const nameRaw = html.match(/<span id="lblName">([\s\S]*?)<\/span>\s*<\/h1>/);
  if (!nameRaw) return null;
  const death = span(html, 'lblDeathDate');
  if (!death) return null;
  const nick = nameRaw[1].match(/<span class='smallCaption'>([^<]*)<\/span>/)?.[1].trim() || '';
  const name = decode(nameRaw[1]
    .replace(/<span class='mediumCaption'>[\s\S]*?<\/span>/, '')
    .replace(/<span class='smallCaption'>[\s\S]*?<\/span>/, ''));
  const img = html.match(/<img id="imgVictim" src="([^"]+)"/)?.[1] || '';
  return {
    id,
    name,
    nick,
    age: span(html, 'lblAge'),
    parents: span(html, 'lblParents'),
    birthPlace: span(html, 'lblBirthPlace'),
    birth: span(html, 'lblBirthDate'),
    lived: span(html, 'lblLivingPlace'),
    cause: span(html, 'lblDeathCause'),
    death,
    eventPlace: span(html, 'lblEventPlace'),
    eventDate: span(html, 'lblEventDate'),
    backDate: span(html, 'lblBackDate'),
    region: span(html, 'lblRegion'),
    grave: span(html, 'lblGravePlace'),
    photo: img.includes('nopic') ? '' : img,
    ...bio(html),
  };
}

export async function get(id, tries = 4) {
  const url = `https://laad.btl.gov.il/Web/He/TerrorVictims/Page/Default.aspx?ID=${id}`;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 (israeli-yahrtzeit memorial project)' } });
      if (r.ok) return await r.text();
      if (r.status === 404) return '';
    } catch { /* retry */ }
    await new Promise((res) => setTimeout(res, 2000 * 2 ** i));
  }
  throw new Error(`failed ${id}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const queue = [];
  for (let id = from; id <= to; id++) if (!done.has(id)) queue.push(id);
  console.log(`${queue.length} IDs to fetch (${done.size} already done)`);
  let found = 0, n = 0, failed = 0;
  async function worker() {
    while (queue.length) {
      const id = queue.shift();
      try {
        const rec = parse(await get(id), id);
        if (rec) { appendFileSync(out, JSON.stringify(rec) + '\n'); found++; }
        else appendFileSync(missFile, id + '\n');
      } catch (e) { failed++; console.error(e.message); }
      if (++n % 500 === 0) console.log(`${n} checked, ${found} found, ${failed} failed`);
    }
  }
  await Promise.all(Array.from({ length: conc }, worker));
  console.log(`done: ${n} checked, ${found} found, ${failed} failed`);
}

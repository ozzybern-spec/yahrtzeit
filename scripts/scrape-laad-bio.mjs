// Re-fetch the pages of people already in data/raw/laad.jsonl to collect
// their biography and survivors (older crawls did not save them).
// Usage: NODE_USE_ENV_PROXY=1 node scripts/scrape-laad-bio.mjs [concurrency]
// Output: data/raw/laad-bio.jsonl (reruns skip IDs already done)
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { bio, get } from './scrape-laad.mjs';

const conc = Number(process.argv[2] || 8);
const raw = new URL('../data/raw/laad.jsonl', import.meta.url);
const out = new URL('../data/raw/laad-bio.jsonl', import.meta.url);
const done = new Set(existsSync(out)
  ? readFileSync(out, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l).id) : []);
const queue = [...new Set(readFileSync(raw, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l).id))]
  .filter((id) => !done.has(id));

console.log(`${queue.length} pages to fetch (${done.size} already done)`);
let n = 0, failed = 0;
async function worker() {
  while (queue.length) {
    const id = queue.shift();
    try {
      appendFileSync(out, JSON.stringify({ id, ...bio(await get(id)) }) + '\n');
    } catch (e) { failed++; console.error(e.message); }
    if (++n % 500 === 0) console.log(`${n} fetched, ${failed} failed`);
  }
}
await Promise.all(Array.from({ length: conc }, worker));
console.log(`done: ${n} fetched, ${failed} failed`);

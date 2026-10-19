// Translate the Hebrew biographies into English once, with Claude Haiku 5.5
// through the Message Batches API (half price). Needs ANTHROPIC_API_KEY.
//
//   node scripts/translate-bios.mjs sample [n]   translate n biographies now (default 20) → data/raw/bio-sample.md
//   node scripts/translate-bios.mjs submit       one batch with every biography not yet in data/en/bios.jsonl
//   node scripts/translate-bios.mjs status       progress of the submitted batch
//   node scripts/translate-bios.mjs collect      save finished translations to data/en/bios.jsonl and data/people/<id>.json
//
// data/en/bios.jsonl ({id, en}) is the source of truth (build-data.mjs merges it on a full
// rebuild); rerunning submit only sends what's missing. Bump the version (npm run bump) to publish.
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import Anthropic from '@anthropic-ai/sdk';

const MODEL = 'claude-haiku-5-5';
const root = new URL('../data/', import.meta.url);
const outFile = new URL('en/bios.jsonl', root);
// Committed, so a later session can check on or collect a batch it didn't submit.
const batchFile = new URL('en/translate-batch.json', root);

const SYSTEM = `You translate Hebrew memorial biographies of Israelis killed in wars and terror attacks into English for a memorial website.

Rules:
- Translate the whole text faithfully and completely. Do not summarize, add, or comment.
- Keep the paragraph breaks (blank lines) as in the original.
- Tone: respectful, plain, factual English. Keep the family's warmth where it is in the original.
- Names: use the English spellings given in the "Known names" section for the person and their family. Transliterate other names the way Israeli official English records do (e.g. Yosef, Moshe, Cohen, Tzvi).
- Hebrew dates: write them as day, month, year, e.g. ד' בניסן תש"ד → 4 Nisan 5704. Keep any Gregorian date that follows, written as e.g. 28 March 1944.
- Keep Hebrew terms with no good English equivalent transliterated, with a short gloss the first time (e.g. Palmach, the pre-state strike force).
- Output only the English translation.`;

function knownNames(id, index) {
  const p = index.get(id) || {};
  const lines = [];
  if (p.n) lines.push(`${p.n} = ${p.e || '(transliterate)'}`);
  return lines;
}

/** Biographies from the built data, with the facts the prompt needs. */
function loadWork() {
  const index = new Map(JSON.parse(readFileSync(new URL('index.json', root), 'utf8')).people.map((p) => [p.i, p]));
  const done = new Set(existsSync(outFile)
    ? readFileSync(outFile, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l).id) : []);
  const work = [];
  for (const file of readdirSync(new URL('people/', root))) {
    const id = file.slice(0, -5);
    if (done.has(id)) continue;
    const d = JSON.parse(readFileSync(new URL(`people/${file}`, root), 'utf8'));
    if (!d.cv) continue;
    const names = knownNames(id, index);
    if (d.parents && d.parentsEn) names.push(`${d.parents} = ${d.parentsEn}`);
    work.push({ id, cv: d.cv, names });
  }
  return { work, done };
}

function params({ cv, names }) {
  return {
    model: MODEL,
    max_tokens: 16000,
    // Plain translation: no extended reasoning needed, which also keeps cost down.
    thinking: { type: 'disabled' },
    output_config: { effort: 'low' },
    system: SYSTEM,
    messages: [{
      role: 'user',
      content: `Known names:\n${names.join('\n') || '(none)'}\n\nBiography:\n${cv}`,
    }],
  };
}

const textOf = (message) => message.content.filter((b) => b.type === 'text').map((b) => b.text).join('').trim();

const client = new Anthropic();
const [cmd = 'sample', arg] = process.argv.slice(2);

if (cmd === 'sample') {
  const n = Number(arg) || 20;
  const { work } = loadWork();
  // Spread the sample across the whole list (different eras and sources).
  const step = Math.max(1, Math.floor(work.length / n));
  const picks = work.filter((_, i) => i % step === 0).slice(0, n);
  let md = `# Translation sample (${MODEL})\n\n`;
  let usage = { input: 0, output: 0 };
  for (const w of picks) {
    const msg = await client.messages.create(params(w));
    usage.input += msg.usage.input_tokens;
    usage.output += msg.usage.output_tokens;
    if (msg.stop_reason === 'refusal') { md += `## ${w.id}\n\n(refused)\n\n`; continue; }
    md += `## ${w.id}\n\n### Hebrew\n\n${w.cv}\n\n### English\n\n${textOf(msg)}\n\n`;
    process.stdout.write('.');
  }
  // data/raw/ is gitignored, so a fresh checkout doesn't have it.
  mkdirSync(new URL('raw/', root), { recursive: true });
  writeFileSync(new URL('raw/bio-sample.md', root), md);
  // Haiku 5.5: $0.10 / $0.50 per million tokens; the batch API halves that.
  const perBio = (usage.input * 0.10 + usage.output * 0.50) / 1e6 / picks.length / 2;
  const total = loadWork().work.length;
  console.log(`\nwrote data/raw/bio-sample.md (${picks.length} biographies)`);
  console.log(`tokens: ${usage.input} in, ${usage.output} out; estimated full batch: $${(perBio * total).toFixed(2)} for ${total}`);
} else if (cmd === 'submit') {
  if (existsSync(batchFile)) {
    console.error('A batch is already recorded in data/en/translate-batch.json; run status/collect first.');
    process.exit(1);
  }
  const { work } = loadWork();
  if (!work.length) { console.log('nothing to translate'); process.exit(0); }
  const batch = await client.messages.batches.create({
    requests: work.map((w) => ({ custom_id: w.id, params: params(w) })),
  });
  writeFileSync(batchFile, JSON.stringify({ id: batch.id, count: work.length, created: new Date().toISOString() }));
  console.log(`submitted ${work.length} biographies as batch ${batch.id}`);
} else if (cmd === 'status') {
  const { id } = JSON.parse(readFileSync(batchFile, 'utf8'));
  const b = await client.messages.batches.retrieve(id);
  console.log(b.processing_status, JSON.stringify(b.request_counts));
} else if (cmd === 'collect') {
  const { id } = JSON.parse(readFileSync(batchFile, 'utf8'));
  const b = await client.messages.batches.retrieve(id);
  if (b.processing_status !== 'ended') { console.log(`not finished: ${b.processing_status}`); process.exit(0); }
  const { done } = loadWork();
  let ok = 0, failed = 0;
  for await (const r of await client.messages.batches.results(id)) {
    if (done.has(r.custom_id)) continue;
    if (r.result.type === 'succeeded' && r.result.message.stop_reason !== 'refusal' && r.result.message.stop_reason !== 'max_tokens') {
      const en = textOf(r.result.message);
      appendFileSync(outFile, JSON.stringify({ id: r.custom_id, en }) + '\n');
      // Also write it into the published file, so no full rebuild (which needs data/raw) is required.
      const file = new URL(`people/${r.custom_id}.json`, root);
      writeFileSync(file, JSON.stringify({ ...JSON.parse(readFileSync(file, 'utf8')), cvEn: en }));
      ok++;
    } else {
      failed++;
    }
  }
  renameSync(batchFile, new URL(`en/translate-batch-${id}.json`, root));
  console.log(`collected ${ok}; ${failed} failed (run submit again to retry them)`);
} else {
  console.error('usage: translate-bios.mjs sample [n] | submit | status | collect');
  process.exit(1);
}

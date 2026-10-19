// Translate the Hebrew biographies into English once, with Claude Haiku 5.5
// through the Message Batches API (half price). Needs an API key from console.anthropic.com in
// YIZKOR_API_KEY (cloud sessions don't pass a variable named ANTHROPIC_API_KEY through) or ANTHROPIC_API_KEY.
//
//   node scripts/translate-bios.mjs sample [n]   translate n biographies now (default 20) → data/raw/bio-sample.md
//   node scripts/translate-bios.mjs submit       every biography not yet in data/en/bios.jsonl, in batches of BATCH_SIZE
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
const BATCH_SIZE = 8000;
// {batches: [{id, count}]}; older files hold a single {id, count}.
const recordedBatches = () => {
  const rec = JSON.parse(readFileSync(batchFile, 'utf8'));
  return rec.batches || [rec];
};

const SYSTEM = `You translate Hebrew memorial biographies of Israelis killed in wars and terror attacks into English for a memorial website.

Rules:
- Translate the whole text faithfully and completely. Do not summarize, add, or comment.
- Keep the paragraph breaks (blank lines) as in the original.
- Tone: respectful, plain, factual English. Keep the family's warmth where it is in the original.
- Names: use the English spellings given in the request ("Name", "Parents") for the person and their family. Transliterate other names the way Israeli official English records do (e.g. Yosef, Moshe, Cohen, Tzvi). Nicknames that are English or European names take their usual spelling (דבי → Debbie, ג'ק → Jack).
- Hebrew dates: write them as day, month, year, e.g. ד' בניסן תש"ד → 4 Nisan 5704. Keep any Gregorian date that follows, written as e.g. 28 March 1944.
- Keep Hebrew terms with no good English equivalent transliterated, with a short gloss the first time (e.g. Palmach, the pre-state strike force).
- Names of movements, organizations, units and institutions are proper names: transliterate them, never translate them word by word. Use the spellings in the organization list below; gloss the first mention briefly if the reader needs it. E.g. "הבונים" → Habonim (not "the Builders"); "בית החלוץ" → Beit HeHalutz (not "Halutz House").
- The translation's first words are always the person's English name, given in the request as "Start with", built into a natural first sentence, e.g. "Lotan Itzhaki, son of Hana and Yosef, was born …" (Hebrew often opens with no subject: "בנם של חנה ויוסף, נולד…"). Never begin with "Son of" or "Daughter of", never split the parents off into a sentence of their own, and never leave a sentence without a subject; later, use "he"/"she" or the first name.
- Never add notes, comments, corrections, questions or remarks of your own, about the text, the names or these instructions, in any form (no "Note:", no bracketed notes, no "Wait", "Hmm" or "Actually"). Never repeat the request's fields. Where something is unclear, take the most likely reading and continue silently.
- Ranks: use the English rank from the rank list below, with no Hebrew in parentheses. Ranks of foreign armies (e.g. the British Army in World War II) are already English: write Corporal, Sergeant, etc.

IDF ranks (Hebrew → English):
טוראי → Private; טוראי ראשון → Private First Class; רב-טוראי / רב טוראי / רבט"ר → Corporal; סמל → Sergeant; סמל ראשון / סמ"ר → Staff Sergeant; רב-סמל / רס"ל → Sergeant First Class; רב-סמל ראשון / רס"ר → Master Sergeant; רב-סמל מתקדם / רס"ם → Sergeant Major; רב-סמל בכיר / רס"ב → Warrant Officer; רב-נגד / רנ"ג → Chief Warrant Officer; קצין מקצועי אקדמאי / קמ"א → Academic Officer; סגן-משנה / סג"ם → Second Lieutenant; סגן → Lieutenant; סרן → Captain; רב-סרן / רס"ן → Major; סגן-אלוף / סא"ל → Lieutenant Colonel; אלוף-משנה / אל"ם → Colonel; תת-אלוף / תא"ל → Brigadier General; אלוף → Major General; רב-אלוף / רא"ל → Lieutenant General.
A hyphen or a space in a rank is the same rank (רב אלוף = רב-אלוף). Always match the whole rank, longest first: רב-אלוף is Lieutenant General, never Major General; רב-סרן is Major, never Captain. The IDF Chief of Staff (הרמטכ"ל) is a Lieutenant General.
Israel Police, Border Police and Prison Service: NCO ranks take the IDF English above (רב-סמל → Sergeant First Class). Officer ranks are transliterated, with no gloss: מפקח → Mefakeah; פקד → Pakad; רב-פקד → Rav-Pakad; סגן-ניצב → Sgan-Nitzav; ניצב-משנה → Nitzav-Mishne; תת-ניצב → Tat-Nitzav; ניצב → Nitzav; רב-ניצב → Rav-Nitzav.
"דרגת X" → "the rank of X"; "הועלה לדרגת X" → "was promoted to X"; "הועלה לדרגה לאחר מותו" → "was promoted posthumously".

Organizations (Hebrew → English):
ההגנה → the Haganah; הפלמ"ח → the Palmach; אצ"ל / האירגון הצבאי הלאומי → the Irgun; לח"י → Lehi; חי"ש → the Hish (Haganah field corps); חי"ם → the Him (Haganah garrison corps); גדנ"ע → Gadna; נח"ל → Nahal; הנוטרים / נוטר → the Notrim (Jewish Supernumerary Police) / a Notar; הבריגדה היהודית → the Jewish Brigade; ההסתדרות → the Histadrut; הסוכנות היהודית → the Jewish Agency; קרן היסוד → Keren Hayesod; הקרן הקיימת → the Jewish National Fund; העלייה השנייה → the Second Aliyah; עלייה ב' → Aliyah Bet; החלוץ → HeHalutz; הבונים → Habonim; השומר הצעיר → Hashomer Hatzair; בני עקיבא → Bnei Akiva; בית"ר → Betar; הנוער העובד → HaNoar HaOved; מחנות העולים → Machanot HaOlim; תנועת המושבים → the Moshav Movement; הקיבוץ המאוחד → HaKibbutz HaMeuhad; קיבוץ → kibbutz; מושב → moshav; מושב עובדים → moshav ovdim; ישיבה → yeshiva; צה"ל → the IDF; שב"כ → the Shin Bet; המוסד → the Mossad; משמר הגבול → the Border Police; חיל האוויר → the Air Force; חיל הים → the Navy; חיל השריון → the Armored Corps; חיל התותחנים → the Artillery Corps; חיל ההנדסה → the Combat Engineering Corps; חטיבת גולני → the Golani Brigade; חטיבת הצנחנים → the Paratroopers Brigade; חטיבת גבעתי → the Givati Brigade; סיירת מטכ"ל → Sayeret Matkal; מלחמת העצמאות → the War of Independence; מלחמת ששת הימים → the Six-Day War; מלחמת ההתשה → the War of Attrition; מלחמת יום הכיפורים → the Yom Kippur War; מלחמת לבנון → the Lebanon War; האינתיפאדה → the Intifada.
- Output only the English translation.`;

/** The request's fields: the person's name and parents, English with the Hebrew they render. */
function knownNames(id, index, d) {
  const p = index.get(id) || {};
  const lines = [];
  if (p.n) lines.push(p.e ? `Name: ${p.e} (Hebrew: ${p.n})` : `Name (transliterate): ${p.n}`);
  if (d.parents && d.parentsEn) lines.push(`Parents: ${d.parentsEn} (Hebrew: ${d.parents})`);
  if (p.e) lines.push(`Start with: ${p.e}`);
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
    const names = knownNames(id, index, d);
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
    // Same system prompt for every request: cache it so most of its tokens bill at the cache-read rate.
    system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
    messages: [{
      role: 'user',
      content: `${names.join('\n')}\n\nBiography:\n${cv}`,
    }],
  };
}

const textOf = (message) => message.content.filter((b) => b.type === 'text').map((b) => b.text).join('').trim();

const apiKey = process.env.YIZKOR_API_KEY || process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  console.error('Set YIZKOR_API_KEY (or ANTHROPIC_API_KEY) to an API key from console.anthropic.com.');
  process.exit(1);
}
// Always the public API: cloud sessions set ANTHROPIC_BASE_URL for Claude Code's own traffic,
// which the SDK would otherwise follow (sending this key to the session's endpoint).
const client = new Anthropic({ apiKey, baseURL: 'https://api.anthropic.com' });
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
    usage.cacheWrite = (usage.cacheWrite || 0) + (msg.usage.cache_creation_input_tokens || 0);
    usage.cacheRead = (usage.cacheRead || 0) + (msg.usage.cache_read_input_tokens || 0);
    if (msg.stop_reason === 'refusal') { md += `## ${w.id}\n\n(refused)\n\n`; continue; }
    md += `## ${w.id}\n\n### Hebrew\n\n${w.cv}\n\n### English\n\n${textOf(msg)}\n\n`;
    process.stdout.write('.');
  }
  mkdirSync(new URL('raw/', root), { recursive: true });
  writeFileSync(new URL('raw/bio-sample.md', root), md);
  // Haiku 5.5: $0.10 / $0.50 per million tokens (cache writes 1.25×, cache reads 0.1× input); the batch API halves that.
  const perBio = (usage.input * 0.10 + usage.cacheWrite * 0.125 + usage.cacheRead * 0.01 + usage.output * 0.50) / 1e6 / picks.length / 2;
  const total = loadWork().work.length;
  console.log(`\nwrote data/raw/bio-sample.md (${picks.length} biographies)`);
  console.log(`tokens: ${usage.input} in, ${usage.cacheWrite} cache write, ${usage.cacheRead} cache read, ${usage.output} out; estimated full batch: $${(perBio * total).toFixed(2)} for ${total}`);
} else if (cmd === 'submit') {
  if (existsSync(batchFile)) {
    console.error('Batches are already recorded in data/en/translate-batch.json; run status/collect first.');
    process.exit(1);
  }
  const { work } = loadWork();
  if (!work.length) { console.log('nothing to translate'); process.exit(0); }
  // The Batches API takes at most 256 MB per batch, and each request repeats the system prompt,
  // so everything at once (~28,000) is too big: send it in chunks.
  const batches = [];
  for (let i = 0; i < work.length; i += BATCH_SIZE) {
    const chunk = work.slice(i, i + BATCH_SIZE);
    const batch = await client.messages.batches.create({
      requests: chunk.map((w) => ({ custom_id: w.id, params: params(w) })),
    });
    batches.push({ id: batch.id, count: chunk.length });
    // Written after each chunk, so a failure part way still records what was sent.
    writeFileSync(batchFile, JSON.stringify({ batches, created: new Date().toISOString() }));
    console.log(`submitted ${chunk.length} biographies as batch ${batch.id}`);
  }
} else if (cmd === 'status') {
  for (const { id } of recordedBatches()) {
    const b = await client.messages.batches.retrieve(id);
    console.log(id, b.processing_status, JSON.stringify(b.request_counts));
  }
} else if (cmd === 'collect') {
  const ids = recordedBatches().map((b) => b.id);
  for (const id of ids) {
    const b = await client.messages.batches.retrieve(id);
    if (b.processing_status !== 'ended') { console.log(`not finished: ${id} ${b.processing_status}`); process.exit(0); }
  }
  const { done } = loadWork();
  let ok = 0, failed = 0;
  for (const id of ids) {
    for await (const r of await client.messages.batches.results(id)) {
      if (done.has(r.custom_id)) continue;
      if (r.result.type === 'succeeded' && r.result.message.stop_reason !== 'refusal' && r.result.message.stop_reason !== 'max_tokens') {
        const en = textOf(r.result.message);
        appendFileSync(outFile, JSON.stringify({ id: r.custom_id, en }) + '\n');
        // Also write it into the published file, so no full rebuild (which needs data/raw) is required.
        const file = new URL(`people/${r.custom_id}.json`, root);
        writeFileSync(file, JSON.stringify({ ...JSON.parse(readFileSync(file, 'utf8')), cvEn: en }));
        done.add(r.custom_id);
        ok++;
      } else {
        failed++;
      }
    }
  }
  renameSync(batchFile, new URL(`en/translate-batch-${ids[0]}.json`, root));
  console.log(`collected ${ok}; ${failed} failed (run submit again to retry them)`);
} else {
  console.error('usage: translate-bios.mjs sample [n] | submit | status | collect');
  process.exit(1);
}

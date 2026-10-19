# Israeli Yahrtzeit — יזכור

A daily yahrzeit list for Israel's fallen soldiers and security personnel and for civilian victims of terror. Open the site and it shows everyone whose yahrzeit falls on today's Hebrew date, so people can say *hashkavah*, learn *mishnayot* or say *Tehillim* for them.

> **Data (October 2026):** about 25,800 fallen soldiers and security personnel from the Ministry of Defense site, izkor.gov.il, and 5,296 civilian victims of terror from the National Insurance Institute site, laad.btl.gov.il. Records whose official dates disagree or are partial are listed in `data/needs-review.txt`.

## Features
- **Today's yahrzeits** by Hebrew date. Go to another day with the arrows, by swiping, with the arrow keys, by tapping the date for a picker, or from the scrollable strip of days, which shows how many people are remembered on each day. An "after sunset" switch moves to the next Hebrew day.
- **Details panel:** tap a name to see all of the person's details, copy "Ploni ben/bat Ploni" for prayer, share, or open the official record.
- **Search** by name, father's name or town, with each result's next yahrzeit.
- **Filters:** civilians or security forces, and by war (official war dates; see `src/periods.js`). Neither official list records how a soldier died, so there is no battle/terror/accident filter.
- **Hebrew and English**, with right-to-left layout in Hebrew. English names come from izkor.gov.il; the rest (all civilians, about 1,200 soldiers) are transliterated via `data/en/names.json` and places via `data/en/places.json` (see `scripts/english.mjs`). Biographies are published in Hebrew only; English mode shows a one-time machine translation when one exists (see below), otherwise the Hebrew.
- **Calendar:** tap the date for a Hebrew month view with the number remembered each day.
- **Timeline tab:** people remembered by year of death, civilians stacked on security forces, war periods shaded; tap a year to list its names.
- **Installable app:** it can be added to a phone's home screen and works offline.
- Light and dark modes. No build step and no backend, so it can be hosted on GitHub Pages.

## Run
```bash
npm install      # only needed for tests and scripts
npm start        # serves at http://localhost:8080
npm test
```

## How yahrzeits are calculated
`src/yahrzeit.js` uses [`@hebcal/hdate`](https://github.com/hebcal/hdate), which follows the algorithm in *Calendrical Calculations* (Reingold and Dershowitz):
- A death after sunset counts as the next Hebrew day. Set `afterSunset: true` on the record, or give the Hebrew date directly as `hebrewDate: {yy, mm, dd}`.
- A death on 30 *Ḥeshvan* or 30 *Kislev* falls back to the 29th in years where that month is short.
- A death in *Adar* of a regular year falls in a leap year according to the custom chosen in About: *Adar I* (Ashkenazi, the default) or *Adar II* (Sephardi). The choice is remembered on the device.
- A death in *Adar II* is observed in the last *Adar* of the year.

## Data
Built by `scripts/build-data.mjs` from the raw crawls in `data/raw/` (not committed):
- `data/index.json`: a compact entry per person for the daily view and search (keys are documented in `indexEntry()`; the app expands them in `expand()`).
- `data/people/<id>.json`: details and biography, loaded when someone opens that person.
- `data/needs-review.txt`: official Hebrew and Gregorian dates more than a day apart, or dates without a day.

An official Hebrew date is used when it is within a day of the Gregorian date (a death after sunset is the next Hebrew day, and a death at night is often recorded a day apart); otherwise the Gregorian date is used.

```bash
# Civilian victims of terror (laad.btl.gov.il). Its search pages are blocked outside Israel, so pages are loaded by ID.
NODE_USE_ENV_PROXY=1 node scripts/scrape-laad.mjs 1 48000 4   # data/raw/laad.jsonl; safe to rerun
NODE_USE_ENV_PROXY=1 node scripts/scrape-laad-bio.mjs 8       # biographies for older crawls
# Fallen soldiers and security personnel (izkor.gov.il), from its sitemap; run shards 0-7 in parallel.
NODE_USE_ENV_PROXY=1 node scripts/scrape-izkor.mjs 4 0 8      # data/raw/izkor.jsonl; safe to rerun
node scripts/build-data.mjs
```
Before relying on the data, confirm with the Ministry of Defense and the National Insurance Institute that their terms allow this use.

The demo generator (`npm run demo-data`) and CSV importer (`npm run import`) still write the old single-file `data/fallen.json` format.

### English biographies (one-time translation)
`scripts/translate-bios.mjs` translates every biography with Claude Haiku 5.5 through the Message Batches API (half price; estimated about $6 for all 28,636). It needs an API key from console.anthropic.com (the Claude Max plan does not cover API use) in the environment variable `YIZKOR_API_KEY`. Cloud sessions don't pass a variable named `ANTHROPIC_API_KEY` through, so use the other name there; `ANTHROPIC_API_KEY` works when running it on your own computer.
```bash
node scripts/translate-bios.mjs sample 20   # 20 biographies → data/raw/bio-sample.md, with a cost estimate for the rest
node scripts/translate-bios.mjs submit      # everything not yet translated, in batches of 8,000 (the API caps a batch at 256 MB)
node scripts/translate-bios.mjs status      # usually done within an hour (at most 24)
node scripts/translate-bios.mjs collect     # writes data/en/bios.jsonl and cvEn into data/people/<id>.json
npm run bump && git add -A && git commit -m "English biographies" && git push   # publish
```
`data/en/bios.jsonl` is kept in the repo, so a full rebuild keeps the translations and a later `submit` only sends new or failed ones.

## Deploy
Live at https://ozzybern-spec.github.io/israeli-yahrtzeit/. GitHub Pages publishes straight from `main` (Settings → Pages → Deploy from a branch → `main`, `/ (root)`), so pushing to `main` updates the site. `.github/workflows/test.yml` runs the tests on every push.

## Possible next steps
- Sign-ups so people can claim a name to say *hashkavah* or learn *mishnayot* for (this needs a small backend).
- A daily email or WhatsApp digest.
- Visitors adding memories or photos (needs a backend and moderation).

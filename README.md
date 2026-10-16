# Israeli Yahrtzeit — יזכור

A daily yahrzeit list for Israel's fallen soldiers and victims of terror, from 1948 to today. Open the site and it shows everyone whose yahrzeit falls on today's Hebrew date, so people can say *hashkavah*, learn *mishnayot* or say *Tehillim* for them.

> **Status: prototype with demo data.** Every name in `data/fallen.json` is a placeholder (for example "Sample Name 0067"). No real records are included yet. See [Data](#data).

## Features
- **Today's yahrzeits** by Hebrew date. Go to another day with the arrows, by swiping, with the arrow keys, by tapping the date for a picker, or from the scrollable strip of days, which shows how many people are remembered on each day. An "after sunset" switch moves to the next Hebrew day.
- **Details panel:** tap a name to see all of the person's details, copy "Ploni ben/bat Ploni" for prayer, share, or open the official record.
- **Search** by name, father's name or town, with each result's next yahrzeit.
- **Filters** for soldiers and victims of terror.
- **Hebrew and English**, with right-to-left layout in Hebrew. Fonts are Noto Serif Hebrew for names and dates and Rubik for the interface.
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
- A death in *Adar* of a regular year is observed in *Adar I* in a leap year. This is the Ashkenazi custom. Many Sephardim observe it in *Adar II*, and some observe both. A per-record custom setting could be added.
- A death in *Adar II* is observed in the last *Adar* of the year.

## Data
The app reads `data/fallen.json`:
```json
{ "demo": false, "people": [ {
  "id": "…", "category": "soldier | terror",
  "name": {"he": "…", "en": "…"}, "father": {"he": "…", "en": "…"}, "gender": "m | f",
  "age": 20, "died": "YYYY-MM-DD", "afterSunset": false,
  "hometown": {"he": "…"}, "place": {"he": "…"}, "rank": {"he": "…"}, "unit": {"he": "…"},
  "context": {"he": "…"}, "source": "https://…"
} ] }
```
- `npm run import -- records.csv` builds the file from a CSV. The columns are listed at the top of `scripts/csv-to-json.mjs`.
- `npm run demo-data` regenerates the placeholder data.

**Official sources:** the Ministry of Defense's [izkor.gov.il](https://www.izkor.gov.il) for fallen soldiers, and the National Insurance Institute's [laad.btl.gov.il](https://laad.btl.gov.il) for civilian victims of terror. Before importing their data, get permission from both bodies or confirm that their terms of use allow it, and respect the families' privacy. Neither source has been scraped for this project.

## Possible next steps
- Load the real data, with permission.
- Sign-ups so people can claim a name to say *hashkavah* or learn *mishnayot* for (this needs a small backend).
- A daily email or WhatsApp digest, and a PWA so it can be installed as an app.
- At 30k+ records, split the data into per-day JSON files built at deploy time instead of one file.

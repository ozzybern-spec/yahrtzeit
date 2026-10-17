// Bump the release version: the ?v= on code and data in index.html, and the
// service worker cache name. Run after changing code or data: npm run bump
import { readFileSync, writeFileSync } from 'node:fs';

const html = new URL('../index.html', import.meta.url);
const sw = new URL('../sw.js', import.meta.url);
const current = Number(readFileSync(html, 'utf8').match(/name="app-version" content="(\d+)"/)[1]);
const next = current + 1;
writeFileSync(html, readFileSync(html, 'utf8')
  .replace(/\?v=\d+/g, `?v=${next}`)
  .replace(/name="app-version" content="\d+"/, `name="app-version" content="${next}"`));
writeFileSync(sw, readFileSync(sw, 'utf8').replace(/yizkor-v\d+/, `yizkor-v${next}`));
console.log(`version ${current} → ${next}`);

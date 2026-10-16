import { HDate } from '@hebcal/hdate';
import { strings } from './i18n.js';
import {
  parseISO, toISO, deathHDate, yahrzeitsOn, nextYahrzeit, anniversaryNumber, prayerName,
} from './yahrzeit.js';

const $ = (sel) => document.querySelector(sel);

const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
};

const state = {
  lang: store.get('lang') || (navigator.language?.startsWith('he') ? 'he' : 'en'),
  date: startOfDay(new Date()),
  afterSunset: false,
  category: 'all',
  query: '',
  people: [],
  demo: false,
};

function startOfDay(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }

function currentHDate() {
  const hd = new HDate(state.date);
  return state.afterSunset ? hd.next() : hd;
}

function fmtHebrew(hd, lang) {
  return lang === 'he' ? hd.renderGematriya(true) : hd.render('en');
}

function fmtGreg(date, lang) {
  return date.toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

function el(tag, attrs = {}, ...children) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') n.className = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v);
  }
  for (const c of children) if (c != null && c !== false) n.append(c);
  return n;
}

function card(p, hd) {
  const t = strings[state.lang];
  const L = state.lang;
  const died = deathHDate(p);
  const nth = anniversaryNumber(p, hd.getFullYear());
  const meta = [
    p.age != null && t.age(p.age, p.gender),
    p.hometown && `${t.from}${L === 'he' ? '' : ' '}${p.hometown[L] || p.hometown.he}`,
    p.rank && (p.rank[L] || p.rank.he),
    p.unit && (p.unit[L] || p.unit.he),
  ].filter(Boolean).join(' · ');

  const copyBtn = el('button', { class: 'copy', type: 'button' }, t.copy);
  copyBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(prayerName(p, L));
      copyBtn.textContent = t.copied;
      setTimeout(() => { copyBtn.textContent = t.copy; }, 1500);
    } catch { /* clipboard unavailable */ }
  });

  // In search mode, show when the next yahrzeit falls.
  const searching = state.query.trim() !== '';
  const upcoming = searching ? nextYahrzeit(p, currentHDate()) : null;

  return el('article', { class: `card ${p.category}` },
    el('div', { class: 'card-head' },
      el('h3', {}, p.name[L] || p.name.he),
      el('span', { class: `tag ${p.category}` }, t[p.category]),
    ),
    p.father && el('p', { class: 'father' }, prayerName(p, L)),
    meta && el('p', { class: 'meta' }, meta),
    el('p', { class: 'died' },
      `${t.fell(p.gender)}: ${fmtHebrew(died, L)} · ${fmtGreg(parseISO(p.died), L)}`,
      p.place && ` · ${p.place[L] || p.place.he}`,
    ),
    p.context && el('p', { class: 'context' }, p.context[L] || p.context.he),
    p.source && el('p', { class: 'context' }, el('a', { href: p.source, rel: 'noopener', target: '_blank' }, t.sources)),
    el('div', { class: 'card-foot' },
      searching
        ? el('span', { class: 'nth' }, `${t.nextYahrzeit}: ${upcoming ? fmtHebrew(upcoming, L) : '—'}`)
        : nth > 0 && el('span', { class: 'nth' }, t.yahrzeitNo(nth)),
      copyBtn,
    ),
  );
}

function matches(p, q) {
  const hay = [p.name.he, p.name.en, p.father?.he, p.father?.en, p.hometown?.he, p.hometown?.en]
    .filter(Boolean).join(' ').toLowerCase();
  return q.toLowerCase().split(/\s+/).every((w) => hay.includes(w));
}

function render() {
  const t = strings[state.lang];
  const L = state.lang;
  document.documentElement.lang = L;
  document.documentElement.dir = L === 'he' ? 'rtl' : 'ltr';
  document.title = t.title;

  for (const n of document.querySelectorAll('[data-t]')) n.textContent = t[n.dataset.t];
  $('#search').placeholder = t.search;
  $('#prev').setAttribute('aria-label', t.prev);
  $('#next').setAttribute('aria-label', t.next);
  $('#lang').textContent = t.lang;
  $('#demo').hidden = !state.demo;
  $('#date-input').value = toISO(state.date);
  $('#after-sunset').checked = state.afterSunset;
  for (const b of document.querySelectorAll('.filters button')) {
    b.setAttribute('aria-pressed', String(b.dataset.cat === state.category));
  }

  const hd = currentHDate();
  $('#hebrew-date').textContent = fmtHebrew(hd, L);
  $('#greg-date').textContent = fmtGreg(state.date, L) + (state.afterSunset ? ` · ${t.afterSunset}` : '');

  const pool = state.people.filter((p) => state.category === 'all' || p.category === state.category);
  const q = state.query.trim();
  const list = q
    ? pool.filter((p) => matches(p, q))
    : yahrzeitsOn(pool, hd).sort((a, b) => a.died.localeCompare(b.died));

  $('#count').textContent = q
    ? t.searchResults(list.length)
    : list.length === 1 ? t.countOne : t.countMany(list.length);

  const out = $('#list');
  out.replaceChildren(...(list.length ? list.slice(0, 500).map((p) => card(p, hd)) : [el('p', { class: 'empty' }, t.none)]));
}

function shiftDay(n) {
  state.date = new Date(state.date.getFullYear(), state.date.getMonth(), state.date.getDate() + n);
  render();
}

function bind() {
  $('#prev').addEventListener('click', () => shiftDay(-1));
  $('#next').addEventListener('click', () => shiftDay(1));
  $('#today').addEventListener('click', () => { state.date = startOfDay(new Date()); state.afterSunset = false; render(); });
  $('#date-input').addEventListener('change', (e) => { if (e.target.value) { state.date = parseISO(e.target.value); render(); } });
  $('#after-sunset').addEventListener('change', (e) => { state.afterSunset = e.target.checked; render(); });
  $('#search').addEventListener('input', (e) => { state.query = e.target.value; render(); });
  $('#lang').addEventListener('click', () => { state.lang = state.lang === 'he' ? 'en' : 'he'; store.set('lang', state.lang); render(); });
  for (const b of document.querySelectorAll('.filters button')) {
    b.addEventListener('click', () => { state.category = b.dataset.cat; render(); });
  }
}

async function main() {
  bind();
  render();
  const res = await fetch('data/fallen.json');
  const data = await res.json();
  state.people = data.people;
  state.demo = Boolean(data.demo);
  render();
}

main();

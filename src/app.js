import { HDate, gematriya } from '@hebcal/hdate';
import { strings } from './i18n.js';
import {
  parseISO, toISO, deathHDate, buildIndex, nextYahrzeit, anniversaryNumber, prayerName,
} from './yahrzeit.js';

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
};

const state = {
  lang: store.get('lang') || (navigator.language?.startsWith('he') ? 'he' : 'en'),
  view: 'today',
  date: startOfDay(new Date()),
  afterSunset: false,
  category: 'all',
  query: '',
  people: [],
  demo: false,
};

// Yahrzeit indexes per Hebrew year, rebuilt when data loads.
const indexes = new Map();
function indexFor(hyear) {
  if (!indexes.has(hyear)) indexes.set(hyear, buildIndex(state.people, hyear));
  return indexes.get(hyear);
}

function startOfDay(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
function addDays(d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); }
const sameDay = (a, b) => a.getTime() === b.getTime();

function hdateFor(date) {
  const hd = new HDate(date);
  return state.afterSunset ? hd.next() : hd;
}

function peopleOn(date) {
  const hd = hdateFor(date);
  const list = indexFor(hd.getFullYear()).get(hd.abs()) || [];
  return state.category === 'all' ? list : list.filter((p) => p.category === state.category);
}

const fmtHebrew = (hd, L) => (L === 'he'
  ? hd.renderGematriya(true)
  : `${hd.getDate()} ${hd.getMonthName()} ${hd.getFullYear()}`);
const fmtGreg = (date, L, opts = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) =>
  date.toLocaleDateString(L === 'he' ? 'he-IL' : 'en-GB', opts);
const pick = (obj, L) => obj && (obj[L] || obj.he);

function el(tag, attrs = {}, ...children) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v);
  }
  for (const c of children) if (c != null && c !== false && c !== '') n.append(c);
  return n;
}

function svg(path) {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  s.innerHTML = path;
  return s;
}

/* ---------- Cards and sheet ---------- */

function initials(p, L) {
  const name = pick(p.name, L) || '';
  return name.trim().charAt(0);
}

function card(p, { showNext = false } = {}) {
  const t = strings[state.lang];
  const L = state.lang;
  const hd = hdateFor(state.date);
  const nth = anniversaryNumber(p, hd.getFullYear());
  const sub = [
    p.age != null && t.age(p.age, p.gender),
    p.hometown && t.from(pick(p.hometown, L)),
  ].filter(Boolean).join(' · ');

  let badge;
  if (showNext) {
    const up = nextYahrzeit(p, hdateFor(startOfDay(new Date())));
    badge = up && `${t.nextShort} ${fmtHebrew(up, L)}`;
  } else if (nth > 0) {
    badge = t.yahrzeitNo(nth);
  }

  return el('button', { class: `card ${p.category}`, type: 'button', onclick: () => openSheet(p) },
    el('span', { class: 'avatar', 'aria-hidden': 'true' }, initials(p, L)),
    el('span', { class: 'card-main' },
      el('span', { class: 'card-name' }, pick(p.name, L)),
      el('span', { class: 'card-sub' }, sub),
      el('span', { class: 'card-meta' },
        el('span', { class: `dot ${p.category}` }),
        t[`${p.category}Short`],
        badge && el('span', { class: 'badge' }, badge),
      ),
    ),
    el('span', { class: 'chev', 'aria-hidden': 'true' }),
  );
}

function detailRow(label, value) {
  return value ? el('div', { class: 'detail' }, el('dt', {}, label), el('dd', {}, value)) : null;
}

function openSheet(p) {
  const t = strings[state.lang];
  const L = state.lang;
  const died = deathHDate(p);
  const pn = prayerName(p, L);
  const body = $('#sheet-body');

  const copy = el('button', { class: 'action primary', type: 'button' },
    svg('<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>'), t.copy);
  copy.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(pn); toast(t.copied); } catch { /* unavailable */ }
  });

  const share = navigator.share && el('button', { class: 'action', type: 'button' },
    svg('<path d="M12 3v12M7 8l5-5 5 5"/><path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/>'), t.share);
  share?.addEventListener('click', () => {
    navigator.share({ text: t.shareText(pn, fmtHebrew(died, L)), url: location.href }).catch(() => {});
  });

  body.replaceChildren(
    el('div', { class: 'sheet-head' },
      el('span', { class: 'candle big', 'aria-hidden': 'true' }, el('span', { class: 'flame' })),
      el('h2', { class: 'sheet-name' }, pick(p.name, L)),
      p.father && el('p', { class: 'sheet-prayer' }, pn),
      el('span', { class: `tag ${p.category}` }, t[p.category]),
    ),
    el('dl', { class: 'details' },
      detailRow(t.dateOfDeath, `${fmtHebrew(died, L)}\n${fmtGreg(parseISO(p.died), L)}`),
      p.age != null && detailRow(t.ageLabel, String(p.age)),
      detailRow(t.hometown, pick(p.hometown, L)),
      detailRow(t.rank, pick(p.rank, L)),
      detailRow(t.unit, pick(p.unit, L)),
      detailRow(t.place, pick(p.place, L)),
    ),
    p.context && el('p', { class: 'sheet-context' }, pick(p.context, L)),
    el('div', { class: 'actions' },
      copy,
      share,
      p.source && el('a', { class: 'action', href: p.source, target: '_blank', rel: 'noopener' },
        svg('<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>'), t.source),
    ),
    el('button', { class: 'sheet-close', type: 'button', onclick: closeSheet }, t.close),
  );

  const dlg = $('#sheet');
  dlg.showModal();
  requestAnimationFrame(() => dlg.classList.add('open'));
}

function closeSheet() {
  const dlg = $('#sheet');
  dlg.classList.remove('open');
  setTimeout(() => dlg.close(), 220);
}

let toastTimer;
function toast(msg) {
  const n = $('#toast');
  n.textContent = msg;
  n.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => n.classList.remove('show'), 1800);
}

/* ---------- Views ---------- */

function renderStrip() {
  const L = state.lang;
  const today = startOfDay(new Date());
  const strip = $('#strip');
  const days = [];
  for (let i = -10; i <= 10; i++) {
    const d = addDays(state.date, i);
    const hd = hdateFor(d);
    const count = state.people.length ? peopleOn(d).length : 0;
    const selected = i === 0;
    days.push(el('button', {
      class: `day${selected ? ' selected' : ''}${sameDay(d, today) ? ' today' : ''}`,
      type: 'button',
      role: 'tab',
      'aria-selected': String(selected),
      onclick: () => { state.date = d; render(); },
    },
    el('span', { class: 'day-wd' }, fmtGreg(d, L, { weekday: 'short' })),
    el('span', { class: 'day-heb' }, L === 'he' ? gematriya(hd.getDate()) : String(hd.getDate())),
    el('span', { class: 'day-greg' }, fmtGreg(d, L, { day: 'numeric', month: 'short' })),
    el('span', { class: 'day-count' }, count ? String(count) : ''),
    ));
  }
  strip.replaceChildren(...days);
  const sel = strip.querySelector('.selected');
  sel?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: stripScrolled ? 'smooth' : 'instant' });
  stripScrolled = true;
}
let stripScrolled = false;

function renderToday() {
  const t = strings[state.lang];
  const L = state.lang;
  const hd = hdateFor(state.date);
  $('#hebrew-date').textContent = fmtHebrew(hd, L);
  $('#greg-date').textContent = fmtGreg(state.date, L);
  $('#today-btn').hidden = sameDay(state.date, startOfDay(new Date()));
  $('#after-sunset').checked = state.afterSunset;
  $('#date-input').value = toISO(state.date);
  $('#demo').hidden = !state.demo;
  renderStrip();

  const list = [...peopleOn(state.date)].sort((a, b) => a.died.localeCompare(b.died));
  $('#count').textContent = list.length === 0 ? t.countZero : list.length === 1 ? t.countOne : t.countMany(list.length);
  $('#list').replaceChildren(...(list.length
    ? list.map((p) => card(p))
    : [el('div', { class: 'empty' }, el('span', { class: 'candle big dim' }, el('span', { class: 'flame' })), t.none)]));
}

function matches(p, q) {
  const hay = [p.name.he, p.name.en, p.father?.he, p.father?.en, p.hometown?.he, p.hometown?.en]
    .filter(Boolean).join(' ').toLowerCase();
  return q.toLowerCase().split(/\s+/).every((w) => hay.includes(w));
}

function renderSearch() {
  const t = strings[state.lang];
  const q = state.query.trim();
  $('#search').placeholder = t.search;
  if (!q) {
    $('#search-count').textContent = '';
    $('#results').replaceChildren(el('p', { class: 'empty' }, t.searchHint));
    return;
  }
  const list = state.people
    .filter((p) => (state.category === 'all' || p.category === state.category) && matches(p, q));
  $('#search-count').textContent = t.searchResults(list.length);
  $('#results').replaceChildren(...(list.length
    ? list.slice(0, 200).map((p) => card(p, { showNext: true }))
    : [el('p', { class: 'empty' }, t.noResults)]));
}

function render() {
  const t = strings[state.lang];
  const L = state.lang;
  document.documentElement.lang = L;
  document.documentElement.dir = L === 'he' ? 'rtl' : 'ltr';
  document.title = t.title;
  for (const n of $$('[data-t]')) {
    const v = t[n.dataset.t];
    if (typeof v === 'string') n.textContent = v;
  }
  $('#lang').textContent = t.lang;
  $('#lang').setAttribute('aria-label', t.langLabel);
  $('#prev').setAttribute('aria-label', t.prev);
  $('#next').setAttribute('aria-label', t.next);
  $('#date-btn').setAttribute('aria-label', t.pickDate);

  for (const b of $$('[data-filters] button')) b.setAttribute('aria-pressed', String(b.dataset.cat === state.category));
  for (const b of $$('.tabbar button')) b.setAttribute('aria-current', String(b.dataset.view === state.view));
  for (const v of ['today', 'search', 'about']) $(`#view-${v}`).hidden = v !== state.view;

  if (state.view === 'today') renderToday();
  if (state.view === 'search') renderSearch();
}

/* ---------- Events ---------- */

function shiftDay(n) { state.date = addDays(state.date, n); render(); }

function bind() {
  $('#prev').addEventListener('click', () => shiftDay(-1));
  $('#next').addEventListener('click', () => shiftDay(1));
  $('#today-btn').addEventListener('click', () => { state.date = startOfDay(new Date()); render(); });
  $('#date-btn').addEventListener('click', () => {
    const inp = $('#date-input');
    try { inp.showPicker(); } catch { inp.focus(); inp.click(); }
  });
  $('#date-input').addEventListener('change', (e) => { if (e.target.value) { state.date = parseISO(e.target.value); render(); } });
  $('#after-sunset').addEventListener('change', (e) => { state.afterSunset = e.target.checked; render(); });
  $('#search').addEventListener('input', (e) => { state.query = e.target.value; renderSearch(); });

  const toggleLang = () => { state.lang = state.lang === 'he' ? 'en' : 'he'; store.set('lang', state.lang); stripScrolled = false; render(); };
  $('#lang').addEventListener('click', toggleLang);
  $('#lang-row').addEventListener('click', toggleLang);

  for (const b of $$('[data-filters] button')) {
    b.addEventListener('click', () => { state.category = b.dataset.cat; render(); });
  }
  for (const b of $$('.tabbar button')) {
    b.addEventListener('click', () => {
      state.view = b.dataset.view;
      stripScrolled = false;
      render();
      window.scrollTo({ top: 0 });
      if (state.view === 'search') $('#search').focus();
    });
  }

  // Swipe on the hero to change day. In RTL the next day is to the left.
  let x0 = null;
  const hero = $('#hero');
  hero.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; }, { passive: true });
  hero.addEventListener('touchend', (e) => {
    if (x0 == null) return;
    const dx = e.changedTouches[0].clientX - x0;
    x0 = null;
    if (Math.abs(dx) < 50) return;
    const rtl = state.lang === 'he';
    shiftDay((dx < 0) !== rtl ? 1 : -1);
  });

  // Keyboard: arrow keys move days on the Today view.
  document.addEventListener('keydown', (e) => {
    if (state.view !== 'today' || e.target.matches('input') || $('#sheet').open) return;
    const rtl = state.lang === 'he';
    if (e.key === 'ArrowRight') shiftDay(rtl ? -1 : 1);
    if (e.key === 'ArrowLeft') shiftDay(rtl ? 1 : -1);
  });

  const dlg = $('#sheet');
  dlg.addEventListener('click', (e) => { if (e.target === dlg) closeSheet(); });
  dlg.addEventListener('cancel', (e) => { e.preventDefault(); closeSheet(); });

  // Install prompt (Chrome/Android).
  let deferred;
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; $('#install').hidden = false; });
  $('#install').addEventListener('click', async () => {
    if (!deferred) return;
    deferred.prompt();
    await deferred.userChoice;
    deferred = null;
    $('#install').hidden = true;
  });
}

async function main() {
  bind();
  render();
  const res = await fetch('data/fallen.json');
  const data = await res.json();
  state.people = data.people;
  state.demo = Boolean(data.demo);
  indexes.clear();
  render();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

main();

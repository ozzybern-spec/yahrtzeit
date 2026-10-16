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
  adar: store.get('adar') === 'II' ? 'II' : 'I',
  theme: store.get('theme') === 'light' ? 'light' : 'dark',
  query: '',
  people: [],
  demo: false,
};

// Yahrzeit indexes per Hebrew year, rebuilt when data loads.
const indexes = new Map();
function indexFor(hyear) {
  const key = `${hyear}-${state.adar}`;
  if (!indexes.has(key)) indexes.set(key, buildIndex(state.people, hyear, state.adar));
  return indexes.get(key);
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

function avatar(p, cls = 'avatar') {
  const box = el('span', { class: cls, 'aria-hidden': 'true' });
  const candle = () => el('span', { class: 'candle' }, el('span', { class: 'flame' }));
  if (p.photo) {
    const img = el('img', { src: p.photo, alt: '', loading: 'lazy', decoding: 'async', referrerpolicy: 'no-referrer' });
    img.addEventListener('error', () => img.replaceWith(candle()));
    box.append(img);
  } else {
    box.append(candle());
  }
  return box;
}

/**
 * "Jaffa · 5699 · age 38". Inside an event group the place and year are in
 * the heading, so show "from Be'er Sheva · age 33" instead.
 */
function summary(p, L, inGroup) {
  const t = strings[L];
  const age = p.age != null && t.age(p.age, p.gender);
  const year = L === 'he' ? gematriya(deathHDate(p).getFullYear()) : String(parseISO(p.died).getFullYear());
  const parts = (inGroup ? [p.hometown && t.from(pick(p.hometown, L)), age] : [pick(p.place, L), year, age]).filter(Boolean);
  // Isolate each part so Hebrew next to numbers keeps its order in the English UI.
  return parts.flatMap((x, i) => (i ? [' · ', el('bdi', {}, x)] : [el('bdi', {}, x)]));
}

function card(p, { showNext = false, inGroup = false } = {}) {
  const t = strings[state.lang];
  const L = state.lang;
  const multiCat = new Set(state.people.map((x) => x.category)).size > 1;

  let badge;
  if (showNext) {
    const up = nextYahrzeit(p, hdateFor(startOfDay(new Date())), state.adar);
    badge = up && `${t.nextShort} ${fmtHebrew(up, L)}`;
  }

  return el('button', { class: `card ${p.category}`, type: 'button', onclick: () => openSheet(p) },
    avatar(p),
    el('span', { class: 'card-main' },
      el('span', { class: 'card-name', dir: 'auto' }, pick(p.name, L)),
      el('span', { class: 'card-sub', dir: L === 'he' ? 'rtl' : 'ltr' }, ...summary(p, L, inGroup)),
      (badge || multiCat) && el('span', { class: 'card-meta' },
        multiCat && el('span', { class: `dot ${p.category}` }),
        multiCat && t[`${p.category}Short`],
        badge && el('span', { class: 'badge' }, badge),
      ),
    ),
    el('span', { class: 'chev', 'aria-hidden': 'true' }),
  );
}

function detailRow(label, value) {
  return value ? el('div', { class: 'detail' }, el('dt', {}, label), el('dd', { dir: 'auto' }, value)) : null;
}

const CORRECTIONS_URL = 'https://laad.btl.gov.il/Web/He/ContactUs/Default.aspx';

/** Biography from the official record, fetched when the sheet opens. */
function bioSection(p) {
  const t = strings[state.lang];
  const text = el('div', { class: 'bio-text', dir: 'rtl' }, el('p', { class: 'muted' }, '…'));
  const more = el('button', { class: 'bio-more', type: 'button', hidden: true }, t.readMore);
  const box = el('section', { class: 'bio collapsed' }, el('h3', {}, t.bioTitle), text, more);
  more.addEventListener('click', () => { box.classList.remove('collapsed'); more.hidden = true; });
  fetch(`data/bio/${p.id}.json`)
    .then((r) => (r.ok ? r.json() : Promise.reject()))
    .then(({ cv }) => {
      text.replaceChildren(...cv.split(/\n{2,}/).map((para) => el('p', {}, para)));
      requestAnimationFrame(() => { more.hidden = text.scrollHeight <= text.clientHeight + 4; });
    })
    .catch(() => box.remove());
  return box;
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

  body.replaceChildren(...[
    el('div', { class: 'sheet-head' },
      avatar(p, 'portrait'),
      el('h2', { class: 'sheet-name', dir: 'auto' }, pick(p.name, L)),
      p.nick && el('p', { class: 'sheet-nick', dir: 'rtl' }, `(${p.nick})`),
      (p.father || p.parents) && el('p', { class: 'sheet-prayer', dir: 'auto' }, pn),
      new Set(state.people.map((x) => x.category)).size > 1 && el('span', { class: `tag ${p.category}` }, t[p.category]),
    ),
    el('dl', { class: 'details' },
      detailRow(t.dateOfDeath, `${fmtHebrew(died, L)}\n${fmtGreg(parseISO(p.died), L)}`),
      p.diedOfWounds && detailRow(t.circumstances, t.diedOfWounds(p.gender)),
      detailRow(t.yahrzeit, (() => { const n = anniversaryNumber(p, hdateFor(state.date).getFullYear()); return n > 0 ? t.nth(n) : null; })()),
      p.age != null && detailRow(t.ageLabel, String(p.age)),
      detailRow(t.hometown, pick(p.hometown, L)),
      detailRow(t.rank, pick(p.rank, L)),
      detailRow(t.unit, pick(p.unit, L)),
      detailRow(t.place, pick(p.place, L)),
      detailRow(t.burial, pick(p.burial, L)),
      detailRow(t.survivors(p.gender), pick(p.survivors, L)),
    ),
    p.hasBio && bioSection(p),
    p.context && el('p', { class: 'sheet-context', dir: 'auto' }, pick(p.context, L)),
    el('div', { class: 'actions' },
      copy,
      share,
      p.source && el('a', { class: 'action', href: p.source, target: '_blank', rel: 'noopener' },
        svg('<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>'), t.source),
    ),
    p.source && el('a', { class: 'report', href: CORRECTIONS_URL, target: '_blank', rel: 'noopener' }, t.report),
    el('button', { class: 'sheet-close', type: 'button', onclick: closeSheet }, t.close),
  ].filter(Boolean));

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
  const out = $('#list');
  out.replaceChildren(...(list.length
    ? groupByEvent(list).flatMap((g) => [
      g.title && el('h3', { class: 'group-title', dir: 'auto' },
        el('span', {}, g.title), el('span', { class: 'group-count' }, String(g.people.length))),
      ...g.people.map((p) => card(p, { inGroup: g.event })),
    ]).filter(Boolean)
    : [el('div', { class: 'empty' }, el('span', { class: 'candle big dim' }, el('span', { class: 'flame' })), t.none)]));
  out.classList.remove('fade-in');
  void out.offsetWidth; // restart the animation
  out.classList.add('fade-in');
}

/**
 * Group mass-casualty attacks: 3+ people killed on the same date at the
 * same place get a heading; everyone else follows, oldest first.
 */
function groupByEvent(list) {
  const t = strings[state.lang];
  const L = state.lang;
  const byKey = new Map();
  for (const p of list) {
    const key = `${p.died}|${p.place?.he || ''}`;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(p);
  }
  const groups = [];
  const rest = [];
  for (const people of byKey.values()) {
    if (people.length >= 3) {
      const p = people[0];
      const year = L === 'he' ? gematriya(deathHDate(p).getFullYear()) : String(parseISO(p.died).getFullYear());
      groups.push({ title: [pick(p.place, L), year].filter(Boolean).join(' · '), people, event: true });
    } else {
      rest.push(...people);
    }
  }
  groups.sort((a, b) => b.people.length - a.people.length);
  if (rest.length) groups.push({ title: groups.length ? t.others : '', people: rest });
  return groups;
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
  document.documentElement.dataset.theme = state.theme;
  for (const b of $$('[data-theme-opt] button')) b.setAttribute('aria-pressed', String(b.dataset.themeVal === state.theme));
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
  const cats = new Set(state.people.map((p) => p.category));
  for (const f of $$('[data-filters]')) f.hidden = cats.size < 2;
  for (const b of $$('[data-adar] button')) b.setAttribute('aria-pressed', String(b.dataset.adar === state.adar));
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
  for (const b of $$('[data-theme-opt] button')) {
    b.addEventListener('click', () => { state.theme = b.dataset.themeVal; store.set('theme', state.theme); render(); });
  }
  for (const b of $$('[data-adar] button')) {
    b.addEventListener('click', () => { state.adar = b.dataset.adar; store.set('adar', state.adar); render(); });
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

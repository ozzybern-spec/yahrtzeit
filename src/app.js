import { HDate, gematriya, daysInMonth } from '@hebcal/hdate';
import { strings } from './i18n.js';
import { PERIODS, OTHER, periodOf } from './periods.js';
import {
  parseISO, toISO, deathHDate, buildIndex, nextYahrzeit, anniversaryNumber, prayerName,
} from './yahrzeit.js';

const $ = (sel) => document.querySelector(sel);
// Matches the ?v= in index.html so data and code from the same release load together.
const VERSION = document.querySelector('meta[name=app-version]')?.content || '';
const versioned = (path) => (VERSION ? `${path}?v=${VERSION}` : path);
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
  period: 'all',
  year: null, // search by year of death, set from the timeline
  adar: store.get('adar') === 'II' ? 'II' : 'I',
  theme: store.get('theme') === 'dark' ? 'dark' : 'light',
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

let bothCategories = null;
const hasBothCategories = () => (bothCategories ??= new Set(state.people.map((x) => x.category)).size > 1);
const passesCategory = (p) => state.category === 'all' || p.category === state.category;
const passes = (p) => passesCategory(p) && (state.period === 'all' || p.period === state.period);

/** Everyone remembered on `date`, before the period filter (it gets its own counts). */
function allOn(date) {
  const hd = hdateFor(date);
  return (indexFor(hd.getFullYear()).get(hd.abs()) || []).filter(passesCategory);
}
const peopleOn = (date) => allOn(date).filter(passes);

/** Expand a compact index entry (see scripts/build-data.mjs) into a person. */
function expand(o) {
  const both = (he, en) => (he ? { he, en } : undefined);
  const p = {
    id: o.i,
    category: o.c,
    name: { he: o.n, en: o.e },
    gender: o.g === 'f' ? 'f' : 'm',
    age: o.a,
    died: o.d,
    hebrewDate: o.h && { yy: o.h[0], mm: o.h[1], dd: o.h[2] },
    placeShort: both(o.l, o.le),
    rank: both(o.r, o.re),
    unit: both(o.u, o.ue),
    hometown: both(o.t, o.te),
    hasBio: Boolean(o.b),
  };
  if (o.f === 1) p.photo = `https://www.izkor.gov.il/assets/person/images/${o.i.split('-')[1].padStart(6, '0')}.jpg`;
  else if (o.f) p.photo = `https://laad.btl.gov.il${o.f}`;
  p.period = periodOf(o.d).key;
  return p;
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
 * Civilians: "Jaffa · 5699 · age 38"; soldiers: "Sergeant · Golani · 5733 · age 20".
 * Inside a group the place or unit and the year are in the heading, so show
 * the hometown and age instead.
 */
function summary(p, L, inGroup) {
  const t = strings[L];
  const age = p.age != null && t.age(p.age, p.gender);
  const year = L === 'he' ? gematriya(deathHDate(p).getFullYear()) : String(parseISO(p.died).getFullYear());
  const parts = (p.category === 'soldier'
    ? (inGroup ? [pick(p.rank, L), p.hometown && t.from(pick(p.hometown, L)), age] : [pick(p.rank, L), pick(p.unit, L), year, age])
    : (inGroup ? [p.hometown && t.from(pick(p.hometown, L)), age] : [pick(p.placeShort || p.place, L), year, age])
  ).filter(Boolean);
  // Isolate each part so Hebrew next to numbers keeps its order in the English UI.
  return parts.flatMap((x, i) => (i ? [' · ', el('bdi', {}, x)] : [el('bdi', {}, x)]));
}

function card(p, { showNext = false, inGroup = false } = {}) {
  const t = strings[state.lang];
  const L = state.lang;
  // The category label only helps when both categories are on screen.
  const multiCat = state.category === 'all' && hasBothCategories();

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
const IZKOR_CONTACT_URL = 'https://www.izkor.gov.il/contact';

/** Biography from the official record, collapsed to a few lines at first. */
// English mode shows the translation (scripts/translate-bios.mjs) when there is one.
function bioSection(p) {
  const t = strings[state.lang];
  const english = state.lang === 'en' && p.cvEn;
  const body = english ? p.cvEn : p.cv;
  const text = el('div', { class: 'bio-text', dir: english ? 'ltr' : 'rtl', lang: english ? 'en' : 'he' },
    ...body.split(/\n{2,}/).map((para) => el('p', {}, para)));
  const more = el('button', { class: 'bio-more', type: 'button', hidden: true }, t.readMore);
  const box = el('section', { class: 'bio collapsed' }, el('h3', {}, english || state.lang === 'he' ? t.bioTitle : t.bioTitleHe), text, more);
  more.addEventListener('click', () => { box.classList.remove('collapsed'); more.hidden = true; });
  requestAnimationFrame(() => { more.hidden = text.scrollHeight <= text.clientHeight + 4; });
  return box;
}

/** Details and biography live in data/people/<id>.json, fetched when the sheet opens. */
async function loadDetails(p) {
  try {
    const r = await fetch(versioned(`data/people/${p.id}.json`));
    return r.ok ? await r.json() : {};
  } catch { return {}; }
}

async function openSheet(base) {
  const t = strings[state.lang];
  const L = state.lang;
  const extra = await loadDetails(base);
  const p = { ...base, ...extra, place: extra.place && { he: extra.place.he || extra.place } };
  if (L === 'en' && p.parentsEn) p.parents = p.parentsEn;
  const died = deathHDate(p);
  const pn = prayerName(p, L);
  const fromLaad = p.id.startsWith('laad-');
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
      hasBothCategories() && el('span', { class: `tag ${p.category}` }, t[p.category]),
    ),
    el('dl', { class: 'details' },
      detailRow(t.dateOfDeath, `${fmtHebrew(died, L)}\n${fmtGreg(parseISO(p.died), L)}`),
      p.diedOfWounds && detailRow(t.circumstances, t.diedOfWounds(p.gender)),
      detailRow(t.yahrzeit, (() => { const n = anniversaryNumber(p, hdateFor(state.date).getFullYear()); return n > 0 ? t.nth(n) : null; })()),
      p.age != null && detailRow(t.ageLabel, String(p.age)),
      detailRow(t.hometown, pick(p.hometown, L)),
      detailRow(t.rank, pick(p.rank, L)),
      detailRow(t.unit, pick(p.unit, L)),
      // English mode: the short English place (the official full wording is Hebrew only).
      detailRow(t.place, L === 'en' && p.placeShort?.en ? p.placeShort.en : pick(p.place, L)),
      detailRow(t.burial, p.mia ? t.burialUnknown : pick(p.burial, L)),
      detailRow(t.survivors(p.gender), pick(p.survivors, L)),
    ),
    p.cv && bioSection(p),
    p.context && el('p', { class: 'sheet-context', dir: 'auto' }, pick(p.context, L)),
    el('div', { class: 'actions' },
      copy,
      share,
      p.source && el('a', { class: 'action', href: p.source, target: '_blank', rel: 'noopener' },
        svg('<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>'), t.source),
    ),
    p.source && el('a', { class: 'report', href: fromLaad ? CORRECTIONS_URL : IZKOR_CONTACT_URL, target: '_blank', rel: 'noopener' },
      fromLaad ? t.report : t.reportIzkor),
    el('button', { class: 'sheet-close', type: 'button', onclick: closeSheet }, t.close),
  ].filter(Boolean));

  const dlg = $('#sheet');
  dlg.showModal();
  // showModal focuses the first button (often "read more"), which scrolls the sheet.
  document.activeElement?.blur();
  dlg.scrollTop = 0;
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

/* ---------- Calendar ---------- */

let calMonth = null; // HDate of the first day of the month on screen

const monthTitle = (hd, L) => (L === 'he'
  ? hd.renderGematriya(true).split(' ').slice(1).join(' ')
  : `${hd.getMonthName()} ${hd.getFullYear()}`);

function openCalendar() {
  const hd = hdateFor(state.date);
  calMonth = new HDate(1, hd.getMonth(), hd.getFullYear());
  renderCalendar();
  const dlg = $('#calendar');
  dlg.showModal();
  document.activeElement?.blur();
  requestAnimationFrame(() => dlg.classList.add('open'));
}

function closeCalendar() {
  const dlg = $('#calendar');
  dlg.classList.remove('open');
  setTimeout(() => dlg.close(), 220);
}

function goTo(date) {
  state.date = startOfDay(date);
  state.afterSunset = false;
  state.view = 'today';
  closeCalendar();
  render();
}

/** A month of the Hebrew calendar; each day shows how many are remembered on it. */
function renderCalendar() {
  const t = strings[state.lang];
  const L = state.lang;
  const m = calMonth.getMonth();
  const y = calMonth.getFullYear();
  const n = daysInMonth(m, y);
  const first = calMonth.greg();
  const last = new HDate(n, m, y).greg();
  const today = new HDate(startOfDay(new Date())).abs();
  const selected = hdateFor(state.date).abs();

  $('#cal-title').textContent = monthTitle(calMonth, L);
  const gm = (d) => d.toLocaleDateString(L === 'he' ? 'he-IL' : 'en-GB', { month: 'long', year: 'numeric' });
  $('#cal-greg').textContent = gm(first) === gm(last) ? gm(first) : `${gm(first)} – ${gm(last)}`;

  const week = [];
  for (let i = 0; i < 7; i++) week.push(el('span', { class: 'cal-wd' }, fmtGreg(new Date(2026, 0, 4 + i), L, { weekday: 'narrow' })));
  const cells = [];
  for (let i = 0; i < calMonth.getDay(); i++) cells.push(el('span', { class: 'cal-cell cal-blank' }));
  for (let d = 1; d <= n; d++) {
    const hd = new HDate(d, m, y);
    const count = (indexFor(y).get(hd.abs()) || []).filter(passes).length;
    cells.push(el('button', {
      class: `cal-cell${hd.abs() === today ? ' today' : ''}${hd.abs() === selected ? ' selected' : ''}`,
      type: 'button',
      onclick: () => goTo(hd.greg()),
    },
    el('span', { class: 'cal-heb' }, L === 'he' ? gematriya(d) : String(d)),
    el('span', { class: 'cal-gd' }, String(hd.greg().getDate())),
    el('span', { class: 'cal-count' }, count ? fmtNum(count, L) : '')));
  }
  $('#cal-grid').replaceChildren(...week, ...cells);
  $('#cal-date').value = toISO(state.date);
}

/* ---------- Timeline ---------- */

const SVGNS = 'http://www.w3.org/2000/svg';
function s(tag, attrs = {}, ...children) {
  const n = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) n.setAttribute(k, v);
  for (const c of children) if (c) n.append(c);
  return n;
}
const yearOf = (p) => Number(p.died.slice(0, 4));
const fmtNum = (n, L) => n.toLocaleString(L === 'he' ? 'he-IL' : 'en-US');

/**
 * One dot per person, grouped by year of death, newest first: security forces,
 * then civilians on a fresh line. Each year is its own canvas (one tall canvas
 * would pass the browser's size limit). Tap a dot for the name, then details.
 */
// Dot size follows the zoom (pinch, or the − / + buttons).
let tlZoom = 1;
const dotSize = () => 2.6 * tlZoom;
const pitch = () => (2.6 + 1.5) * tlZoom;
let tlBlocks = [];
let tlWidth = 300;

function renderTimeline() {
  const t = strings[state.lang];
  const L = state.lang;
  const rtl = L === 'he';
  const shown = state.people.filter(passesCategory);
  $('#tl-total').textContent = fmtNum(shown.length, L);
  hideDotTip();

  const byYear = new Map();
  for (const p of shown) {
    const y = yearOf(p);
    if (!byYear.has(y)) byYear.set(y, { soldier: [], terror: [] });
    byYear.get(y)[p.category].push(p);
  }
  const years = [...byYear.keys()].sort((a, b) => b - a);
  for (const v of byYear.values()) for (const k of ['soldier', 'terror']) v[k].sort((a, b) => a.died.localeCompare(b.died));

  const totals = { soldier: 0, terror: 0 };
  for (const p of shown) totals[p.category]++;
  $('#tl-legend').replaceChildren(...['soldier', 'terror'].filter((c) => totals[c]).map((c) =>
    el('span', { class: 'tl-key' }, el('span', { class: `tl-swatch ${c}` }), `${t[`${c}Short`]} · ${fmtNum(totals[c], L)}`)));

  // A war's heading sits above its most recent year that has anyone in it.
  const anchors = new Map();
  for (const per of PERIODS) {
    const from = Number((per.from || '1900').slice(0, 4));
    const to = per.to ? Number(per.to.slice(0, 4)) : Infinity;
    const y = years.find((x) => x >= from && x <= to && !anchors.has(x));
    if (y != null) anchors.set(y, per);
  }
  const counts = new Map();
  for (const p of shown) counts.set(p.period, (counts.get(p.period) || 0) + 1);
  $('#tl-periods').replaceChildren(...[...anchors.values()].reverse().map((per) => el('button', {
    class: 'chip', type: 'button',
    onclick: () => document.getElementById(`tl-war-${per.key}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
  }, per[L], el('span', { class: 'chip-count' }, fmtNum(counts.get(per.key) || 0, L)))));

  const box = $('#tl-chart');
  tlWidth = Math.max(188, (box.clientWidth || 350) - 52);
  tlBlocks = [];
  const nodes = [];
  for (const y of years) {
    const v = byYear.get(y);
    const war = anchors.get(y);
    if (war) nodes.push(el('h3', { class: 'tl-war-h', id: `tl-war-${war.key}` }, war[L]));
    const n = v.soldier.length + v.terror.length;
    const canvas = el('canvas', { class: 'tl-dots', 'aria-label': `${y}: ${fmtNum(n, L)}` });
    const block = { y, v, canvas, w: tlWidth, rtl, sel: null };
    canvas.addEventListener('click', (e) => tapDot(block, e));
    tlBlocks.push(block);
    nodes.push(el('div', { class: `tl-year${n >= 500 ? ' big' : ''}` },
      el('span', { class: 'tl-y' }, String(y), n >= 500 ? el('small', {}, fmtNum(n, L)) : null),
      canvas));
  }
  box.replaceChildren(...nodes);
  layoutDots();
}

function layoutDots() {
  const per = Math.max(1, Math.floor(tlWidth / pitch()));
  for (const b of tlBlocks) {
    b.per = per;
    b.ls = Math.ceil(b.v.soldier.length / per);
    b.h = Math.max((b.ls + Math.ceil(b.v.terror.length / per)) * pitch(), 6);
    drawDots(b);
  }
  $('#tl-zoom-out').disabled = tlZoom <= 1;
  $('#tl-zoom-in').disabled = tlZoom >= 5;
}

/** Zoom keeping the point at screen height `cy` (a year block) in place. */
function setZoom(z, cy = window.innerHeight / 2) {
  z = Math.min(5, Math.max(1, z));
  if (Math.abs(z - tlZoom) < 0.01) return;
  const b = tlBlocks.find((o) => o.canvas.getBoundingClientRect().bottom >= cy) || tlBlocks[0];
  const r = b?.canvas.getBoundingClientRect();
  const frac = r && r.height ? (cy - r.top) / r.height : 0;
  tlZoom = z;
  hideDotTip();
  layoutDots();
  if (b) {
    const r2 = b.canvas.getBoundingClientRect();
    window.scrollBy(0, r2.top + frac * r2.height - cy);
  }
}

// Two-finger pinch on the dots; the browser's own page zoom is off there (touch-action).
function initPinch() {
  const box = $('#tl-chart');
  let start = null;
  let frame = 0;
  const dist = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  box.addEventListener('touchstart', (e) => {
    if (e.touches.length === 2) start = { d: dist(e.touches), z: tlZoom, cy: (e.touches[0].clientY + e.touches[1].clientY) / 2 };
  }, { passive: true });
  box.addEventListener('touchmove', (e) => {
    if (!start || e.touches.length !== 2) return;
    e.preventDefault();
    const z = start.z * dist(e.touches) / start.d;
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => setZoom(z, start.cy));
  }, { passive: false });
  box.addEventListener('touchend', (e) => { if (e.touches.length < 2) start = null; });
  // Trackpad pinch and ctrl + scroll on computers.
  box.addEventListener('wheel', (e) => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    setZoom(tlZoom * Math.exp(-e.deltaY / 200), e.clientY);
  }, { passive: false });
  $('#tl-zoom-in').addEventListener('click', () => setZoom(tlZoom * 1.6));
  $('#tl-zoom-out').addEventListener('click', () => setZoom(tlZoom / 1.6));
}

function dotSprites() {
  const cs = getComputedStyle(document.documentElement);
  const dark = document.documentElement.dataset.theme === 'dark';
  const dpr = window.devicePixelRatio || 1;
  const make = (color) => {
    const DOT = 2.6 * 5, R = 4 * DOT, c = document.createElement('canvas');
    c.width = c.height = Math.ceil(R * 2 * dpr);
    const g = c.getContext('2d');
    g.scale(dpr, dpr);
    if (dark) { g.shadowColor = color; g.shadowBlur = 4 * 5; }
    g.fillStyle = color;
    g.beginPath(); g.arc(R, R, DOT / 2, 0, Math.PI * 2); g.fill();
    return c;
  };
  return { soldier: make(cs.getPropertyValue('--soldier').trim()), terror: make(cs.getPropertyValue('--terror').trim()), ink: cs.getPropertyValue('--ink').trim() };
}

// Position of the i-th dot of a category within a year's block.
function dotXY(b, cat, i) {
  const line = (cat === 'soldier' ? 0 : b.ls) + Math.floor(i / b.per);
  const col = i % b.per;
  const x = col * pitch() + dotSize() / 2 + 1;
  return { x: b.rtl ? b.w - x : x, y: line * pitch() + dotSize() / 2 + 1 };
}

let sprites = null;
function drawDots(b) {
  sprites = sprites && sprites.theme === document.documentElement.dataset.theme ? sprites : { ...dotSprites(), theme: document.documentElement.dataset.theme };
  const dpr = window.devicePixelRatio || 1;
  const { canvas } = b;
  canvas.width = Math.ceil(b.w * dpr);
  canvas.height = Math.ceil((b.h + 2) * dpr);
  canvas.style.width = `${b.w}px`;
  canvas.style.height = `${b.h + 2}px`;
  const g = canvas.getContext('2d');
  g.scale(dpr, dpr);
  const R = 4 * dotSize();
  for (const cat of ['soldier', 'terror']) {
    b.v[cat].forEach((p, i) => {
      const { x, y } = dotXY(b, cat, i);
      g.drawImage(sprites[cat], x - R, y - R, R * 2, R * 2);
    });
  }
  if (b.sel) {
    const { x, y } = dotXY(b, b.sel.cat, b.sel.i);
    g.strokeStyle = sprites.ink; g.lineWidth = 1.2;
    g.beginPath(); g.arc(x, y, dotSize() + 1.2, 0, Math.PI * 2); g.stroke();
  }
}

function tapDot(b, e) {
  const r = b.canvas.getBoundingClientRect();
  const px = b.rtl ? r.right - e.clientX : e.clientX - r.left;
  const col = Math.max(0, Math.min(b.per - 1, Math.floor(px / pitch())));
  const line = Math.max(0, Math.floor((e.clientY - r.top) / pitch()));
  const cat = line < b.ls ? 'soldier' : 'terror';
  const i = (line - (cat === 'soldier' ? 0 : b.ls)) * b.per + col;
  const p = b.v[cat][i];
  for (const o of tlBlocks) if (o.sel && o !== b) { o.sel = null; drawDots(o); }
  if (!p) { b.sel = null; drawDots(b); hideDotTip(); return; }
  b.sel = { cat, i };
  drawDots(b);
  showDotTip(p, e.clientX, e.clientY);
}

function showDotTip(p, cx, cy) {
  const t = strings[state.lang];
  const L = state.lang;
  const tip = $('#tl-tip');
  tip.replaceChildren(
    avatar(p),
    el('span', { class: 'tl-tip-main' },
      el('strong', { dir: 'auto' }, pick(p.name, L)),
      el('span', { dir: L === 'he' ? 'rtl' : 'ltr' }, `${fmtHebrew(deathHDate(p), L)} · ${t[`${p.category}Short`]}`)),
    el('button', { class: 'chip-btn', type: 'button', onclick: () => { hideDotTip(); openSheet(p); } }, t.details),
  );
  tip.hidden = false;
  // Above the dot when there is room, else below; kept on screen.
  const w = tip.offsetWidth, h = tip.offsetHeight;
  const left = Math.min(window.innerWidth - w - 12, Math.max(12, cx - w / 2));
  const top = cy - h - 14 > 70 ? cy - h - 14 : cy + 16;
  tip.style.left = `${left}px`;
  tip.style.top = `${top}px`;
}

function hideDotTip() {
  const tip = $('#tl-tip');
  if (tip) tip.hidden = true;
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
    el('span', { class: 'day-count' }, count ? fmtNum(count, L) : ''),
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

  const all = allOn(state.date);
  renderPeriods($('#today-periods'), all);
  const list = all.filter(passes).sort((a, b) => a.died.localeCompare(b.died));
  $('#count').textContent = list.length === 0 ? t.countZero : list.length === 1 ? t.countOne : t.countMany(fmtNum(list.length, L));
  const out = $('#list');
  out.replaceChildren(...(list.length
    ? groupByEvent(list).flatMap((g) => [
      g.title && el('h3', { class: 'group-title', dir: 'auto' },
        el('span', {}, g.title), el('span', { class: 'group-count' }, fmtNum(g.people.length, L))),
      ...g.people.map((p) => card(p, { inGroup: g.event })),
    ]).filter(Boolean)
    : [el('div', { class: 'empty' }, el('span', { class: 'candle big dim' }, el('span', { class: 'flame' })), t.none)]));
  out.classList.remove('fade-in');
  void out.offsetWidth; // restart the animation
  out.classList.add('fade-in');
}

/**
 * Group mass-casualty days: 3+ civilians killed on the same date at the same
 * place, or 3+ soldiers of the same unit on the same date, get a heading;
 * everyone else follows, oldest first.
 */
function groupByEvent(list) {
  const t = strings[state.lang];
  const L = state.lang;
  const byKey = new Map();
  for (const p of list) {
    const key = p.category === 'soldier'
      ? `${p.died}|s|${p.unit?.he || ''}`
      : `${p.died}|c|${p.placeShort?.he || ''}`;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(p);
  }
  const groups = [];
  const rest = [];
  for (const people of byKey.values()) {
    if (people.length >= 3) {
      const p = people[0];
      const year = L === 'he' ? gematriya(deathHDate(p).getFullYear()) : String(parseISO(p.died).getFullYear());
      const where = p.category === 'soldier' ? pick(p.unit, L) : pick(p.placeShort, L);
      groups.push({ title: [where, year].filter(Boolean).join(' · '), people, event: true });
    } else {
      rest.push(...people);
    }
  }
  groups.sort((a, b) => b.people.length - a.people.length);
  if (rest.length) groups.push({ title: groups.length ? t.others : '', people: rest });
  return groups;
}

/** Period chips with counts for the people in view; hidden when there is nothing to choose. */
function renderPeriods(box, people) {
  const t = strings[state.lang];
  const L = state.lang;
  const counts = new Map();
  for (const p of people) counts.set(p.period, (counts.get(p.period) || 0) + 1);
  const options = [...PERIODS, OTHER].filter((x) => counts.get(x.key));
  // Keep a chosen period visible even when it has no one on this day.
  if (state.period !== 'all' && !counts.get(state.period)) options.push([...PERIODS, OTHER].find((x) => x.key === state.period));
  box.hidden = options.length < 2 && state.period === 'all';
  const chip = (key, label, n) => el('button', {
    class: 'chip', type: 'button', 'aria-pressed': String(state.period === key),
    onclick: () => { state.period = state.period === key && key !== 'all' ? 'all' : key; render(); },
  }, label, n != null && el('span', { class: 'chip-count' }, fmtNum(n, L)));
  box.replaceChildren(chip('all', t.allPeriods, people.length), ...options.map((x) => chip(x.key, x[L], counts.get(x.key) || 0)));
}

function matches(p, q) {
  const hay = [p.name.he, p.name.en, p.hometown?.he, p.hometown?.en, p.unit?.he, p.unit?.en, p.placeShort?.he]
    .filter(Boolean).join(' ').toLowerCase();
  return q.toLowerCase().split(/\s+/).every((w) => hay.includes(w));
}

function renderSearch() {
  const t = strings[state.lang];
  const q = state.query.trim();
  $('#search').placeholder = t.search;
  const yc = $('#search-year');
  yc.hidden = state.year == null;
  if (state.year != null) yc.textContent = t.yearChip(state.year);
  if (!q && state.year == null) {
    $('#search-count').textContent = '';
    renderPeriods($('#search-periods'), []);
    $('#results').replaceChildren(el('p', { class: 'empty' }, t.searchHint));
    return;
  }
  const found = state.people.filter((p) => passesCategory(p) && (!q || matches(p, q)) && (state.year == null || yearOf(p) === state.year));
  renderPeriods($('#search-periods'), found);
  const list = found.filter(passes);
  $('#search-count').textContent = t.searchResults(fmtNum(list.length, state.lang)) + (list.length > 200 ? ` · ${t.firstShown(200)}` : '');
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
  $('#theme').setAttribute('aria-label', t.themeTitle);
  $('#tl-zoom-in').setAttribute('aria-label', t.zoomIn);
  $('#tl-zoom-out').setAttribute('aria-label', t.zoomOut);
  $('#lang').setAttribute('aria-label', t.langLabel);
  $('#prev').setAttribute('aria-label', t.prev);
  $('#next').setAttribute('aria-label', t.next);
  $('#date-btn').setAttribute('aria-label', t.pickDate);
  $('#cal-prev').setAttribute('aria-label', t.prevMonth);
  $('#cal-next').setAttribute('aria-label', t.nextMonth);

  for (const b of $$('[data-filters] button')) b.setAttribute('aria-pressed', String(b.dataset.cat === state.category));
  const cats = new Set(state.people.map((p) => p.category));
  for (const f of $$('[data-filters]')) f.hidden = cats.size < 2;
  for (const b of $$('[data-adar] button')) b.setAttribute('aria-pressed', String(b.dataset.adar === state.adar));
  for (const b of $$('.tabbar button')) b.setAttribute('aria-current', String(b.dataset.view === state.view));
  for (const v of ['today', 'search', 'timeline', 'about']) $(`#view-${v}`).hidden = v !== state.view;

  if (state.view === 'today') renderToday();
  if (state.view === 'search') renderSearch();
  if (state.view === 'timeline') renderTimeline();
}

/* ---------- Events ---------- */

function shiftDay(n) { state.date = addDays(state.date, n); render(); }

function bind() {
  $('#prev').addEventListener('click', () => shiftDay(-1));
  $('#next').addEventListener('click', () => shiftDay(1));
  $('#today-btn').addEventListener('click', () => { state.date = startOfDay(new Date()); render(); });
  $('#date-btn').addEventListener('click', openCalendar);
  $('#cal-prev').addEventListener('click', () => {
    const prev = calMonth.prev();
    calMonth = new HDate(1, prev.getMonth(), prev.getFullYear());
    renderCalendar();
  });
  $('#cal-next').addEventListener('click', () => {
    calMonth = new HDate(daysInMonth(calMonth.getMonth(), calMonth.getFullYear()), calMonth.getMonth(), calMonth.getFullYear()).next();
    renderCalendar();
  });
  $('#cal-today').addEventListener('click', () => goTo(new Date()));
  $('#cal-date').addEventListener('change', (e) => { if (e.target.value) goTo(parseISO(e.target.value)); });
  const cal = $('#calendar');
  cal.addEventListener('click', (e) => { if (e.target === cal) closeCalendar(); });
  cal.addEventListener('cancel', (e) => { e.preventDefault(); closeCalendar(); });
  $('#date-input').addEventListener('change', (e) => { if (e.target.value) { state.date = parseISO(e.target.value); render(); } });
  $('#after-sunset').addEventListener('change', (e) => { state.afterSunset = e.target.checked; render(); });
  $('#search').addEventListener('input', (e) => { state.query = e.target.value; renderSearch(); });

  const toggleLang = () => { state.lang = state.lang === 'he' ? 'en' : 'he'; store.set('lang', state.lang); stripScrolled = false; render(); };
  $('#lang').addEventListener('click', toggleLang);
  $('#lang-row').addEventListener('click', toggleLang);

  for (const b of $$('[data-filters] button')) {
    b.addEventListener('click', () => { state.category = b.dataset.cat; render(); });
  }
  $('#search-year').addEventListener('click', () => { state.year = null; renderSearch(); });
  initPinch();
  // Close the dot popup on scroll or a tap elsewhere.
  window.addEventListener('scroll', hideDotTip, { passive: true });
  document.addEventListener('click', (e) => { if (!e.target.closest('#tl-tip, .tl-dots')) hideDotTip(); });
  $('#theme').addEventListener('click', () => { state.theme = state.theme === 'dark' ? 'light' : 'dark'; store.set('theme', state.theme); render(); });
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
    if (state.view !== 'today' || e.target.matches('input') || $('#sheet').open || $('#calendar').open) return;
    const rtl = state.lang === 'he';
    if (e.key === 'ArrowRight') shiftDay(rtl ? -1 : 1);
    if (e.key === 'ArrowLeft') shiftDay(rtl ? 1 : -1);
  });

  const dlg = $('#sheet');
  dlg.addEventListener('click', (e) => { if (e.target === dlg) closeSheet(); });
  dlg.addEventListener('cancel', (e) => { e.preventDefault(); closeSheet(); });

  // Install as app. Android/Chrome fires beforeinstallprompt; iPhone/iPad
  // has no prompt, so explain Share → Add to Home Screen instead.
  const installed = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const banner = $('#install-banner');
  const showBanner = (mode, force = false) => {
    if (installed || (!force && store.get('installDismissed'))) return;
    const t = strings[state.lang];
    $('#install-hint').textContent = mode === 'ios' ? t.installHintIos : t.installHintAndroid;
    $('#install-go').hidden = mode === 'ios';
    $('#install-close').setAttribute('aria-label', t.installClose);
    banner.hidden = false;
  };
  let deferred;
  const promptInstall = async () => {
    if (!deferred) return;
    deferred.prompt();
    await deferred.userChoice;
    deferred = null;
    banner.hidden = true;
    $('#install').hidden = true;
  };
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; $('#install').hidden = false; showBanner('android'); });
  window.addEventListener('appinstalled', () => { banner.hidden = true; $('#install').hidden = true; });
  if (ios && !installed) { $('#install').hidden = false; showBanner('ios'); }
  // The About row installs directly, or brings back the instructions on iPhone.
  $('#install').addEventListener('click', () => {
    if (deferred) { promptInstall(); return; }
    state.view = 'today';
    render();
    showBanner('ios', true);
    window.scrollTo({ top: 0 });
  });
  $('#install-go').addEventListener('click', promptInstall);
  $('#install-close').addEventListener('click', () => { banner.hidden = true; store.set('installDismissed', '1'); });
}

async function main() {
  bind();
  render();
  const res = await fetch(versioned('data/index.json'));
  const data = await res.json();
  state.people = data.people.map(expand);
  bothCategories = null;
  state.demo = Boolean(data.demo);
  indexes.clear();
  render();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

main();

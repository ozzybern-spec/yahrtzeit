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

/** The official page through Google Translate (the sources publish Hebrew biographies only). */
function translatedUrl(source) {
  const u = new URL(source);
  u.searchParams.set('_x_tr_sl', 'iw');
  u.searchParams.set('_x_tr_tl', 'en');
  u.hostname = `${u.hostname.replace(/-/g, '--').replace(/\./g, '-')}.translate.goog`;
  return u.toString();
}

/** Biography from the official record, collapsed to a few lines at first. */
function bioSection(cv, source) {
  const t = strings[state.lang];
  const text = el('div', { class: 'bio-text', dir: 'rtl', lang: 'he' }, ...cv.split(/\n{2,}/).map((para) => el('p', {}, para)));
  const more = el('button', { class: 'bio-more', type: 'button', hidden: true }, t.readMore);
  const box = el('section', { class: 'bio collapsed' }, el('h3', {}, t.bioTitle),
    state.lang === 'en' && source && el('a', { class: 'bio-translate', href: translatedUrl(source), target: '_blank', rel: 'noopener' }, t.readTranslated),
    text, more);
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
    p.cv && bioSection(p.cv, p.source),
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
    el('span', { class: 'cal-count' }, count ? String(count) : '')));
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

/** Columns: soldiers (bottom) and civilians (top) per year of death, for the current filters. */
function renderTimeline() {
  const t = strings[state.lang];
  const L = state.lang;
  const people = state.people.filter(passesCategory);
  renderPeriods($('#tl-periods'), people);
  const shown = people.filter(passes);
  $('#tl-total').textContent = t.tlTotal(fmtNum(shown.length, L));

  const byYear = new Map();
  for (const p of shown) {
    const y = yearOf(p);
    if (!byYear.has(y)) byYear.set(y, { soldier: 0, terror: 0 });
    byYear.get(y)[p.category]++;
  }
  const allYears = state.people.map(yearOf);
  const first = Math.max(1900, Math.min(...allYears));
  const last = Math.max(...allYears);
  const years = [];
  for (let y = first; y <= last; y++) years.push(y);
  const max = Math.max(1, ...years.map((y) => (byYear.get(y)?.soldier || 0) + (byYear.get(y)?.terror || 0)));

  // Legend with totals (identity never by colour alone).
  const totals = { soldier: 0, terror: 0 };
  for (const v of byYear.values()) { totals.soldier += v.soldier; totals.terror += v.terror; }
  $('#tl-legend').replaceChildren(...['soldier', 'terror'].filter((c) => totals[c]).map((c) =>
    el('span', { class: 'tl-key' }, el('span', { class: `tl-swatch ${c}` }), `${t[`${c}Short`]} · ${fmtNum(totals[c], L)}`)));

  // Geometry: fixed column pitch so the chart scrolls sideways rather than squeezing.
  const BAR = 6, GAP = 2, H = 200, TOP = 8, BOTTOM = 22;
  const W = years.length * (BAR + GAP);
  const yScale = (n) => (n / max) * (H - TOP - BOTTOM);
  const nice = (() => { const step = 10 ** Math.floor(Math.log10(max)); const m = max / step; return (m <= 2 ? 0.5 : m <= 5 ? 1 : 2) * step; })();
  const ticks = [];
  for (let v = 0; v <= max; v += nice) ticks.push(v);

  const svg = s('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': t.tlSubtitle });
  // War periods shaded behind the columns.
  for (const per of PERIODS) {
    const a = Math.max(first, Number((per.from || `${first}`).slice(0, 4)));
    const b = Math.min(last, Number((per.to || `${last}`).slice(0, 4)));
    if (b < first || a > last) continue;
    const active = state.period === per.key;
    svg.append(s('rect', { x: (a - first) * (BAR + GAP) - 1, y: TOP, width: (b - a + 1) * (BAR + GAP), height: H - TOP - BOTTOM,
      class: `tl-war${active ? ' active' : ''}` }));
  }
  for (const v of ticks) {
    const y = H - BOTTOM - yScale(v);
    svg.append(s('line', { x1: 0, x2: W, y1: y, y2: y, class: 'tl-grid' }));
  }
  // Rounded data-end, square at the baseline; 2px surface gap between stacked segments.
  const column = (x, y0, h, cls, roundTop) => {
    if (h <= 0) return null;
    const r = roundTop ? Math.min(3, h, BAR / 2) : 0;
    const yTop = y0 - h;
    return s('path', { class: cls, d: `M${x},${y0} V${yTop + r} Q${x},${yTop} ${x + r},${yTop} H${x + BAR - r} Q${x + BAR},${yTop} ${x + BAR},${yTop + r} V${y0} Z` });
  };
  years.forEach((y, i) => {
    const v = byYear.get(y) || { soldier: 0, terror: 0 };
    const x = i * (BAR + GAP);
    const base = H - BOTTOM;
    // At least 2px so a year with a handful of names is still visible next to 1948.
    const hs = v.soldier ? Math.max(2, yScale(v.soldier)) : 0;
    const ht = v.terror ? Math.max(2, yScale(v.terror)) : 0;
    const gap = hs && ht ? 2 : 0;
    svg.append(column(x, base, hs, 'tl-bar soldier', !ht) || '');
    svg.append(column(x, base - hs - gap, ht, 'tl-bar terror', true) || '');
    if (y % 10 === 0) svg.append(s('text', { x: x + BAR / 2, y: H - 6, class: 'tl-label', 'text-anchor': 'middle' }, document.createTextNode(String(y))));
    if (y === state.year) svg.append(s('rect', { x: x - 1, y: TOP, width: BAR + 2, height: H - TOP - BOTTOM, class: 'tl-sel' }));
  });
  // Wide invisible hit targets, one per year.
  years.forEach((y, i) => {
    const hit = s('rect', { x: i * (BAR + GAP) - 1, y: 0, width: BAR + GAP + 2, height: H, class: 'tl-hit' });
    hit.addEventListener('pointerenter', () => showTip(y, byYear.get(y), i * (BAR + GAP)));
    hit.addEventListener('click', () => showTip(y, byYear.get(y), i * (BAR + GAP), true));
    svg.append(hit);
  });
  $('#tl-chart').replaceChildren(svg);
  $('#tl-axis').replaceChildren(...ticks.map((v) => el('span', { style: `bottom:${BOTTOM + yScale(v) - 7}px` }, v >= 1000 ? `${v / 1000}K` : String(v))));
  $('#tl-axis').style.height = `${H}px`;

  // Start at the most recent years; when a war is chosen, bring it into view.
  const sc = $('#tl-scroll');
  const per = PERIODS.find((x) => x.key === state.period);
  if (per) {
    const mid = (Number((per.from || `${first}`).slice(0, 4)) + Number((per.to || `${last}`).slice(0, 4))) / 2;
    requestAnimationFrame(() => { sc.scrollLeft = (mid - first) * (BAR + GAP) - sc.clientWidth / 2; });
  } else if (sc.dataset.scrolled !== state.period) {
    requestAnimationFrame(() => { sc.scrollLeft = sc.scrollWidth; });
  }
  sc.dataset.scrolled = state.period;

  // Table view.
  const tableOpen = !$('#tl-table').hidden;
  $('#tl-table-btn').textContent = tableOpen ? t.hideTable : t.showTable;
  if (tableOpen) {
    const rows = years.filter((y) => byYear.get(y)).reverse().map((y) => {
      const v = byYear.get(y);
      return el('tr', {}, el('td', {}, String(y)), el('td', {}, fmtNum(v.soldier, L)), el('td', {}, fmtNum(v.terror, L)), el('td', {}, fmtNum(v.soldier + v.terror, L)));
    });
    $('#tl-table').replaceChildren(el('table', {},
      el('thead', {}, el('tr', {}, el('th', {}, t.year), el('th', {}, t.soldierShort), el('th', {}, t.terrorShort), el('th', {}, t.total))),
      el('tbody', {}, ...rows)));
  }

  function showTip(y, v = { soldier: 0, terror: 0 }, x, pinned) {
    const tip = $('#tl-tip');
    const total = v.soldier + v.terror;
    tip.replaceChildren(
      el('strong', {}, t.tlYear(y)),
      el('span', {}, `${t.total}: ${fmtNum(total, L)}`),
      v.soldier ? el('span', {}, el('span', { class: 'tl-swatch soldier' }), `${t.soldierShort}: ${fmtNum(v.soldier, L)}`) : null,
      v.terror ? el('span', {}, el('span', { class: 'tl-swatch terror' }), `${t.terrorShort}: ${fmtNum(v.terror, L)}`) : null,
      total && pinned ? el('button', { class: 'chip-btn', type: 'button', onclick: () => { state.year = y; state.query = ''; $('#search').value = ''; state.view = 'search'; render(); window.scrollTo({ top: 0 }); } }, t.showNames) : null,
    );
    tip.hidden = false;
  }
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

  const all = allOn(state.date);
  renderPeriods($('#today-periods'), all);
  const list = all.filter(passes).sort((a, b) => a.died.localeCompare(b.died));
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
  $('#tl-table-btn').addEventListener('click', () => { $('#tl-table').hidden = !$('#tl-table').hidden; renderTimeline(); });
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

// Mini App: расписание Б-ЭО-26.
// Расписание и расчёты — те же модули, что у бота: при сборке tgcloud/lib/ копируется в dist/lib/.

import {
  DAY_NAMES, DAY_SHORT, addDays, bell, dateRange, dayMonth, dayStatus, duration, hhmm,
  inSemester, isSemesterWeek, isoDate, minutesNow, mondayOf, outOfSemester, pairsFor,
  parityWord, parseDate, plural, shortType, today, weekNumber, weekday,
} from './lib/schedule.js';

const tg = window.Telegram?.WebApp;
// telegram-web-app.js ставит platform 'unknown', если страницу открыли не в Telegram.
const inTelegram = Boolean(tg) && tg.platform !== 'unknown';
const $ = (id) => document.getElementById(id);

const state = { view: 'day', date: firstDay() };

/** С чего открываться: сегодня, а в воскресенье (пар нет) — понедельник. */
function firstDay() {
  const t = today();
  return weekday(t) === 7 ? addDays(t, 1) : t;
}

// --- Мелочи ---

function esc(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function cap(text) {
  return text[0].toUpperCase() + text.slice(1);
}

function same(a, b) {
  return a.getTime() === b.getTime();
}

function relativeLabel(date) {
  const diff = Math.round((date.getTime() - today().getTime()) / 86400000);
  return { [-1]: 'Вчера', 0: 'Сегодня', 1: 'Завтра' }[diff];
}

function pairsWord(n) {
  return `${n} ${plural(n, 'пара', 'пары', 'пар')}`;
}

/** 'Физика (подгр. А)' → { name: 'Физика', subgroup: 'подгр. А' } */
function splitSubgroup(subject) {
  const match = /^(.*?)\s*\((подгр\.[^)]*)\)$/.exec(subject);
  return match ? { name: match[1], subgroup: match[2] } : { name: subject, subgroup: null };
}

function typeClass(type) {
  if (type.startsWith('лек')) return 'lec';
  if (type.startsWith('практ')) return 'prac';
  if (type.startsWith('лаб')) return 'lab';
  return '';
}

function roomHtml(room) {
  return room ? `${/онлайн/i.test(room) ? '💻' : '📍'} ${esc(room)}` : '';
}

/** Следующий/предыдущий учебный день: воскресенье пропускаем. */
function stepDay(date, forward) {
  const wd = weekday(date);
  return addDays(date, forward ? (wd === 6 ? 2 : 1) : (wd === 1 ? -2 : -1));
}

// --- День ---

function emptyHtml(big, title, text = '') {
  return `<div class="empty">${big ? `<div class="big">${big}</div>` : ''}<b>${esc(title)}</b>${text ? `<p>${esc(text)}</p>` : ''}</div>`;
}

function statusHtml(status, minutes) {
  if (status.kind === 'done') {
    return `<div class="card status done"><span class="icon">✅</span><div><div class="what">На сегодня всё</div><div class="main">Пары закончились</div></div></div>`;
  }
  const { name } = splitSubgroup(status.pair.subject);
  const room = status.pair.room ? ` · ${roomHtml(status.pair.room)}` : '';
  if (status.kind === 'now') {
    return `<div class="card status now"><span class="icon">🟢</span><div>
      <div class="what">Идёт ${status.pair.n}-я пара · ещё ${duration(status.end - minutes)}</div>
      <div class="main">${esc(name)}${room}</div></div></div>`;
  }
  return `<div class="card status next"><span class="icon">⏳</span><div>
    <div class="what">${status.first ? 'Первая' : 'Следующая'} пара через ${duration(status.start - minutes)}</div>
    <div class="main">${hhmm(status.start)} · ${esc(name)}${room}</div></div></div>`;
}

function pairHtml(p, when, minutes) {
  const time = bell(p.n);
  const { name, subgroup } = splitSubgroup(p.subject);
  const chips = (p.type ? p.type.split(', ') : []).map((t) => `<span class="chip ${typeClass(t)}">${esc(t)}</span>`);
  if (subgroup) chips.push(`<span class="chip">${esc(subgroup)}</span>`);
  const progress = when === 'now' && time
    ? `<div class="progress"><div style="width:${Math.round(((minutes - time.start) / (time.end - time.start)) * 100)}%"></div></div>`
    : '';

  return `<li class="pair card ${when}">
    <div class="time">${time ? `<b>${hhmm(time.start)}</b><span>${hhmm(time.end)}</span>` : ''}<span class="n">${p.n} пара</span></div>
    <div class="info">
      <div class="subject">${esc(name)}</div>
      <div class="meta">${chips.join('')}${p.room ? `<span class="room">${roomHtml(p.room)}</span>` : ''}</div>
      ${p.teacher ? `<div class="teacher">${esc(p.teacher)}</div>` : ''}
    </div>${progress}
  </li>`;
}

function gapHtml(fromN, toN) {
  const from = bell(fromN);
  const to = bell(toN);
  return `<li class="gap">окно${from && to ? ` ${hhmm(from.start)}–${hhmm(to.end)}` : ''}</li>`;
}

function dayHtml(date) {
  const label = relativeLabel(date);
  const title = `<h1 class="day-title">${cap(DAY_NAMES[weekday(date) - 1])}, ${dayMonth(date)}${label ? ` <span class="badge">${label}</span>` : ''}</h1>`;
  if (!inSemester(date)) return title + emptyHtml('', outOfSemester(date));

  const pairs = pairsFor(date);
  if (pairs.length === 0) {
    return `${title}<p class="summary">${weekNumber(date)}-я неделя, ${parityWord(date)}</p>${emptyHtml('🎉', 'Пар нет', 'Можно отдыхать')}`;
  }

  const first = bell(pairs[0].n);
  const last = bell(pairs[pairs.length - 1].n);
  const span = first && last ? ` · ${hhmm(first.start)}–${hhmm(last.end)}` : '';
  const isToday = label === 'Сегодня';
  const minutes = minutesNow();
  const status = isToday ? dayStatus(pairs, minutes) : null;

  const items = [];
  pairs.forEach((p, i) => {
    const prev = pairs[i - 1];
    if (prev && p.n - prev.n > 1) items.push(gapHtml(prev.n + 1, p.n - 1));
    const time = bell(p.n);
    let when = '';
    if (isToday && time) when = minutes >= time.end ? 'past' : minutes >= time.start ? 'now' : '';
    items.push(pairHtml(p, when, minutes));
  });

  return `${title}<p class="summary">${pairsWord(pairs.length)}${span}</p>${status ? statusHtml(status, minutes) : ''}<ol class="pairs">${items.join('')}</ol>`;
}

// --- Неделя ---

function weekHtml(date) {
  const monday = mondayOf(date);
  if (!isSemesterWeek(monday)) return emptyHtml('', outOfSemester(monday));

  const now = today();
  const sections = [];
  for (let i = 0; i < 7; i++) {
    const day = addDays(monday, i);
    const pairs = pairsFor(day);
    if (i === 6 && pairs.length === 0) continue; // пустое воскресенье не показываем

    const isToday = same(day, now);
    const rows = pairs.map((p) => {
      const time = bell(p.n);
      const type = p.type ? ` <span class="t">${esc(shortType(p.type))}</span>` : '';
      return `<li><b>${time ? hhmm(time.start) : `${p.n}.`}</b><span>${esc(p.subject)}${type}</span><span class="r">${esc(p.room ?? '')}</span></li>`;
    });
    sections.push(`<section class="wday card${isToday ? ' is-today' : ''}">
      <button class="wday-head" type="button" data-date="${isoDate(day)}">${cap(DAY_NAMES[i])}, ${dayMonth(day)}${isToday ? ' <span class="badge">Сегодня</span>' : ''}<span class="chev">${pairs.length ? pairsWord(pairs.length) : ''} ›</span></button>
      ${rows.length ? `<ul>${rows.join('')}</ul>` : '<p class="none">Пар нет</p>'}
    </section>`);
  }
  return `<div class="week">${sections.join('')}</div>`;
}

// --- Шапка и отрисовка ---

function renderHead() {
  const monday = mondayOf(state.date);
  $('week-range').textContent = dateRange(monday, addDays(monday, 6));
  $('week-info').textContent = isSemesterWeek(monday)
    ? `${weekNumber(monday)}-я неделя · ${parityWord(monday)}`
    : 'вне семестра';

  const now = today();
  $('strip').innerHTML = DAY_SHORT.slice(0, 6).map((short, i) => {
    const day = addDays(monday, i);
    const count = pairsFor(day).length;
    const cls = ['day', same(day, now) && 'today', state.view === 'day' && same(day, state.date) && 'selected'];
    const label = `${cap(DAY_NAMES[i])}, ${dayMonth(day)}: ${count ? pairsWord(count) : 'пар нет'}`;
    return `<button type="button" class="${cls.filter(Boolean).join(' ')}" data-date="${isoDate(day)}" aria-label="${label}">
      <span class="dow">${short}</span><span class="num">${day.getUTCDate()}</span><span class="dots">${'<i></i>'.repeat(Math.min(count, 5))}</span>
    </button>`;
  }).join('');

  for (const tab of document.querySelectorAll('[data-view]')) {
    tab.setAttribute('aria-selected', String(tab.dataset.view === state.view));
  }
  const home = firstDay();
  $('to-today').hidden = state.view === 'day'
    ? same(state.date, home)
    : same(mondayOf(state.date), mondayOf(home));
}

function render() {
  renderHead();
  $('content').innerHTML = state.view === 'day' ? dayHtml(state.date) : weekHtml(state.date);
}

function haptic() {
  try {
    if (tg?.isVersionAtLeast?.('6.1')) tg.HapticFeedback.selectionChanged();
  } catch {
    // вне Telegram или старый клиент — без вибрации
  }
}

function go(date, view = state.view) {
  if (same(date, state.date) && view === state.view) return;
  state.date = date;
  state.view = view;
  haptic();
  render();
  window.scrollTo(0, 0);
}

// --- События ---

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-date], [data-view], #prev-week, #next-week, #to-today');
  if (!el) return;
  if (el.dataset.date) go(parseDate(el.dataset.date), 'day');
  else if (el.dataset.view) go(state.date, el.dataset.view);
  else if (el.id === 'prev-week') go(addDays(state.date, -7));
  else if (el.id === 'next-week') go(addDays(state.date, 7));
  else if (el.id === 'to-today') go(firstDay());
});

document.addEventListener('keydown', (e) => {
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
  const forward = e.key === 'ArrowRight';
  go(state.view === 'week' ? addDays(state.date, forward ? 7 : -7) : stepDay(state.date, forward));
});

// Свайп влево/вправо: по полоске дней — неделя, по расписанию — день (или неделя в режиме «Неделя»).
let touch = null;
document.addEventListener('touchstart', (e) => {
  const t = e.touches[0];
  touch = { x: t.clientX, y: t.clientY, strip: Boolean(e.target.closest('#strip')) };
}, { passive: true });
document.addEventListener('touchend', (e) => {
  if (!touch) return;
  const t = e.changedTouches[0];
  const dx = t.clientX - touch.x;
  const dy = t.clientY - touch.y;
  const { strip } = touch;
  touch = null;
  if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
  const forward = dx < 0;
  if (strip || state.view === 'week') go(addDays(state.date, forward ? 7 : -7));
  else go(stepDay(state.date, forward));
}, { passive: true });

// «Что сейчас» живое: раз в 30 секунд и при возвращении в приложение.
let lastToday = today();
function tick() {
  const now = today();
  if (!same(now, lastToday)) {
    // наступил новый день: кто смотрел «сегодня», переезжает на новое «сегодня»
    if (same(state.date, lastToday)) state.date = firstDay();
    lastToday = now;
    render();
  } else if (state.view === 'day' && same(state.date, now)) {
    render();
  }
}
setInterval(tick, 30_000);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) tick();
});

// --- Telegram ---

function applyScheme() {
  const dark = inTelegram ? tg.colorScheme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.dataset.scheme = dark ? 'dark' : 'light';
}

applyScheme();
if (inTelegram) {
  tg.ready();
  tg.expand();
  if (tg.isVersionAtLeast('6.1')) {
    tg.setHeaderColor('secondary_bg_color');
    tg.setBackgroundColor('secondary_bg_color');
  }
  tg.onEvent('themeChanged', applyScheme);
} else {
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', applyScheme);
}

render();

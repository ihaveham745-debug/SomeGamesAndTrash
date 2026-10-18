// Mini App: расписание уроков выбранного класса и профиля (10а / 10б × сэ / тех / ен / гум).
// Расписание и расчёты — те же модули, что у бота: при сборке они копируются в dist/lib/.

import {
  DAY_NAMES, DAY_SHORT, SCHOOL_DAYS, addDays, bell, dateRange, dayMonth, dayStatus, duration, hhmm,
  inYear, isClass, isYearWeek, isoDate, lessonsFor, lessonsWord, minutesNow, mondayOf, outOfYear,
  parseDate, schoolDay, stepDay, today, weekday,
} from './lib/schedule.js';
import { CLASSES, classLabel, groupLabel } from './lib/school.js';
import {
  MAX_FILE_MB, MAX_NOTE_LENGTH, cleanText, fileLabel, groupOf, homeworkFor, nextLessonDate, subjectsOf,
} from './lib/homework.js';

const tg = window.Telegram?.WebApp;
// telegram-web-app.js ставит platform 'unknown', если страницу открыли не в Telegram.
const inTelegram = Boolean(tg) && tg.platform !== 'unknown';
const $ = (id) => document.getElementById(id);

const CLASS_KEY = 'school.class.v2'; // v1 хранил только профиль ('gum')
const state = { view: 'day', date: firstDay(), cls: savedClass(), notes: [], me: null };

// Записывать и удалять задания можно только из Telegram: сервер проверяет, кто это.
const canWrite = inTelegram && Boolean(tg.initData) && typeof tg.Serverless?.call === 'function';

/** Вызов функции бота (tgcloud/endpoints/<name>.js). */
function callBot(name, input = {}) {
  return new Promise((resolve, reject) => {
    tg.Serverless.call(name, input, (err, result) => (err ? reject(err) : resolve(result)));
  });
}

function savedClass() {
  try {
    const cls = localStorage.getItem(CLASS_KEY);
    return isClass(cls) ? cls : null;
  } catch {
    return null;
  }
}

function rememberClass(cls) {
  try {
    localStorage.setItem(CLASS_KEY, cls);
  } catch {
    // приватный режим — просто не запомним
  }
}

async function loadNotes() {
  if (!canWrite || !state.cls) return;
  const cls = state.cls;
  try {
    const { notes, me } = await callBot('listNotes', { cls });
    if (cls !== state.cls) return; // пока грузили, класс сменили
    state.notes = notes;
    state.me = me;
    render();
  } catch (err) {
    console.warn('listNotes failed', err);
  }
}

/** Класс из бота: если в личке уже выбран — берём его. */
async function loadClass() {
  if (!canWrite) return;
  try {
    const { cls } = await callBot('getClass');
    if (isClass(cls) && cls !== state.cls) setClass(cls, { sync: false });
  } catch (err) {
    console.warn('getClass failed', err);
  }
}

function setClass(cls, { sync = true } = {}) {
  const changed = cls !== state.cls;
  state.cls = cls;
  rememberClass(cls);
  if (changed) state.notes = [];
  render('fade');
  if (changed) loadNotes();
  if (sync && canWrite) callBot('setClass', { cls }).catch((err) => console.warn('setClass failed', err));
}

/** С чего открываться: сегодня, а в выходные — понедельник. */
function firstDay() {
  return schoolDay(today());
}

// Значки в духе SF Symbols.
const ICON = {
  clip: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m20 11.5-7.8 7.8a5 5 0 0 1-7.1-7.1l8.2-8.2a3.4 3.4 0 0 1 4.8 4.8l-8.1 8.1a1.7 1.7 0 0 1-2.4-2.4l7.4-7.4"/></svg>',
  pin: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0C18.5 15.4 12 21 12 21z"/><circle cx="12" cy="10" r="2.3"/></svg>',
  clock: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>',
  check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 12.5 4 4 8-9"/></svg>',
  chevron: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9.5 6 6 6-6 6"/></svg>',
  plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  trash: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12"/></svg>',
};

// --- Мелочи ---

function esc(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Всё строчными (лапслок): названия дней не капитализируем.
function cap(text) {
  return text;
}

function same(a, b) {
  return a.getTime() === b.getTime();
}

function relativeLabel(date) {
  const diff = Math.round((date.getTime() - today().getTime()) / 86400000);
  return { [-1]: 'вчера', 0: 'сегодня', 1: 'завтра' }[diff];
}

function placeHtml(room) {
  return `<span class="place">${ICON.pin}${esc(/^\d/.test(room) ? `каб. ${room}` : room)}</span>`;
}

// --- День ---

function emptyHtml(title, text = '') {
  return `<div class="empty"><b>${esc(title)}</b>${text ? `<p>${esc(text)}</p>` : ''}</div>`;
}

function outOfYearHtml(date) {
  return emptyHtml(outOfYear(date));
}

function noClassHtml() {
  return emptyHtml('выбери свой класс', 'нажми «выбрать класс» вверху — покажу твои уроки');
}

function statusHtml(status, minutes) {
  if (status.kind === 'done') {
    return `<div class="status glass"><span class="symbol done">${ICON.check}</span><div>
      <div class="what">на сегодня всё</div><div class="main">уроки закончились</div></div></div>`;
  }
  const name = status.lesson.subject;
  if (status.kind === 'now') {
    return `<div class="status glass now"><span class="live"><i></i></span><div>
      <div class="what">идёт ${status.lesson.n}-й урок · ещё ${duration(status.end - minutes)}</div>
      <div class="main">${esc(name)}</div></div></div>`;
  }
  return `<div class="status glass"><span class="symbol next">${ICON.clock}</span><div>
    <div class="what">${status.first ? 'первый' : 'следующий'} урок через ${duration(status.start - minutes)}</div>
    <div class="main">${hhmm(status.start)} · ${esc(name)}</div></div></div>`;
}

function noteItemHtml(n) {
  const mine = state.me !== null && n.authorId === state.me;
  const by = n.private ? 'только ты' : n.authorName;
  return `<div class="hw-item${n.private ? ' private' : ''}">
    <div class="hw-body">${n.text ? `<div class="hw-text">${esc(n.text)}</div>` : ''}${n.fileId
      ? `<button class="hw-file press" type="button" data-file="${n.id}">${ICON.clip}<span>${esc(fileLabel(n))}</span></button>` : ''}${by ? `<div class="hw-by">${esc(by)}</div>` : ''}</div>
    ${mine ? `<button class="hw-del press" type="button" data-del="${n.id}" aria-label="удалить">${ICON.trash}</button>` : ''}
  </div>`;
}

function lessonHomeworkHtml(p, iso) {
  const items = homeworkFor(state.notes, iso, p.subject);
  if (!items.length && !canWrite) return '';
  const add = canWrite
    ? `<button class="hw-add press" type="button" data-add="hw" data-subject="${esc(p.subject)}" data-due="${iso}">${ICON.plus}дз</button>`
    : '';
  return `<div class="hw">${items.map(noteItemHtml).join('')}${add}</div>`;
}

function lessonHtml(p, when, minutes, iso) {
  const time = bell(p.n);
  const chips = p.type ? [`<span class="chip base">${esc(p.type)}</span>`] : [];
  const progress = when === 'now' && time
    ? `<div class="progress"><div style="width:${Math.round(((minutes - time.start) / (time.end - time.start)) * 100)}%"></div></div>`
    : '';

  return `<li class="pair glass ${when}">
    <div class="time">${time ? `<b>${hhmm(time.start)}</b><span>${hhmm(time.end)}</span>` : ''}<span class="n">${p.n} урок</span></div>
    <div class="info">
      <div class="subject">${esc(p.subject)}</div>
      <div class="meta">${chips.join('')}${p.room ? placeHtml(p.room) : ''}</div>
      ${lessonHomeworkHtml(p, iso)}
    </div>${progress}
  </li>`;
}

function gapHtml(fromN, toN) {
  const from = bell(fromN);
  const to = bell(toN);
  return `<li class="gap"><span class="glass">окно${from && to ? ` ${hhmm(from.start)}–${hhmm(to.end)}` : ''}</span></li>`;
}

function dayHtml(date) {
  const label = relativeLabel(date);
  const title = `<h2 class="day-title">${cap(DAY_NAMES[weekday(date) - 1])}, ${dayMonth(date)}${label ? ` <span class="badge">${label}</span>` : ''}</h2>`;
  if (!state.cls) return `<div class="day-head">${title}</div>${noClassHtml()}`;
  if (!inYear(date)) return `<div class="day-head">${title}</div>${outOfYearHtml(date)}`;

  const lessons = lessonsFor(state.cls, date);
  if (lessons.length === 0) {
    return `<div class="day-head">${title}</div>${emptyHtml('уроков нет', 'можно отдыхать')}`;
  }

  const first = bell(lessons[0].n);
  const last = bell(lessons[lessons.length - 1].n);
  const span = first && last ? ` · ${hhmm(first.start)}–${hhmm(last.end)}` : '';
  const isToday = label === 'сегодня';
  const minutes = minutesNow();
  const status = isToday ? dayStatus(lessons, minutes) : null;

  const items = [];
  lessons.forEach((p, i) => {
    const prev = lessons[i - 1];
    if (prev && p.n - prev.n > 1) items.push(gapHtml(prev.n + 1, p.n - 1));
    const time = bell(p.n);
    let when = '';
    if (isToday && time) when = minutes >= time.end ? 'past' : minutes >= time.start ? 'now' : '';
    items.push(lessonHtml(p, when, minutes, isoDate(date)));
  });

  return `<div class="day-head">${title}<p class="summary">${lessonsWord(lessons.length)}${span}</p></div>
    ${status ? statusHtml(status, minutes) : ''}<ol class="pairs">${items.join('')}</ol>`;
}

// --- Неделя ---

function weekHtml(date) {
  if (!state.cls) return noClassHtml();
  const monday = mondayOf(date);
  if (!isYearWeek(monday)) return outOfYearHtml(monday);

  const now = today();
  const sections = [];
  for (let i = 0; i < SCHOOL_DAYS; i++) {
    const day = addDays(monday, i);
    const lessons = lessonsFor(state.cls, day);
    const isToday = same(day, now);
    const rows = lessons.map((p) => {
      const time = bell(p.n);
      const type = p.type ? ` <span class="t">${esc(p.type)}</span>` : '';
      const hw = homeworkFor(state.notes, isoDate(day), p.subject).length ? ' <span class="hw-mark">· дз</span>' : '';
      return `<li><b>${time ? hhmm(time.start) : `${p.n}.`}</b><span>${esc(p.subject)}${type}${hw}</span><span class="r">${esc(p.room ?? '')}</span></li>`;
    });
    sections.push(`<section class="wday glass${isToday ? ' is-today' : ''}">
      <button class="wday-head" type="button" data-date="${isoDate(day)}">
        <span class="name">${cap(DAY_NAMES[i])}, ${dayMonth(day)}</span>${isToday ? '<span class="badge">сегодня</span>' : ''}
        <span class="more">${lessons.length ? lessonsWord(lessons.length) : ''}${ICON.chevron}</span>
      </button>
      ${rows.length ? `<ul>${rows.join('')}</ul>` : '<p class="none">уроков нет</p>'}
    </section>`);
  }
  return `<div class="week">${sections.join('')}</div>`;
}

// --- Задания ---

function tasksHtml() {
  if (!state.cls) return noClassHtml();
  const from = isoDate(today());
  const tasks = state.notes.filter((n) => n.due && n.due >= from).sort((a, b) => a.due.localeCompare(b.due) || a.id - b.id);
  const notes = state.notes.filter((n) => !n.due).sort((a, b) => a.subject.localeCompare(b.subject, 'ru') || a.id - b.id);

  const head = `<div class="day-head"><h2 class="day-title">задания</h2>
    <p class="summary">${esc(classLabel(state.cls))} · общие уроки — для всего класса, профильные — для всей группы</p></div>
    ${canWrite ? `<div class="actions">
      <button class="action glass press" type="button" data-add="hw">${ICON.plus}задание</button>
      <button class="action glass press" type="button" data-add="note">${ICON.plus}заметка</button>
    </div>` : ''}`;
  if (!canWrite) {
    return head + emptyHtml('открой из telegram', 'задания хранятся у бота — их видно в приложении, открытом из чата с ботом');
  }

  const byDate = new Map();
  for (const n of tasks) byDate.set(n.due, [...(byDate.get(n.due) ?? []), n]);
  const taskCards = [...byDate].map(([due, list]) => {
    const d = parseDate(due);
    const label = relativeLabel(d);
    return `<section class="wday glass">
      <button class="wday-head" type="button" data-date="${due}">
        <span class="name">${cap(DAY_NAMES[weekday(d) - 1])}, ${dayMonth(d)}</span>${label ? `<span class="badge">${label}</span>` : ''}
        <span class="more">${ICON.chevron}</span>
      </button>
      <div class="note-list">${list.map((n) => `<div class="note-subject">${esc(n.subject)}</div>${noteItemHtml(n)}`).join('')}</div>
    </section>`;
  });

  const bySubject = new Map();
  for (const n of notes) bySubject.set(n.subject, [...(bySubject.get(n.subject) ?? []), n]);
  const noteCards = [...bySubject].map(([subject, list]) => `<section class="wday glass">
    <div class="wday-head static"><span class="name">${esc(subject)}</span></div>
    <div class="note-list">${list.map(noteItemHtml).join('')}</div>
  </section>`);

  return `${head}
    <h3 class="section">домашние задания</h3>
    ${taskCards.length ? `<div class="week">${taskCards.join('')}</div>` : '<p class="muted">пока ничего не задано</p>'}
    <h3 class="section">заметки по предметам</h3>
    ${noteCards.length ? `<div class="week">${noteCards.join('')}</div>` : '<p class="muted">заметок пока нет</p>'}`;
}

// --- Окна (выбор класса и добавление записи) ---

function openSheet(html) {
  closeSheet();
  const root = document.createElement('div');
  root.className = 'sheet-backdrop';
  root.innerHTML = html;
  document.body.append(root);
  root.addEventListener('click', (e) => {
    if (e.target === root || e.target.closest('[data-close]')) closeSheet();
  });
  return root;
}

function openClassPicker() {
  const grades = {};
  for (const [id, c] of Object.entries(CLASSES)) {
    (grades[c.grade] ??= []).push(`<button type="button" class="class-option press${id === state.cls ? ' current' : ''}" data-pick="${id}">
      <span class="short">${esc(c.short)}</span><small>${esc(c.profile)}</small>
    </button>`);
  }
  const sections = Object.entries(grades).map(([grade, options]) => `<div class="class-grade">
      <div class="class-grade-name">${esc(grade)}</div>
      <div class="class-list">${options.join('')}</div>
    </div>`).join('');
  const root = openSheet(`<div class="sheet glass blur">
    <div class="sheet-title">твой класс и профиль</div>
    ${sections}
    ${state.cls ? '<div class="sheet-buttons"><button class="btn press" type="button" data-close>отмена</button></div>' : ''}
  </div>`);
  root.addEventListener('click', (e) => {
    const pick = e.target.closest('[data-pick]');
    if (!pick) return;
    closeSheet();
    haptic();
    setClass(pick.dataset.pick);
  });
}

function openComposer({ kind, subject = null, due = null }) {
  const cls = state.cls;
  const fixed = Boolean(subject && due);
  const options = subjectsOf(cls).map((s) => `<option${s === subject ? ' selected' : ''}>${esc(s)}</option>`).join('');
  const root = openSheet(`<form class="sheet glass blur" autocomplete="off">
    <div class="sheet-title">${kind === 'hw' ? 'домашнее задание' : 'заметка к предмету'} · ${esc(classLabel(cls))}</div>
    ${fixed ? `<div class="sheet-subject">${esc(subject)}</div>`
      : `<select class="field" name="subject"><option value="" disabled${subject ? '' : ' selected'}>предмет…</option>${options}</select>`}
    <div class="sheet-due"></div>
    <textarea class="field" name="text" rows="4" maxlength="${MAX_NOTE_LENGTH}"
      placeholder="${kind === 'hw' ? 'что задали? например: №5–10, стр. 42' : 'например: формулы на стр. 12'}"></textarea>
    <div class="attach">
      <button class="attach-btn press" type="button" data-pick-file>${ICON.clip}<span>прикрепить файл</span></button>
      <button class="attach-clear press" type="button" data-clear-file hidden aria-label="убрать файл">×</button>
      <input type="file" name="file" hidden>
    </div>
    <label class="private-toggle">
      <span><b>только мне</b><small class="who"></small></span>
      <input type="checkbox" name="private" role="switch">
    </label>
    <div class="sheet-error" role="alert"></div>
    <div class="sheet-buttons">
      <button class="btn press" type="button" data-close>отмена</button>
      <button class="btn primary press" type="submit">сохранить</button>
    </div>
  </form>`);

  const form = root.querySelector('form');
  const dueBox = root.querySelector('.sheet-due');
  let currentDue = due;
  const updateDue = () => {
    if (kind !== 'hw') return;
    const subj = fixed ? subject : form.subject.value;
    if (!fixed) currentDue = subj ? isoDate(nextLessonDate(cls, subj) ?? today()) : null;
    if (!subj) {
      dueBox.textContent = 'запишется к ближайшему уроку по предмету';
    } else if (currentDue) {
      const d = parseDate(currentDue);
      dueBox.textContent = `к уроку: ${DAY_NAMES[weekday(d) - 1]}, ${dayMonth(d)}`;
    }
  };
  // Кто увидит запись: общий урок — весь класс, профильный — вся группа из обоих классов.
  const whoBox = root.querySelector('.who');
  const updateWho = () => {
    const subj = fixed ? subject : form.subject.value;
    const group = subj ? groupOf(cls, subj) : null;
    if (form.private.checked) whoBox.textContent = 'увидишь только ты';
    else if (!group) whoBox.textContent = 'выключено — увидят одноклассники';
    else if (group === 'a' || group === 'b') whoBox.textContent = `выключено — увидит весь ${groupLabel(group)}`;
    else whoBox.textContent = `выключено — увидит группа «${groupLabel(group)}» из 10а и 10б`;
  };
  updateDue();
  updateWho();
  form.subject?.addEventListener('change', () => { updateDue(); updateWho(); });
  form.private.addEventListener('change', updateWho);
  form.text.focus();

  // Файл: один на запись, до MAX_FILE_MB.
  const error = root.querySelector('.sheet-error');
  const pickLabel = root.querySelector('[data-pick-file] span');
  const clearBtn = root.querySelector('[data-clear-file]');
  const fileInput = form.file;
  const showFile = () => {
    const f = fileInput.files[0];
    pickLabel.textContent = f ? f.name : 'прикрепить файл';
    clearBtn.hidden = !f;
  };
  root.querySelector('[data-pick-file]').addEventListener('click', () => fileInput.click());
  clearBtn.addEventListener('click', () => { fileInput.value = ''; showFile(); });
  fileInput.addEventListener('change', () => {
    const f = fileInput.files[0];
    if (f && f.size > MAX_FILE_MB * 1024 * 1024) {
      error.textContent = `файл больше ${MAX_FILE_MB} мб — пришли его боту в чат с подписью /dz предмет:`;
      fileInput.value = '';
    } else {
      error.textContent = '';
    }
    showFile();
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const subj = fixed ? subject : form.subject.value;
    const text = cleanText(form.text.value);
    const picked = fileInput.files[0];
    if (!subj) return void (error.textContent = 'выбери предмет');
    if (!text && !picked) return void (error.textContent = kind === 'hw' ? 'напиши, что задали, или прикрепи файл' : 'пустая заметка');
    const save = form.querySelector('[type="submit"]');
    save.disabled = true;
    if (picked) save.textContent = 'загружаю…';
    try {
      const file = picked ? { name: picked.name, type: picked.type, data: await readBase64(picked) } : undefined;
      const { note } = await callBot('addNote', {
        cls, subject: subj, due: kind === 'hw' ? currentDue : null, text, private: form.private.checked, file,
      });
      if (cls === state.cls) state.notes.push(note);
      try { tg.HapticFeedback?.notificationOccurred('success'); } catch { /* старый клиент */ }
      closeSheet();
      render();
    } catch (err) {
      error.textContent = err?.message || 'не получилось сохранить';
      save.disabled = false;
      save.textContent = 'сохранить';
    }
  });
}

/** Содержимое файла в base64 (без префикса data:…). */
function readBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(new Error('не получилось прочитать файл'));
    reader.readAsDataURL(file);
  });
}

function notify(text) {
  if (tg?.showAlert && inTelegram) tg.showAlert(text);
  else window.alert(text);
}

async function sendFileToChat(note) {
  try {
    await callBot('sendNoteFile', { id: note.id, cls: state.cls });
    try { tg.HapticFeedback?.notificationOccurred('success'); } catch { /* старый клиент */ }
    notify('отправил в чат с ботом');
  } catch (err) {
    notify(err?.message || 'не получилось отправить');
  }
}

/** Фото — превью прямо в приложении, остальное — бот присылает в чат. */
async function openFile(id) {
  const note = state.notes.find((n) => n.id === id);
  if (!note?.fileId || !canWrite) return;
  if (note.fileKind !== 'photo') {
    const ok = await new Promise((resolve) => {
      if (tg?.showConfirm && inTelegram) tg.showConfirm(`прислать «${fileLabel(note)}» в чат с ботом?`, resolve);
      else resolve(window.confirm(`прислать «${fileLabel(note)}» в чат с ботом?`));
    });
    if (ok) sendFileToChat(note);
    return;
  }
  const root = openSheet(`<div class="sheet glass blur">
    <div class="sheet-title">${esc(note.subject)}${note.text ? ` · ${esc(note.text)}` : ''}</div>
    <div class="photo-box"><span class="muted">загружаю фото…</span></div>
    <div class="sheet-buttons">
      <button class="btn press" type="button" data-close>закрыть</button>
      <button class="btn primary press" type="button" data-to-chat>в чат</button>
    </div>
  </div>`);
  root.querySelector('[data-to-chat]').addEventListener('click', () => sendFileToChat(note));
  try {
    const { type, data } = await callBot('noteFile', { id, cls: state.cls });
    const box = root.querySelector('.photo-box');
    if (box) box.innerHTML = `<img alt="" src="data:${type};base64,${data}">`;
  } catch (err) {
    const box = root.querySelector('.photo-box');
    if (box) box.innerHTML = `<span class="muted">${esc(err?.message || 'не получилось загрузить')} — нажми «в чат»</span>`;
  }
}

function closeSheet() {
  document.querySelector('.sheet-backdrop')?.remove();
}

async function deleteNote(id) {
  const ok = await new Promise((resolve) => {
    if (tg?.showConfirm && inTelegram) tg.showConfirm('удалить запись?', resolve);
    else resolve(window.confirm('удалить запись?'));
  });
  if (!ok) return;
  try {
    await callBot('deleteNote', { id });
    state.notes = state.notes.filter((n) => n.id !== id);
    render();
  } catch (err) {
    if (tg?.showAlert) tg.showAlert(err?.message || 'не получилось удалить');
  }
}

// --- Обои: у каждого свои ---
// Выбор хранится у бота (getWallpaper / setWallpaper) — на всех устройствах одинаковый.
// Своё фото: приложение уменьшает его и отправляет боту, а копию держит в localStorage,
// чтобы обои появлялись сразу, без загрузки.

const WALL_KEY = 'school.wall';
const WALL_IMG_KEY = 'school.wall.img';
const WALLS = [
  { kind: 'cats', name: 'котики' },
  { kind: 'glass', name: 'стекло' },
  { kind: 'photo', name: 'своё фото' },
];

function storeGet(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}

function storeSet(key, value) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
    return true;
  } catch {
    return false; // нет места или приватный режим — просто не закэшируем
  }
}

function cachedWall() {
  try {
    const wall = JSON.parse(storeGet(WALL_KEY) ?? 'null');
    if (wall?.kind) return wall;
  } catch { /* битый кэш */ }
  return { kind: 'cats', fileId: null };
}

/** Показать обои. img — data:-ссылка своего фото (для kind 'photo'). */
function applyWall(kind, img = null) {
  const el = document.querySelector('.wallpaper');
  el.classList.toggle('glass', kind === 'glass');
  if (kind === 'photo' && img) el.style.setProperty('--wall-img', `url("${img}")`);
  else el.style.removeProperty('--wall-img');
}

function rememberWall(wall, img) {
  storeSet(WALL_KEY, JSON.stringify({ kind: wall.kind, fileId: wall.fileId ?? null }));
  if (wall.kind === 'photo' && img) storeSet(WALL_IMG_KEY, img);
}

/** Сразу — из кэша, потом сверяемся с ботом (вдруг обои сменили на другом телефоне). */
async function loadWall() {
  const cached = cachedWall();
  const cachedImg = storeGet(WALL_IMG_KEY);
  applyWall(cached.kind, cachedImg);
  if (!canWrite) return;
  try {
    const wall = await callBot('getWallpaper');
    if (wall.fileId !== cached.fileId) storeSet(WALL_IMG_KEY, null); // фото сменили на другом телефоне
    if (wall.kind !== 'photo') {
      applyWall(wall.kind);
      rememberWall(wall);
      return;
    }
    if (wall.fileId === cached.fileId && cachedImg) {
      applyWall('photo', cachedImg);
      rememberWall(wall);
      return;
    }
    const { type, data } = await callBot('wallpaperImage');
    const img = `data:${type};base64,${data}`;
    applyWall('photo', img);
    rememberWall(wall, img);
  } catch (err) {
    console.warn('wallpaper load failed', err);
  }
}

/** Фото из галереи → картинка не больше 1280 px (jpeg), как data:-ссылка. */
function shrinkImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, 1280 / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('не получилось открыть картинку'));
    };
    img.src = url;
  });
}

function openWallPicker() {
  const current = cachedWall().kind;
  const myImg = storeGet(WALL_IMG_KEY);
  const tiles = WALLS.map((w) => {
    const style = w.kind === 'photo' && myImg ? ` style="background-image:url('${myImg}')"` : '';
    const inner = w.kind === 'photo' && !myImg ? '+' : '';
    return `<button type="button" class="wall-option press${w.kind === current ? ' current' : ''}" data-wall="${w.kind}">
      <span class="thumb ${w.kind}"${style}>${inner}</span>${esc(w.name)}
    </button>`;
  }).join('');
  const root = openSheet(`<div class="sheet glass blur">
    <div class="sheet-title">обои — только у тебя</div>
    <div class="wall-list">${tiles}</div>
    <input type="file" accept="image/*" name="wall-photo" hidden>
    <button class="attach-btn press" type="button" data-gallery>${ICON.plus}<span>${myImg ? 'другое фото из галереи' : 'выбрать фото из галереи'}</span></button>
    <div class="sheet-error" role="alert"></div>
    <div class="sheet-buttons"><button class="btn press" type="button" data-close>готово</button></div>
  </div>`);
  const input = root.querySelector('input[type="file"]');
  const error = root.querySelector('.sheet-error');
  const mark = (kind) => root.querySelectorAll('.wall-option').forEach((b) => b.classList.toggle('current', b.dataset.wall === kind));

  root.addEventListener('click', async (e) => {
    if (e.target.closest('[data-gallery]')) return void input.click();
    const opt = e.target.closest('[data-wall]');
    if (!opt) return;
    haptic();
    if (opt.dataset.wall === 'photo') {
      const img = storeGet(WALL_IMG_KEY);
      if (!img) return void input.click();
      // уже есть своё фото — просто возвращаемся к нему
      applyWall('photo', img);
      rememberWall({ kind: 'photo', fileId: cachedWall().fileId }, img);
      mark('photo');
      if (canWrite) callBot('setWallpaper', { kind: 'photo' }).catch((err) => console.warn('setWallpaper failed', err));
      return;
    }
    const kind = opt.dataset.wall;
    applyWall(kind);
    rememberWall({ kind, fileId: cachedWall().fileId });
    mark(kind);
    if (canWrite) callBot('setWallpaper', { kind }).catch((err) => console.warn('setWallpaper failed', err));
  });

  input.addEventListener('change', async () => {
    const file = input.files[0];
    input.value = '';
    if (!file) return;
    error.textContent = '';
    const before = cachedWall();
    const beforeImg = storeGet(WALL_IMG_KEY);
    try {
      const img = await shrinkImage(file);
      applyWall('photo', img);
      mark('photo');
      root.querySelector('.thumb.photo').style.backgroundImage = `url('${img}')`;
      root.querySelector('.thumb.photo').textContent = '';
      let wall = { kind: 'photo', fileId: null };
      if (canWrite) {
        error.textContent = 'сохраняю…';
        wall = await callBot('setWallpaper', {
          kind: 'photo', file: { name: 'wallpaper.jpg', type: 'image/jpeg', data: img.split(',')[1] },
        });
        error.textContent = '';
      }
      rememberWall(wall, img);
    } catch (err) {
      error.textContent = err?.message || 'не получилось поставить фото';
      applyWall(before.kind, beforeImg);
      mark(before.kind);
    }
  });
}

// --- Шапка, таб-бар и отрисовка ---

/** Двигает «каплю» под выбранный день и «линзу» под выбранную вкладку. */
function placeHighlights() {
  const drop = $('day-drop');
  const day = $('strip').querySelector('.day.selected');
  if (day) {
    drop.style.width = `${day.offsetWidth}px`;
    drop.style.transform = `translateX(${day.offsetLeft}px)`;
  }
  drop.classList.toggle('off', !day);

  const tab = document.querySelector(`.tab[data-view="${state.view}"]`);
  $('tab-lens').style.transform = `translateX(${tab.offsetLeft - 4}px)`;
}

function renderChrome() {
  const monday = mondayOf(state.date);
  $('week-range').textContent = dateRange(monday, addDays(monday, SCHOOL_DAYS - 1));
  $('class-label').textContent = state.cls ? classLabel(state.cls) : 'выбрать класс';

  const now = today();
  $('strip').innerHTML = DAY_SHORT.slice(0, SCHOOL_DAYS).map((short, i) => {
    const day = addDays(monday, i);
    const count = lessonsFor(state.cls, day).length;
    const cls = ['day', 'press', same(day, now) && 'today', state.view === 'day' && same(day, state.date) && 'selected'];
    const label = `${cap(DAY_NAMES[i])}, ${dayMonth(day)}: ${count ? lessonsWord(count) : 'уроков нет'}`;
    return `<button type="button" class="${cls.filter(Boolean).join(' ')}" data-date="${isoDate(day)}" aria-label="${label}">
      <span class="dow">${short}</span><span class="num">${day.getUTCDate()}</span><span class="dots">${'<i></i>'.repeat(Math.min(count, 7))}</span>
    </button>`;
  }).join('');

  for (const tab of document.querySelectorAll('.tab')) {
    tab.setAttribute('aria-selected', String(tab.dataset.view === state.view));
  }

  $('today-dow').textContent = DAY_SHORT[weekday(now) - 1];
  $('today-num').textContent = now.getUTCDate();
  $('to-today').classList.toggle('here', state.view === 'day' && same(state.date, firstDay()));
  $('to-today').setAttribute('aria-label', `сегодня, ${dayMonth(now)}`);

  placeHighlights();
}

/** anim: 'fwd' / 'back' — въезд справа/слева, 'fade' — проявление, 'still' — без анимации. */
function render(anim = 'still') {
  renderChrome();
  document.body.dataset.view = state.view;
  const html = { day: dayHtml, week: weekHtml, tasks: tasksHtml }[state.view](state.date);
  $('content').innerHTML = `<div class="view ${anim}">${html}</div>`;
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
  let anim = 'fade';
  if (view === state.view) anim = date > state.date ? 'fwd' : 'back';
  state.date = view === 'day' ? schoolDay(date) : date;
  state.view = view;
  haptic();
  render(anim);
  window.scrollTo(0, 0);
}

// --- События ---

document.addEventListener('click', (e) => {
  if (e.target.closest('.sheet-backdrop')) return;
  const el = e.target.closest('[data-add], [data-del], [data-file], [data-date], [data-view], #prev-week, #next-week, #to-today, #class-btn, #wall-btn');
  if (!el) return;
  if (el.dataset.file) openFile(Number(el.dataset.file));
  else if (el.dataset.add) openComposer({ kind: el.dataset.add, subject: el.dataset.subject, due: el.dataset.due });
  else if (el.dataset.del) deleteNote(Number(el.dataset.del));
  else if (el.dataset.date) go(parseDate(el.dataset.date), 'day');
  else if (el.dataset.view) go(state.date, el.dataset.view);
  else if (el.id === 'prev-week') go(addDays(state.date, -7));
  else if (el.id === 'next-week') go(addDays(state.date, 7));
  else if (el.id === 'to-today') go(firstDay(), 'day');
  else if (el.id === 'class-btn') openClassPicker();
  else if (el.id === 'wall-btn') openWallPicker();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && state.cls) closeSheet();
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
  if (e.target.closest?.('input, textarea, select') || state.view === 'tasks' || document.querySelector('.sheet-backdrop')) return;
  const forward = e.key === 'ArrowRight';
  go(state.view === 'week' ? addDays(state.date, forward ? 7 : -7) : stepDay(state.date, forward));
});

// Свайп влево/вправо: по полоске дней — неделя, по расписанию — день (или неделя в режиме «Неделя»).
let touch = null;
document.addEventListener('touchstart', (e) => {
  const t = e.touches[0];
  touch = e.target.closest('.sheet-backdrop') || state.view === 'tasks'
    ? null
    : { x: t.clientX, y: t.clientY, strip: Boolean(e.target.closest('.panel')) };
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

addEventListener('resize', placeHighlights);

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
  if (!document.hidden) {
    tick();
    loadNotes();
  }
});

// --- Тема и Telegram ---

function applyScheme() {
  // Всегда тёмная тема — под космические обои, какая бы тема ни стояла в Telegram.
  document.documentElement.dataset.scheme = 'dark';
  if (!inTelegram) return;
  // Шапку и фон Telegram красим в цвет нашего фона, чтобы не было шва.
  const base = getComputedStyle(document.documentElement).getPropertyValue('--base').trim();
  if (tg.isVersionAtLeast('6.1')) tg.setBackgroundColor(base);
  if (tg.isVersionAtLeast('6.9')) tg.setHeaderColor(base);
}

document.title = 'расписание 10-х классов';

applyScheme();
loadWall();
if (inTelegram) {
  tg.ready();
  tg.expand();
  tg.onEvent('themeChanged', applyScheme);
} else {
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', applyScheme);
}

// Первая отрисовка — без перетеканий, чтобы «капля» не выезжала из угла.
document.body.classList.add('no-anim');
render('fade');
requestAnimationFrame(() => requestAnimationFrame(() => document.body.classList.remove('no-anim')));
if (state.cls) loadNotes();
else if (!canWrite) openClassPicker();
// В Telegram сначала спрашиваем у бота: вдруг класс уже выбран в чате.
if (canWrite) loadClass().then(() => { if (!state.cls) openClassPicker(); });

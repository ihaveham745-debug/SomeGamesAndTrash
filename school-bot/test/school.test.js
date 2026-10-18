import assert from 'node:assert/strict';
import { test } from 'node:test';

import { BELLS, CLASSES, TIMETABLE } from '../tgcloud/lib/school.js';
import {
  dayStatus, formatBells, formatDay, formatWeek, lessonsFor, parseDate, schoolDay, stepDay, today,
} from '../tgcloud/lib/schedule.js';
import { findSubject, nextLessonDate, subjectsOf, validateNote } from '../tgcloud/lib/homework.js';
import { BUTTONS, actionFor, memoryPrefs, replyTo, viewFor } from '../tgcloud/lib/bot.js';

const day = (cls, iso) => lessonsFor(cls, parseDate(iso)).map((p) => `${p.n} ${p.subject}${p.type ? ` (${p.type})` : ''} ${p.room}`);
// Ср 14.10.2026, местное время → UTC (Якутск UTC+9)
const at = (iso, hh, mm = 0) => Date.parse(`${iso}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00+09:00`);

test('таблица целая: 4 профиля, 7 уроков в звонках, без накладок', () => {
  assert.deepEqual(Object.keys(CLASSES), ['se', 'tech', 'en', 'gum']);
  for (const cls of Object.keys(CLASSES)) {
    for (const d of [1, 2, 3, 4, 5]) {
      const lessons = TIMETABLE[cls][d];
      assert.ok(lessons.length >= 6, `${cls} день ${d}`);
      assert.equal(new Set(lessons.map((p) => p.n)).size, lessons.length, `${cls} день ${d}: накладка`);
      for (const p of lessons) {
        assert.ok(BELLS[p.n], `${cls} ${d} ${p.n}`);
        assert.ok(p.subject && p.room, `${cls} ${d} ${p.n}`);
      }
    }
    assert.equal(TIMETABLE[cls][6].length + TIMETABLE[cls][7].length, 0);
  }
});

test('уроки по профилям сверены с фото', () => {
  assert.deepEqual(day('se', '2026-10-19'), [
    '1 Обществознание 113', '2 Обществознание 113', '3 Английский язык 207', '4 Английский язык 207',
    '5 Разговоры о важном 210', '6 Математика 115', '7 Математика 115',
  ]);
  assert.deepEqual(day('en', '2026-10-19').slice(0, 2), ['1 Английский язык 114', '2 Химия 210']);
  assert.deepEqual(day('gum', '2026-10-20').slice(0, 3), ['1 Химия (база) 210', '2 Биология (база) 212', '3 Английский язык 111']);
  assert.deepEqual(day('tech', '2026-10-21').slice(2, 4), ['3 Физика 213', '4 Физика 213']);
  assert.deepEqual(day('en', '2026-10-22').slice(1, 4), ['2 Биохимия 210', '3 Химия 210', '4 Химия 210']);
  // пт: у сэ 7-го урока нет, у тех — физика; обществознание тех+ен в 113
  assert.equal(day('se', '2026-10-23').length, 6);
  assert.equal(day('tech', '2026-10-23').at(-1), '7 Физика 213');
  assert.equal(day('tech', '2026-10-23')[4], '5 Обществознание 113');
  assert.equal(day('en', '2026-10-23')[4], '5 Обществознание 113');
  assert.equal(day('gum', '2026-10-23')[5], '6 Деловой английский 114');
  assert.deepEqual(day('se', '2026-10-24'), []); // суббота
});

test('выходные и звонки', () => {
  assert.equal(schoolDay(parseDate('2026-10-24')).toISOString().slice(0, 10), '2026-10-26');
  assert.equal(stepDay(parseDate('2026-10-23'), true).toISOString().slice(0, 10), '2026-10-26');
  assert.equal(stepDay(parseDate('2026-10-26'), false).toISOString().slice(0, 10), '2026-10-23');
  assert.match(formatBells(), /13:05–13:45/);

  const lessons = lessonsFor('se', parseDate('2026-10-14'));
  assert.equal(dayStatus(lessons, 8 * 60 + 45).kind, 'next'); // перемена 8:40–8:50
  assert.equal(dayStatus(lessons, 8 * 60 + 55).lesson.n, 2);
  assert.equal(dayStatus(lessons, 14 * 60).kind, 'done');
  assert.equal(today(at('2026-10-14', 0, 30)).toISOString().slice(0, 10), '2026-10-14');
});

test('тексты дня и недели', () => {
  const text = formatDay('gum', parseDate('2026-10-14'), at('2026-10-14', 9, 45), [
    { due: '2026-10-14', subject: 'Английский язык', text: 'упр. 5', authorName: 'Аня' },
  ]);
  assert.match(text, /Сегодня · среда, 14 октября<\/b> · 10б · гум/);
  assert.match(text, /Идёт 3-й урок/);
  assert.match(text, /📝 упр\. 5 <i>— Аня<\/i>/);
  assert.match(text, /каб\. 114/);
  const week = formatWeek('tech', parseDate('2026-10-14'), at('2026-10-14', 9));
  assert.match(week, /12–16 октября/);
  assert.ok(!week.includes('Суббота'));
});

test('предметы и ДЗ — свои у каждого профиля', () => {
  assert.ok(subjectsOf('gum').includes('Стилистика'));
  assert.ok(!subjectsOf('se').includes('Стилистика'));
  assert.equal(findSubject('se', 'мат').subject, 'Математика');
  assert.equal(findSubject('se', 'вис').subject, 'Вероятность и статистика');
  assert.equal(findSubject('se', 'общ').subject, 'Обществознание');
  assert.equal(findSubject('se', 'общ геог').subject, 'Общественная география');
  assert.equal(findSubject('gum', 'введ лит').subject, 'Введение в литературоведение');
  assert.equal(findSubject('en', 'англ').subject, 'Английский язык');
  assert.equal(findSubject('en', 'реш').subject, 'Решение уравнений');
  // ср 14.10 10:00 — информатика у тех: ближайшая в пятницу
  assert.equal(nextLessonDate('tech', 'Информатика', at('2026-10-14', 10)).toISOString().slice(0, 10), '2026-10-16');
  assert.equal(validateNote({ cls: 'xx', subject: 'Химия', text: 'a' }), 'Сначала выбери класс');
  assert.equal(validateNote({ cls: 'se', subject: 'Стилистика', text: 'a' }), 'Нет такого предмета в расписании');
});

test('бот: сначала выбор класса, потом уроки', async () => {
  const prefs = memoryPrefs();
  const chat = { id: 42, type: 'private' };
  const now = at('2026-10-14', 9, 45);

  const start = await replyTo({ text: '/start', chat }, now, undefined, prefs);
  assert.match(start.text, /выбери свой класс/);
  assert.equal(start.reply_markup.inline_keyboard.length, 4);
  assert.equal(start.reply_markup.inline_keyboard[3][0].callback_data, 'c:gum');

  const blocked = await replyTo({ text: BUTTONS.today, chat }, now, undefined, prefs);
  assert.match(blocked.text, /Сначала выбери/);

  const chosen = await viewFor('c:en', chat.id, now, undefined, prefs);
  assert.equal(chosen.chosen, 'en');
  assert.match(chosen.view.text, /10б · ен/);
  assert.equal(await prefs.get(42), 'en');

  const todayMsg = await replyTo({ text: '/today', chat }, now, undefined, prefs);
  assert.match(todayMsg.text, /Решение уравнений/);
  const next = todayMsg.reply_markup.inline_keyboard[0][1].callback_data;
  assert.equal(next, 'd:en:2026-10-15');
  const thu = await viewFor(next, chat.id, now, undefined, prefs);
  assert.match(thu.view.text, /Биохимия/);

  // пятница → «вперёд» ведёт в понедельник
  const fri = await viewFor('d:en:2026-10-16', chat.id, now, undefined, prefs);
  assert.equal(fri.view.reply_markup.inline_keyboard[0][1].callback_data, 'd:en:2026-10-19');

  assert.equal(await viewFor('d:xx:2026-10-16', chat.id, now, undefined, prefs), null);
  assert.equal(await viewFor('c:zz', chat.id, now, undefined, prefs), null);
  assert.equal(actionFor('🔔 Звонки'), 'bells');
  assert.match((await replyTo({ text: '/bells', chat }, now, undefined, prefs)).text, /Звонки/);
  assert.equal(await replyTo({ text: 'привет', chat: { id: 1, type: 'group' } }, now, undefined, prefs), null);
});

test('бот: /dz записывает к ближайшему уроку своего профиля', async () => {
  const prefs = memoryPrefs();
  await prefs.set(7, 'gum');
  const saved = [];
  const store = {
    range: async () => [],
    upcoming: async (cls) => saved.filter((n) => n.cls === cls),
    add: async (n) => saved.push({ id: saved.length + 1, ...n }),
  };
  const msg = (text) => ({ text, chat: { id: 7, type: 'private' }, from: { id: 5, first_name: 'Аня' } });
  const now = at('2026-10-14', 10);

  const res = await replyTo(msg('/dz стил: выучить термины'), now, store, prefs);
  assert.match(res.text, /Стилистика.*10б · гум.*Чт, 15 октября/s);
  assert.deepEqual(saved[0], {
    id: 1, cls: 'gum', subject: 'Стилистика', due: '2026-10-15', text: 'выучить термины', authorId: 5, authorName: 'Аня',
  });
  const list = await replyTo(msg('/dz'), now, store, prefs);
  assert.match(list.text, /выучить термины/);
  assert.match((await replyTo(msg('/dz биохим: x'), now, store, prefs)).text, /Не понял, какой предмет/);
});

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { BELLS, CLASSES, ROWS, TIMETABLE } from '../tgcloud/lib/school.js';
import {
  dayStatus, formatBells, formatDay, formatWeek, lessonsFor, parseDate, schoolDay, stepDay, today,
} from '../tgcloud/lib/schedule.js';
import { findSubject, groupOf, groupsOf, nextLessonDate, subjectsOf, validateNote } from '../tgcloud/lib/homework.js';
import { BUTTONS, actionFor, memoryPrefs, replyTo, viewFor } from '../tgcloud/lib/bot.js';

const day = (cls, iso) => lessonsFor(cls, parseDate(iso)).map((p) => `${p.n} ${p.subject}${p.type ? ` (${p.type})` : ''} ${p.room}`);
// Ср 14.10.2026, местное время → UTC (Якутск UTC+9)
const at = (iso, hh, mm = 0) => Date.parse(`${iso}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00+09:00`);

test('таблица целая: 8 вариантов, уроки в звонках, без накладок', () => {
  assert.deepEqual(Object.keys(CLASSES), ['a-se', 'a-tech', 'a-en', 'a-gum', 'b-se', 'b-tech', 'b-en', 'b-gum']);
  // в строке либо белые ячейки классов, либо серые профилей — не вперемешку
  for (const [d, rows] of Object.entries(ROWS)) {
    for (const r of rows) {
      const hasClass = Boolean(r.a || r.b);
      const hasProfile = ['se', 'tech', 'en', 'gum'].some((p) => r[p]);
      assert.ok(hasClass !== hasProfile, `день ${d}, урок ${r.n}`);
    }
  }
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
    // один предмет у варианта — всегда одна группа (иначе ДЗ не понять, кому)
    for (const subject of subjectsOf(cls)) {
      const groups = new Set(Object.values(TIMETABLE[cls]).flat().filter((p) => p.subject === subject).map((p) => p.group));
      assert.equal(groups.size, 1, `${cls}: ${subject}`);
    }
  }
});

test('общие уроки — из колонки класса, профильные — из колонки профиля', () => {
  // 10а гум во вторник: профильные — как у гум, 4–5 физкультура, 6–7 литература (как у 10а)
  assert.deepEqual(day('a-gum', '2026-10-20'), [
    '1 Химия (база) 210', '2 Биология (база) 212', '3 Английский язык 111',
    '4 Физкультура спортзал', '5 Физкультура спортзал', '6 Литература 211', '7 Литература 211',
  ]);
  assert.deepEqual(day('b-gum', '2026-10-20').slice(3), [
    '4 Литература 211', '5 Литература 211', '6 Физкультура спортзал', '7 Физкультура спортзал',
  ]);
  assert.deepEqual(day('a-se', '2026-10-19'), [
    '1 Обществознание 113', '2 Обществознание 113', '3 Английский язык 207', '4 Английский язык 207',
    '5 Разговоры о важном 210', '6 Математика 115', '7 Математика 115',
  ]);
  // 10б сэ: профильная математика в 115, «Разговоры» — с 10б в 212
  assert.deepEqual(day('b-se', '2026-10-19').slice(4), ['5 Разговоры о важном 212', '6 Математика 115', '7 Математика 115']);
  // 10а гум в среду: русский с 10а, 3-й — английский гум, математика гум в 210, история с 10а
  assert.deepEqual(day('a-gum', '2026-10-21'), [
    '1 Русский язык 206', '2 Русский язык 206', '3 Английский язык 114', '4 Математика 210',
    '5 Математика 210', '6 История 114', '7 История 114',
  ]);
  assert.deepEqual(day('b-en', '2026-10-22').slice(0, 4), ['1 Россия — мои горизонты 212', '2 Биохимия 210', '3 Химия 210', '4 Химия 210']);
  // пт: у сэ 7-го урока нет, у тех — физика; обществознание тех + ен в 113
  assert.equal(day('a-se', '2026-10-23').length, 6);
  assert.equal(day('b-tech', '2026-10-23').at(-1), '7 Физика 213');
  assert.equal(day('a-tech', '2026-10-23')[4], '5 Обществознание 113');
  assert.equal(day('b-en', '2026-10-23')[4], '5 Обществознание 113');
  assert.equal(day('a-gum', '2026-10-23')[5], '6 Деловой английский 114');
  assert.deepEqual(day('a-se', '2026-10-24'), []); // суббота
});

test('выходные и звонки', () => {
  assert.equal(schoolDay(parseDate('2026-10-24')).toISOString().slice(0, 10), '2026-10-26');
  assert.equal(stepDay(parseDate('2026-10-23'), true).toISOString().slice(0, 10), '2026-10-26');
  assert.equal(stepDay(parseDate('2026-10-26'), false).toISOString().slice(0, 10), '2026-10-23');
  assert.match(formatBells(), /13:05–13:45/);

  const lessons = lessonsFor('a-se', parseDate('2026-10-14'));
  assert.equal(dayStatus(lessons, 8 * 60 + 45).kind, 'next'); // перемена 8:40–8:50
  assert.equal(dayStatus(lessons, 8 * 60 + 55).lesson.n, 2);
  assert.equal(dayStatus(lessons, 14 * 60).kind, 'done');
  assert.equal(today(at('2026-10-14', 0, 30)).toISOString().slice(0, 10), '2026-10-14');
});

test('тексты дня и недели', () => {
  const text = formatDay('b-gum', parseDate('2026-10-14'), at('2026-10-14', 9, 45), [
    { due: '2026-10-14', subject: 'Английский язык', text: 'упр. 5', authorName: 'Аня' },
  ]);
  assert.match(text, /Сегодня · среда, 14 октября<\/b> · 10б · гум/);
  assert.match(text, /Идёт 3-й урок/);
  assert.match(text, /📝 упр\. 5 <i>— Аня<\/i>/);
  assert.match(text, /каб\. 114/);
  const week = formatWeek('a-tech', parseDate('2026-10-14'), at('2026-10-14', 9));
  assert.match(week, /12–16 октября/);
  assert.ok(!week.includes('Суббота'));
});

test('предметы и группы для ДЗ', () => {
  assert.ok(subjectsOf('a-gum').includes('Стилистика'));
  assert.ok(!subjectsOf('a-se').includes('Стилистика'));
  assert.deepEqual(groupsOf('a-gum'), ['a', 'gum']);
  assert.equal(groupOf('a-gum', 'Стилистика'), 'gum');
  assert.equal(groupOf('a-gum', 'Литература'), 'a');
  assert.equal(groupOf('b-tech', 'Обществознание'), 'tech');
  assert.equal(findSubject('a-se', 'мат').subject, 'Математика');
  assert.equal(findSubject('a-se', 'вис').subject, 'Вероятность и статистика');
  assert.equal(findSubject('a-se', 'общ').subject, 'Обществознание');
  assert.equal(findSubject('a-se', 'общ геог').subject, 'Общественная география');
  assert.equal(findSubject('b-gum', 'введ лит').subject, 'Введение в литературоведение');
  assert.equal(findSubject('a-en', 'англ').subject, 'Английский язык');
  assert.equal(findSubject('b-en', 'реш').subject, 'Решение уравнений');
  // ср 14.10 10:00 — информатика у тех: ближайшая в пятницу
  assert.equal(nextLessonDate('a-tech', 'Информатика', at('2026-10-14', 10)).toISOString().slice(0, 10), '2026-10-16');
  assert.equal(validateNote({ cls: 'gum', subject: 'Химия', text: 'a' }), 'Сначала выбери класс');
  assert.equal(validateNote({ cls: 'a-se', subject: 'Стилистика', text: 'a' }), 'Нет такого предмета в расписании');
});

test('бот: сначала выбор класса, потом уроки', async () => {
  const prefs = memoryPrefs();
  const chat = { id: 42, type: 'private' };
  const now = at('2026-10-14', 9, 45);

  const start = await replyTo({ text: '/start', chat }, now, undefined, prefs);
  assert.match(start.text, /синюю кнопку <b>«Расписание»<\/b>/);
  assert.equal(start.reply_markup.inline_keyboard[0][0].web_app.url, 'https://app8734400455.tgcloud.ai/');
  const inGroup = await replyTo({ text: '/start', chat: { id: -5, type: 'supergroup' } }, now, undefined, prefs);
  assert.match(inGroup.text, /в личке/);
  assert.equal(inGroup.reply_markup, undefined); // web_app-кнопки в группах запрещены

  const picker = await replyTo({ text: '/class', chat }, now, undefined, prefs);
  assert.equal(picker.reply_markup.inline_keyboard.length, 2);
  assert.equal(picker.reply_markup.inline_keyboard[0][3].callback_data, 'c:a-gum');
  assert.equal(picker.reply_markup.inline_keyboard[1][0].text, '10б сэ');

  const blocked = await replyTo({ text: BUTTONS.today, chat }, now, undefined, prefs);
  assert.match(blocked.text, /Сначала выбери/);

  const chosen = await viewFor('c:b-en', chat.id, now, undefined, prefs);
  assert.equal(chosen.chosen, 'b-en');
  assert.match(chosen.view.text, /10б · ен/);
  assert.equal(await prefs.get(42), 'b-en');

  const todayMsg = await replyTo({ text: '/today', chat }, now, undefined, prefs);
  assert.match(todayMsg.text, /Решение уравнений/);
  const next = todayMsg.reply_markup.inline_keyboard[0][1].callback_data;
  assert.equal(next, 'd:b-en:2026-10-15');
  const thu = await viewFor(next, chat.id, now, undefined, prefs);
  assert.match(thu.view.text, /Биохимия/);

  // пятница → «вперёд» ведёт в понедельник
  const fri = await viewFor('d:b-en:2026-10-16', chat.id, now, undefined, prefs);
  assert.equal(fri.view.reply_markup.inline_keyboard[0][1].callback_data, 'd:b-en:2026-10-19');

  assert.equal(await viewFor('d:gum:2026-10-16', chat.id, now, undefined, prefs), null);
  assert.equal(await viewFor('c:gum', chat.id, now, undefined, prefs), null);
  assert.equal(actionFor('🔔 Звонки'), 'bells');
  assert.match((await replyTo({ text: '/bells', chat }, now, undefined, prefs)).text, /Звонки/);
  assert.equal(await replyTo({ text: 'привет', chat: { id: 1, type: 'group' } }, now, undefined, prefs), null);
});

test('бот: ДЗ по профильному уроку видит вся группа, по общему — весь класс', async () => {
  const prefs = memoryPrefs();
  await prefs.set(7, 'a-gum');
  await prefs.set(8, 'b-gum');
  await prefs.set(9, 'b-se');
  const saved = [];
  const store = {
    range: async (groups, from, to) => saved.filter((n) => groups.includes(n.cls) && n.due >= from && n.due <= to),
    upcoming: async (groups) => saved.filter((n) => groups.includes(n.cls)),
    add: async (n) => saved.push({ id: saved.length + 1, ...n }),
  };
  const msg = (chat, text) => ({ text, chat: { id: chat, type: 'private' }, from: { id: 5, first_name: 'Аня' } });
  const now = at('2026-10-14', 10);

  const res = await replyTo(msg(7, '/dz стил: выучить термины'), now, store, prefs);
  assert.match(res.text, /Стилистика.*Чт, 15 октября.*Видит вся группа «гум»/s);
  assert.deepEqual(saved[0], {
    id: 1, cls: 'gum', subject: 'Стилистика', due: '2026-10-15', text: 'выучить термины', private: false, authorId: 5, authorName: 'Аня',
  });
  await replyTo(msg(7, '/dz лит: читать главу 3'), now, store, prefs); // литература у 10а — общая
  assert.equal(saved[1].cls, 'a');

  const text = async (chat) => (await replyTo(msg(chat, '/dz'), now, store, prefs)).text;
  assert.match(await text(8), /выучить термины/); // 10б гум — та же профильная группа
  assert.ok(!(await text(8)).includes('главу 3')); // а литература у 10б своя
  assert.ok(!(await text(9)).includes('выучить термины'));
  assert.match((await replyTo(msg(7, '/dz биохим: x'), now, store, prefs)).text, /Не понял, какой предмет/);
});

test('бот: /my — личное ДЗ, видит только автор и только в личке', async () => {
  const prefs = memoryPrefs();
  await prefs.set(7, 'a-gum');
  await prefs.set(8, 'b-gum');
  await prefs.set(-100, 'a-gum'); // группа класса
  const saved = [];
  const visible = (n, viewer) => !n.private || n.authorId === viewer;
  const store = {
    range: async (groups, from, to, viewer) => saved.filter((n) => groups.includes(n.cls) && visible(n, viewer) && n.due >= from && n.due <= to),
    upcoming: async (groups, from, viewer) => saved.filter((n) => groups.includes(n.cls) && visible(n, viewer)),
    add: async (n) => saved.push({ id: saved.length + 1, ...n }),
  };
  const msg = (chat, text, type = 'private') => ({ text, chat: { id: chat, type }, from: { id: chat > 0 ? chat : 7, first_name: 'Аня' } });
  const now = at('2026-10-14', 10);

  const res = await replyTo(msg(7, '/my стил: повторить термины'), now, store, prefs);
  assert.match(res.text, /личное ДЗ.*Стилистика.*Видишь только ты/s);
  assert.equal(saved[0].private, true);
  await replyTo(msg(7, '/dz стил: эссе'), now, store, prefs);
  assert.equal(saved[1].private, false);
  assert.match((await replyTo(msg(7, '/dz стил: эссе'), now, store, prefs)).text, /Видит вся группа «гум» — из 10а и 10б/);

  const mine = (await replyTo(msg(7, '/dz'), now, store, prefs)).text;
  assert.match(mine, /🔒 повторить термины/);
  assert.match(mine, /эссе <i>— Аня<\/i>/);
  const other = (await replyTo(msg(8, '/dz'), now, store, prefs)).text;
  assert.ok(!other.includes('повторить термины'));
  assert.match(other, /эссе/);

  // в группе личное не показываем, даже автору
  const group = (await replyTo(msg(-100, '/dz', 'supergroup'), now, store, prefs)).text;
  assert.ok(!group.includes('повторить термины'));
  assert.match((await replyTo(msg(-100, '/my стил: x', 'supergroup'), now, store, prefs)).text, /только в личке/);

  // и в расписании дня у урока — тоже только у автора
  const thu = await viewFor('d:a-gum:2026-10-15', 7, now, store, prefs);
  assert.match(thu.view.text, /🔒 повторить термины/);
  const thuOther = await viewFor('d:b-gum:2026-10-15', 8, now, store, prefs);
  assert.ok(!thuOther.view.text.includes('повторить термины'));
});

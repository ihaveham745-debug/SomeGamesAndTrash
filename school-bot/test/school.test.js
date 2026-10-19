import assert from 'node:assert/strict';
import { test } from 'node:test';

import { BELLS, CLASSES, ROWS, TIMETABLE } from '../tgcloud/lib/school.js';
import {
  dayStatus, formatBells, formatDay, formatWeek, lessonsFor, parseDate, schoolDay, stepDay, today,
} from '../tgcloud/lib/schedule.js';
import {
  findSubject, groupOf, groupsOf, localToUnix, nextLessonDate, quickReminderAt, reminderError, subjectsOf, unixToLocal,
  validateNote,
} from '../tgcloud/lib/homework.js';
import { BUTTONS, actionFor, memoryPrefs, reminderMessage, replyTo, viewFor } from '../tgcloud/lib/bot.js';

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
    '1 химия (база) 210', '2 биология (база) 212', '3 английский язык 111',
    '4 физкультура спортзал', '5 физкультура спортзал', '6 литература 211', '7 литература 211',
  ]);
  assert.deepEqual(day('b-gum', '2026-10-20').slice(3), [
    '4 литература 211', '5 литература 211', '6 физкультура спортзал', '7 физкультура спортзал',
  ]);
  assert.deepEqual(day('a-se', '2026-10-19'), [
    '1 обществознание 113', '2 обществознание 113', '3 английский язык 207', '4 английский язык 207',
    '5 разговоры о важном 210', '6 математика 115', '7 математика 115',
  ]);
  // 10б сэ: профильная математика в 115, «Разговоры» — с 10б в 212
  assert.deepEqual(day('b-se', '2026-10-19').slice(4), ['5 разговоры о важном 212', '6 математика 115', '7 математика 115']);
  // 10а гум в среду: русский с 10а, 3-й — английский гум, математика гум в 210, история с 10а
  assert.deepEqual(day('a-gum', '2026-10-21'), [
    '1 русский язык 206', '2 русский язык 206', '3 английский язык 114', '4 математика 210',
    '5 математика 210', '6 история 114', '7 история 114',
  ]);
  assert.deepEqual(day('b-en', '2026-10-22').slice(0, 4), ['1 россия — мои горизонты 212', '2 биохимия 210', '3 химия 210', '4 химия 210']);
  // пт: у сэ 7-го урока нет, у тех — физика; обществознание тех + ен в 113
  assert.equal(day('a-se', '2026-10-23').length, 6);
  assert.equal(day('b-tech', '2026-10-23').at(-1), '7 физика 213');
  assert.equal(day('a-tech', '2026-10-23')[4], '5 обществознание 113');
  assert.equal(day('b-en', '2026-10-23')[4], '5 обществознание 113');
  assert.equal(day('a-gum', '2026-10-23')[5], '6 деловой английский 114');
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
    { due: '2026-10-14', subject: 'английский язык', text: 'упр. 5', authorName: 'аня' },
  ]);
  assert.match(text, /сегодня · среда, 14 октября<\/b> · 10б · гум/);
  assert.match(text, /идёт 3-й урок/);
  assert.match(text, /упр\. 5 <i>— аня<\/i>/);
  assert.match(text, /каб\. 114/);
  const week = formatWeek('a-tech', parseDate('2026-10-14'), at('2026-10-14', 9));
  assert.match(week, /12–16 октября/);
  assert.ok(!week.includes('суббота'));
});

test('предметы и группы для дз', () => {
  assert.ok(subjectsOf('a-gum').includes('стилистика'));
  assert.ok(!subjectsOf('a-se').includes('стилистика'));
  assert.deepEqual(groupsOf('a-gum'), ['a', 'gum']);
  assert.equal(groupOf('a-gum', 'стилистика'), 'gum');
  assert.equal(groupOf('a-gum', 'литература'), 'a');
  assert.equal(groupOf('b-tech', 'обществознание'), 'tech');
  assert.equal(findSubject('a-se', 'мат').subject, 'математика');
  assert.equal(findSubject('a-se', 'вис').subject, 'вероятность и статистика');
  assert.equal(findSubject('a-se', 'общ').subject, 'обществознание');
  assert.equal(findSubject('a-se', 'общ геог').subject, 'общественная география');
  assert.equal(findSubject('b-gum', 'введ лит').subject, 'введение в литературоведение');
  assert.equal(findSubject('a-en', 'англ').subject, 'английский язык');
  assert.equal(findSubject('b-en', 'реш').subject, 'решение уравнений');
  // ср 14.10 10:00 — информатика у тех: ближайшая в пятницу
  assert.equal(nextLessonDate('a-tech', 'информатика', at('2026-10-14', 10)).toISOString().slice(0, 10), '2026-10-16');
  assert.equal(validateNote({ cls: 'gum', subject: 'химия', text: 'a' }), 'сначала выбери класс');
  assert.equal(validateNote({ cls: 'a-se', subject: 'стилистика', text: 'a' }), 'нет такого предмета в расписании');
});

test('бот: сначала выбор класса, потом уроки', async () => {
  const prefs = memoryPrefs();
  const chat = { id: 42, type: 'private' };
  const now = at('2026-10-14', 9, 45);

  const start = await replyTo({ text: '/start', chat }, now, undefined, prefs);
  assert.match(start.text, /синюю кнопку <b>«расписание»<\/b>/);
  assert.equal(start.reply_markup.inline_keyboard[0][0].web_app.url, 'https://app8734400455.tgcloud.ai/');
  const inGroup = await replyTo({ text: '/start', chat: { id: -5, type: 'supergroup' } }, now, undefined, prefs);
  assert.match(inGroup.text, /в личке/);
  assert.equal(inGroup.reply_markup, undefined); // web_app-кнопки в группах запрещены

  const picker = await replyTo({ text: '/class', chat }, now, undefined, prefs);
  assert.equal(picker.reply_markup.inline_keyboard.length, 2);
  assert.equal(picker.reply_markup.inline_keyboard[0][3].callback_data, 'c:a-gum');
  assert.equal(picker.reply_markup.inline_keyboard[1][0].text, '10б сэ');

  const blocked = await replyTo({ text: BUTTONS.today, chat }, now, undefined, prefs);
  assert.match(blocked.text, /сначала выбери/);

  const chosen = await viewFor('c:b-en', chat.id, now, undefined, prefs);
  assert.equal(chosen.chosen, 'b-en');
  assert.match(chosen.view.text, /10б · ен/);
  assert.equal(await prefs.get(42), 'b-en');

  const todayMsg = await replyTo({ text: '/today', chat }, now, undefined, prefs);
  assert.match(todayMsg.text, /решение уравнений/);
  const next = todayMsg.reply_markup.inline_keyboard[0][1].callback_data;
  assert.equal(next, 'd:b-en:2026-10-15');
  const thu = await viewFor(next, chat.id, now, undefined, prefs);
  assert.match(thu.view.text, /биохимия/);

  // пятница → «вперёд» ведёт в понедельник
  const fri = await viewFor('d:b-en:2026-10-16', chat.id, now, undefined, prefs);
  assert.equal(fri.view.reply_markup.inline_keyboard[0][1].callback_data, 'd:b-en:2026-10-19');

  assert.equal(await viewFor('d:gum:2026-10-16', chat.id, now, undefined, prefs), null);
  assert.equal(await viewFor('c:gum', chat.id, now, undefined, prefs), null);
  assert.equal(actionFor('звонки'), 'bells');
  assert.equal(actionFor('🔔 Звонки'), 'bells'); // старая клавиатура с эмодзи
  assert.match((await replyTo({ text: '/bells', chat }, now, undefined, prefs)).text, /звонки/);
  assert.equal(await replyTo({ text: 'привет', chat: { id: 1, type: 'group' } }, now, undefined, prefs), null);
});

test('бот: дз по профильному уроку видит вся группа, по общему — весь класс', async () => {
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
  const msg = (chat, text) => ({ text, chat: { id: chat, type: 'private' }, from: { id: 5, first_name: 'аня' } });
  const now = at('2026-10-14', 10);

  const res = await replyTo(msg(7, '/dz стил: выучить термины'), now, store, prefs);
  assert.match(res.text, /стилистика.*чт, 15 октября.*видит вся группа «гум»/s);
  assert.deepEqual(saved[0], {
    id: 1, cls: 'gum', subject: 'стилистика', due: '2026-10-15', text: 'выучить термины', private: false, authorId: 5, authorName: 'аня',
  });
  await replyTo(msg(7, '/dz лит: читать главу 3'), now, store, prefs); // литература у 10а — общая
  assert.equal(saved[1].cls, 'a');

  const text = async (chat) => (await replyTo(msg(chat, '/dz'), now, store, prefs)).text;
  assert.match(await text(8), /выучить термины/); // 10б гум — та же профильная группа
  assert.ok(!(await text(8)).includes('главу 3')); // а литература у 10б своя
  assert.ok(!(await text(9)).includes('выучить термины'));
  assert.match((await replyTo(msg(7, '/dz биохим: x'), now, store, prefs)).text, /не понял, какой предмет/);
});

test('бот: /my — личное дз, видит только автор и только в личке', async () => {
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
  const msg = (chat, text, type = 'private') => ({ text, chat: { id: chat, type }, from: { id: chat > 0 ? chat : 7, first_name: 'аня' } });
  const now = at('2026-10-14', 10);

  const res = await replyTo(msg(7, '/my стил: повторить термины'), now, store, prefs);
  assert.match(res.text, /личное дз.*стилистика.*видишь только ты/s);
  assert.equal(saved[0].private, true);
  await replyTo(msg(7, '/dz стил: эссе'), now, store, prefs);
  assert.equal(saved[1].private, false);
  assert.match((await replyTo(msg(7, '/dz стил: эссе'), now, store, prefs)).text, /видит вся группа «гум» — из 10а и 10б/);

  const mine = (await replyTo(msg(7, '/dz'), now, store, prefs)).text;
  assert.match(mine, /повторить термины/);
  assert.match(mine, /эссе <i>— аня<\/i>/);
  const other = (await replyTo(msg(8, '/dz'), now, store, prefs)).text;
  assert.ok(!other.includes('повторить термины'));
  assert.match(other, /эссе/);

  // в группе личное не показываем, даже автору
  const group = (await replyTo(msg(-100, '/dz', 'supergroup'), now, store, prefs)).text;
  assert.ok(!group.includes('повторить термины'));
  assert.match((await replyTo(msg(-100, '/my стил: x', 'supergroup'), now, store, prefs)).text, /только в личке/);

  // и в расписании дня у урока — тоже только у автора
  const thu = await viewFor('d:a-gum:2026-10-15', 7, now, store, prefs);
  assert.match(thu.view.text, /повторить термины/);
  const thuOther = await viewFor('d:b-gum:2026-10-15', 8, now, store, prefs);
  assert.ok(!thuOther.view.text.includes('повторить термины'));
});

test('бот: фото и файлы к дз — подписью /dz, кнопкой бот присылает обратно', async () => {
  const prefs = memoryPrefs();
  await prefs.set(7, 'a-gum');
  await prefs.set(8, 'b-gum');
  await prefs.set(9, 'a-se');
  const saved = [];
  const visible = (n, viewer) => !n.private || n.authorId === viewer;
  const store = {
    range: async (groups, from, to, viewer) => saved.filter((n) => groups.includes(n.cls) && visible(n, viewer) && n.due >= from && n.due <= to),
    upcoming: async (groups, from, viewer) => saved.filter((n) => groups.includes(n.cls) && visible(n, viewer)),
    add: async (n) => saved.push({ id: saved.length + 1, ...n }),
    get: async (id) => saved.find((n) => n.id === id) ?? null,
  };
  const now = at('2026-10-14', 10);
  const photo = [{ file_id: 'small' }, { file_id: 'BIG' }];
  const msg = (chat, extra) => ({ chat: { id: chat, type: 'private' }, from: { id: chat, first_name: 'Аня' }, ...extra });

  // фото с подписью — текст можно не писать
  const res = await replyTo(msg(7, { photo, caption: '/dz стил:' }), now, store, prefs);
  assert.match(res.text, /записал дз.*стилистика.*фото прикреплено/s);
  assert.deepEqual([saved[0].fileId, saved[0].fileKind, saved[0].text], ['BIG', 'photo', '']);
  await replyTo(msg(7, { document: { file_id: 'DOC', file_name: 'конспект.pdf' }, caption: '/my лит: мой конспект' }), now, store, prefs);
  assert.deepEqual([saved[1].fileKind, saved[1].fileName, saved[1].private], ['document', 'конспект.pdf', true]);

  // без команды в подписи — подсказка, ничего не сохраняем
  assert.match((await replyTo(msg(7, { photo }), now, store, prefs)).text, /подпиши его командой/);
  assert.match((await replyTo(msg(7, { photo, caption: '/dz' }), now, store, prefs)).text, /подпиши его командой/);
  assert.equal(saved.length, 2);

  // в списке — пометка и кнопки «фото — …» / «файл — …»
  const list = await replyTo(msg(7, { text: '/dz' }), now, store, prefs);
  assert.match(list.text, /<i>\[фото\]<\/i>/);
  assert.match(list.text, /мой конспект <i>\[файл: конспект\.pdf\]<\/i> <i>— только ты<\/i>/);
  const buttons = list.reply_markup.inline_keyboard.map((r) => r[0]);
  assert.deepEqual(buttons.map((b) => b.callback_data), ['f:1', 'f:2']);
  assert.equal(buttons[0].text, 'фото — стилистика 15.10');

  // кнопка: свой — присылаем; чужой профиль и чужое личное — нельзя
  assert.equal((await viewFor('f:1', 7, now, store, prefs)).send.fileId, 'BIG');
  assert.equal((await viewFor('f:1', 8, now, store, prefs)).send.id, 1); // 10б гум — та же группа
  assert.deepEqual(await viewFor('f:1', 9, now, store, prefs), { denied: true }); // 10а сэ
  assert.deepEqual(await viewFor('f:2', 8, now, store, prefs), { denied: true }); // личное
  assert.deepEqual(await viewFor('f:99', 7, now, store, prefs), { denied: true });

  // в расписании дня у урока — пометка и кнопка файла над стрелками
  const thu = await viewFor('d:a-gum:2026-10-15', 7, now, store, prefs);
  assert.match(thu.view.text, /дз: <i>\[фото\]<\/i> <i>— Аня<\/i>/);
  assert.equal(thu.view.reply_markup.inline_keyboard[0][0].callback_data, 'f:1');
});

test('напоминания: любой день, время 9/15/18/0, кнопки после /dz и текст', async () => {
  const note = { id: 5, cls: 'gum', subject: 'стилистика', due: '2026-10-22', text: 'выучить термины', authorName: 'Аня', private: false };
  const now = at('2026-10-14', 10);
  // быстрые кнопки: накануне в 9/15/18, «0:00» — полночь перед уроком
  assert.deepEqual(unixToLocal(quickReminderAt(note, '09:00')), ['2026-10-21', '09:00']);
  assert.deepEqual(unixToLocal(quickReminderAt(note, '18:00')), ['2026-10-21', '18:00']);
  assert.deepEqual(unixToLocal(quickReminderAt(note, '00:00')), ['2026-10-22', '00:00']);
  // любой день — можно и после урока, и через месяц; время — только из четырёх
  assert.equal(reminderError(localToUnix('2026-11-20', '15:00'), now), null);
  assert.equal(reminderError(localToUnix('2026-10-25', '18:30'), now), 'BAD_TIME');
  assert.equal(reminderError(localToUnix('2026-10-14', '09:00'), now), 'PAST');
  assert.equal(reminderError(localToUnix('2028-01-01', '09:00'), now), 'TOO_FAR');
  assert.equal(localToUnix('2026-02-31', '09:00'), null);

  const prefs = memoryPrefs();
  await prefs.set(7, 'a-gum');
  await prefs.set(9, 'a-se');
  const saved = [];
  const store = {
    range: async () => [], upcoming: async () => [],
    add: async (n) => { const row = { id: saved.length + 1, ...n }; saved.push(row); return row; },
    get: async (id) => saved.find((n) => n.id === id) ?? null,
  };
  const set = [];
  const remind = {
    set: async (userId, cls, n, when, nowMs) => {
      if (when === null) return { at: null };
      const err = reminderError(when, nowMs);
      if (err) throw new Error(err);
      set.push([userId, cls, n.id, unixToLocal(when)]);
      return { at: when };
    },
  };
  const msg = (chat, text, type = 'private') => ({ text, chat: { id: chat, type }, from: { id: chat, first_name: 'Аня' } });

  // после записи дз в личке — «напомнить накануне:» 9:00 15:00 18:00 0:00 и «другой день»
  const res = await replyTo(msg(7, '/dz стил: выучить термины'), now, store, prefs);
  const kb = res.reply_markup.inline_keyboard;
  assert.equal(kb[1][0].text, 'напомнить накануне:');
  assert.deepEqual(kb[2].map((b) => [b.text, b.callback_data]), [
    ['9:00', 'r:1:0900'], ['15:00', 'r:1:1500'], ['18:00', 'r:1:1800'], ['в 0:00', 'r:1:0000'],
  ]);
  assert.equal(kb[3][0].web_app.url, 'https://app8734400455.tgcloud.ai/?remind=1');
  // в группе — без них
  await prefs.set(-100, 'a-gum');
  assert.equal((await replyTo(msg(-100, '/dz стил: эссе', 'supergroup'), now, store, prefs)).reply_markup.inline_keyboard.length, 1);

  // кнопка: дз к чт 15.10 → накануне, ср 14.10 в 18:00
  assert.equal((await viewFor('r:1:1800', 7, now, store, prefs, remind)).notice, 'напомню 14.10 в 18:00');
  assert.deepEqual(set[0], [7, 'a-gum', 1, ['2026-10-14', '18:00']]);
  assert.equal((await viewFor('r:1:0900', 7, now, store, prefs, remind)).notice, 'это время уже прошло — выбери другое');
  assert.equal((await viewFor('r:1:off', 7, now, store, prefs, remind)).notice, 'напоминание выключено');
  assert.equal((await viewFor('r:1:1800', 9, now, store, prefs, remind)).notice, 'напоминание недоступно');
  assert.equal((await viewFor('r:1:1800', -100, now, store, prefs, remind)).notice, 'напоминание недоступно');
  assert.equal(await viewFor('r:1:1830', 7, now, store, prefs, remind), null);

  // текст напоминания
  const m = reminderMessage('a-gum', { ...note, fileId: 'P', fileKind: 'photo' }, at('2026-10-21', 18));
  assert.match(m.text, /<b>напоминание о дз<\/b> — завтра/);
  assert.match(m.text, /<b>стилистика<\/b> · 3 урок, 09:40, каб\. 213/);
  assert.match(m.text, /выучить термины <i>\[фото\]<\/i> <i>— Аня<\/i>/);
  assert.equal(m.reply_markup.inline_keyboard[0][0].callback_data, 'f:5');
  assert.match(reminderMessage('a-gum', note, at('2026-10-17', 9)).text, /— чт, 22 октября/);
  assert.match(reminderMessage('a-gum', note, at('2026-10-25', 9)).text, /— урок был чт, 22 октября/);
});

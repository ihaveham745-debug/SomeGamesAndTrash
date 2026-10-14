import assert from 'node:assert/strict';
import { test } from 'node:test';

import { actionFor, commandMention, replyTo, viewFor } from '../tgcloud/lib/bot.js';
import { readFileSync } from 'node:fs';

import * as schedule from '../tgcloud/lib/schedule.js';
import { dayStatus, formatDay, formatParity, formatWeek, pairsFor, parseDate, today, weekNumber } from '../tgcloud/lib/schedule.js';

const subjects = (iso) => pairsFor(parseDate(iso)).map((p) => `${p.n} ${p.subject}`);

test('неделя с 1 сентября — первая и нечётная', () => {
  assert.equal(weekNumber(parseDate('2026-08-31')), 1); // понедельник той же недели
  assert.equal(weekNumber(parseDate('2026-09-06')), 1);
  assert.equal(weekNumber(parseDate('2026-09-07')), 2);
  assert.equal(weekNumber(parseDate('2026-10-14')), 7);
  assert.match(formatParity(parseDate('2026-10-14')), /7-я неделя.*нечётная/);
  assert.match(formatParity(parseDate('2026-10-19')), /8-я неделя.*чётная/);
});

test('«сегодня» считается по Якутску (UTC+9)', () => {
  // 14.10 16:00 UTC = 15.10 01:00 в Якутске
  assert.equal(today(Date.UTC(2026, 9, 14, 16)).toISOString().slice(0, 10), '2026-10-15');
  assert.equal(today(Date.UTC(2026, 9, 14, 14)).toISOString().slice(0, 10), '2026-10-14');
});

test('пары по чётности недели', () => {
  // понедельник нечётной недели — физика у подгруппы А
  assert.deepEqual(subjects('2026-10-12'), [
    '1 История России',
    '2 Физика (подгр. А)',
    '3 Введение в сквозные цифровые технологии (подгр. А)',
    '4 Иностранный язык',
  ]);
  // понедельник чётной недели — у подгруппы Б
  assert.equal(subjects('2026-10-19')[1], '2 Физика (подгр. Б)');
  // вторник: на нечётной неделе пар нет, на чётной — две
  assert.deepEqual(subjects('2026-10-13'), []);
  assert.equal(subjects('2026-10-20').length, 2);
});

test('иностранный язык — только до 22 ноября', () => {
  assert.ok(subjects('2026-11-20').includes('4 Иностранный язык')); // пятница
  assert.ok(!subjects('2026-11-27').includes('4 Иностранный язык'));
});

test('вне семестра пар нет', () => {
  assert.deepEqual(subjects('2026-08-31'), []);
  assert.deepEqual(subjects('2027-01-11'), []);
  assert.match(formatDay(parseDate('2027-01-11')), /Семестр закончился/);
  assert.match(formatWeek(parseDate('2027-01-11')), /Семестр закончился/);
  // первая неделя начинается 31.08, до семестра, но она всё равно учебная
  assert.match(formatWeek(parseDate('2026-08-31')), /1-я неделя, нечётная/);
});

// 14.10.2026, среда; время якутское
const at = (hh, mm) => Date.UTC(2026, 9, 14, hh - 9, mm);

test('текст дня и недели', () => {
  const day = formatDay(parseDate('2026-10-14'), at(12, 0));
  assert.match(day, /<b>Сегодня · среда, 14 октября<\/b>/);
  assert.match(day, /7-я неделя, нечётная · 4 пары с 08:00 до 17:25/);
  assert.match(day, /<blockquote>1️⃣ <b>08:00–09:35<\/b>\n<b>Математика<\/b> · <i>лекция<\/i>\n📍 722 А   👤 Филиппова М\.П\.<\/blockquote>/);
  assert.match(day, /☕ окно 09:50–11:25/); // 2-й пары по нечётным нет
  assert.ok(!day.includes('История России')); // она только по чётным

  assert.match(formatDay(parseDate('2026-10-15'), at(12, 0)), /<b>Завтра · четверг, 15 октября<\/b>/);
  assert.match(formatDay(parseDate('2026-10-20'), at(12, 0)), /<b>Вторник, 20 октября<\/b>/);
  assert.match(formatDay(parseDate('2026-10-13'), at(12, 0)), /Вчера · вторник[\s\S]*Пар нет/);
  assert.match(formatDay(parseDate('2026-10-17'), at(12, 0)), /💻 онлайн-курс/);

  const week = formatWeek(parseDate('2026-10-14'), at(12, 0));
  assert.match(week, /7-я неделя, нечётная<\/b>\n<i>12–18 октября<\/i>/);
  assert.match(week, /Среда, 14 октября<\/b> 👈 сегодня\n<blockquote><b>08:00<\/b> Математика <i>лек\.<\/i> · 📍 722 А/);
  assert.match(week, /Вторник, 13 октября<\/b>\n<i>пар нет<\/i>/);
  assert.ok(!week.includes('Воскресенье'));
  assert.match(formatWeek(parseDate('2026-09-28')), /28 сентября – 4 октября/);
});

test('что сейчас: пара, перерыв, конец дня', () => {
  const day = (hh, mm) => formatDay(parseDate('2026-10-14'), at(hh, mm));
  assert.match(day(7, 0), /⏳ Первая пара в 08:00 — через 1 ч\n/);
  assert.match(day(8, 30), /🟢 Идёт 1-я пара, до 09:35 — ещё 1 ч 5 мин/);
  assert.match(day(8, 30), /08:00–09:35<\/b> ← сейчас/);
  assert.match(day(13, 50), /⏳ Следующая пара в 14:00 — через 10 мин/);
  assert.match(day(17, 25), /✅ На сегодня пары закончились/);
  // для завтрашнего дня статуса нет
  assert.doesNotMatch(formatDay(parseDate('2026-10-15'), at(8, 30)), /🟢|⏳|✅|← сейчас/);
});

test('кнопки под сообщением листают дни и недели', () => {
  const now = at(12, 0);
  const buttons = (view) => view.reply_markup.inline_keyboard.flat().map((b) => `${b.text}|${b.callback_data}`);

  const todayView = replyTo({ text: '/today', chat: { type: 'private' } }, now);
  assert.deepEqual(buttons(todayView), [
    '◀️ Вт 13.10|d:2026-10-13',
    'Чт 15.10 ▶️|d:2026-10-15',
    '🔄 Обновить|d:today',
    '🗓 Вся неделя|w:2026-10-14',
  ]);
  // воскресенье пропускается
  assert.deepEqual(buttons(viewFor('d:2026-10-17', now)).slice(0, 3), [
    '◀️ Пт 16.10|d:2026-10-16',
    'Пн 19.10 ▶️|d:2026-10-19',
    '📅 Сегодня|d:today',
  ]);
  assert.equal(buttons(viewFor('d:2026-10-19', now))[0], '◀️ Сб 17.10|d:2026-10-17');

  const week = buttons(viewFor('w:2026-10-14', now));
  assert.deepEqual(week.slice(0, 6), [
    'Пн|d:2026-10-12', 'Вт|d:2026-10-13', '•Ср•|d:2026-10-14',
    'Чт|d:2026-10-15', 'Пт|d:2026-10-16', 'Сб|d:2026-10-17',
  ]);
  assert.deepEqual(week.slice(6), ['◀️ 6-я нед.|w:2026-10-05', '🔄 Обновить|w:today', '8-я нед. ▶️|w:2026-10-19']);
  // за пределами семестра номеров недель нет
  assert.equal(buttons(viewFor('w:2026-08-31', now))[6], '◀️|w:2026-08-24');
  assert.equal(buttons(viewFor('w:2026-12-28', now))[8], '▶️|w:2027-01-04');

  assert.match(viewFor('d:2026-10-16', now).text, /Пятница, 16 октября/);
  // «Сегодня» — день нажатия, а не день, когда отправили сообщение
  const thursday = Date.UTC(2026, 9, 15, 3);
  assert.match(viewFor('d:today', thursday).text, /Сегодня · четверг, 15 октября/);
  assert.match(viewFor('w:today', Date.UTC(2026, 9, 20, 3)).text, /8-я неделя, чётная/);
  assert.equal(buttons(replyTo({ text: '/parity', chat: { type: 'private' } }, now))[0], '🗓 Расписание на неделю|w:today');
  assert.equal(viewFor('d:2026-02-31', now), null);
  assert.equal(viewFor('x:2026-10-14', now), null);
  assert.equal(viewFor(undefined, now), null);
});

test('распознавание команд и кнопок', () => {
  assert.equal(actionFor('/today'), 'today');
  assert.equal(actionFor('/Today@For_Milian_bot'), 'today');
  assert.equal(actionFor('/start payload'), 'start');
  assert.equal(actionFor('📅 Сегодня'), 'today');
  assert.equal(actionFor('🔢 Чётность'), 'parity');
  assert.equal(actionFor('/todayx'), null);
  assert.equal(actionFor('привет'), null);
  assert.equal(actionFor(undefined), null);

  assert.equal(commandMention('/today@For_Milian_bot'), 'for_milian_bot');
  assert.equal(commandMention('/help@OtherBot extra'), 'otherbot');
  assert.equal(commandMention('/today'), null);
  assert.equal(commandMention('📅 Сегодня'), null);
  assert.equal(commandMention(undefined), null);
});

test('в группе бот молчит на обычные сообщения, в личке подсказывает', () => {
  assert.equal(replyTo({ text: 'привет', chat: { type: 'group' } }), null);
  assert.match(replyTo({ text: 'привет', chat: { type: 'private' } }).text, /help/);
  assert.match(replyTo({ sticker: {}, chat: { type: 'private' } }).text, /help/);
  const parity = replyTo({ text: '/parity', chat: { type: 'group' } }, Date.UTC(2026, 9, 14, 3));
  assert.match(parity.text, /7-я неделя — нечётная[\s\S]*19–25 октября\) — 8-я, чётная/);
  // /start и /help возвращают обычную клавиатуру с кнопками
  assert.ok(replyTo({ text: '/start', chat: { type: 'private' } }).reply_markup.keyboard);
});

test('dayStatus — что идёт сейчас (общее для бота и Mini App)', () => {
  const pairs = pairsFor(parseDate('2026-10-14')); // пары 1, 3, 4, 5
  assert.deepEqual(dayStatus(pairs, 7 * 60), { kind: 'next', pair: pairs[0], start: 480, end: 575, first: true });
  assert.equal(dayStatus(pairs, 8 * 60).kind, 'now');
  assert.equal(dayStatus(pairs, 9 * 60 + 35).pair.n, 3); // конец 1-й пары → ждём 3-ю
  assert.equal(dayStatus(pairs, 9 * 60 + 35).first, false);
  assert.deepEqual(dayStatus(pairs, 17 * 60 + 25), { kind: 'done' });
  assert.equal(dayStatus([], 600), null);
});

test('Mini App импортирует только то, что есть в lib/schedule.js', () => {
  const source = readFileSync(new URL('../webapp/app.js', import.meta.url), 'utf8');
  const block = /import\s*\{([^}]*)\}\s*from\s*'\.\/lib\/schedule\.js'/.exec(source);
  assert.ok(block, 'в app.js нет импорта из ./lib/schedule.js');
  const names = block[1].split(',').map((s) => s.trim()).filter(Boolean);
  const missing = names.filter((name) => !(name in schedule));
  assert.deepEqual(missing, []);
});

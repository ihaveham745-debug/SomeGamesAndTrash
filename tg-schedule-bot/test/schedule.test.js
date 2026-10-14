import assert from 'node:assert/strict';
import { test } from 'node:test';

import { actionFor, replyTo } from '../tgcloud/lib/bot.js';
import { formatDay, formatParity, formatWeek, pairsFor, parseDate, today, weekNumber } from '../tgcloud/lib/schedule.js';

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
  assert.match(formatDay(parseDate('2027-01-11'), 'Сегодня'), /Семестр закончился/);
});

test('текст дня и недели', () => {
  const day = formatDay(parseDate('2026-10-14'), 'Сегодня');
  assert.match(day, /<b>Сегодня, среда 14\.10<\/b>/);
  assert.match(day, /<b>1 пара<\/b> · 08:00–09:35\nМатематика <i>\(лекция\)<\/i>\n📍 722 А · 👤 Филиппова М\.П\./);
  assert.ok(!day.includes('История России')); // она только по чётным

  const week = formatWeek(parseDate('2026-10-14'));
  assert.match(week, /7-я неделя, нечётная<\/b> \(12\.10–18\.10\)/);
  assert.match(week, /Среда, 14\.10<\/b> 👈 сегодня/);
  assert.match(week, /Вторник, 13\.10<\/b>\nпар нет/);
  assert.ok(!week.includes('Воскресенье'));
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
});

test('в группе бот молчит на обычные сообщения, в личке подсказывает', () => {
  assert.equal(replyTo({ text: 'привет', chat: { type: 'group' } }), null);
  assert.match(replyTo({ text: 'привет', chat: { type: 'private' } }), /help/);
  assert.match(replyTo({ sticker: {}, chat: { type: 'private' } }), /help/);
  assert.match(replyTo({ text: '/parity', chat: { type: 'group' } }, Date.UTC(2026, 9, 14, 3)), /нечётная/);
});

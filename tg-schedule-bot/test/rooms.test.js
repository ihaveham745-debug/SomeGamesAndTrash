import assert from 'node:assert/strict';
import { test } from 'node:test';

import { formatDay, formatWeek, pairsFor, parseDate, validateRoomChange } from '../tgcloud/lib/schedule.js';
import { replyTo } from '../tgcloud/lib/bot.js';

// Б-ЭО-26 (расписание по умолчанию в тестах). 19.10 — чётная неделя, 26.10 — нечётная.
const MON_EVEN = '2026-10-19';
const MON_ODD = '2026-10-26';
const at = (iso, h, m = 0) => Date.parse(`${iso}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00+09:00`);
const rooms = (list) => list.map((r) => ({ authorName: 'Аня', ...r }));
const roomOf = (iso, n, list) => pairsFor(parseDate(iso), list).find((p) => p.n === n);

test('замена аудитории: на день важнее «всегда», по расписанию — если замен нет', () => {
  const history = pairsFor(parseDate(MON_EVEN))[0];
  assert.equal(history.slot, '1|1||История России');
  assert.equal(history.room, '461');

  const list = rooms([
    { slot: history.slot, date: '', room: '228 КФЕН' },
    { slot: history.slot, date: MON_ODD, room: '305' },
  ]);
  const even = roomOf(MON_EVEN, 1, list);
  assert.deepEqual([even.room, even.roomWas, even.roomDay, even.roomBy], ['228 КФЕН', '461', false, 'Аня']);
  const odd = roomOf(MON_ODD, 1, list);
  assert.deepEqual([odd.room, odd.roomDay], ['305', true]);
  // замена той же аудиторией — не замена
  assert.equal(roomOf(MON_EVEN, 1, rooms([{ slot: history.slot, date: '', room: '461' }])).roomWas, undefined);

  // в тексте бота: «вместо», в неделе — звёздочка
  assert.match(formatDay(parseDate(MON_EVEN), at(MON_EVEN, 7), [], list), /228 КФЕН <i>\(вместо 461\)<\/i>/);
  assert.match(formatWeek(parseDate(MON_EVEN), at(MON_EVEN, 7), [], list), /228 КФЕН\*/);
});

test('замена аудитории: проверки', () => {
  const physicsEven = pairsFor(parseDate(MON_EVEN)).find((p) => p.n === 2).slot; // подгр. Б — только по чётным
  assert.equal(validateRoomChange({ slot: physicsEven, date: MON_EVEN, room: '305' }), null);
  assert.equal(validateRoomChange({ slot: physicsEven, date: '', room: '305' }), null);
  assert.equal(validateRoomChange({ slot: physicsEven, date: MON_ODD, room: '305' }), 'В этот день такой пары нет');
  assert.equal(validateRoomChange({ slot: 'нет|такой', date: '', room: '305' }), 'Нет такой пары в расписании');
  assert.equal(validateRoomChange({ slot: physicsEven, date: '2026-02-31', room: '305' }), 'Неверная дата');
  assert.equal(validateRoomChange({ slot: physicsEven, date: '', room: '   ' }), 'Напиши аудиторию');
  assert.match(validateRoomChange({ slot: physicsEven, date: '', room: 'x'.repeat(31) }), /Слишком длинно/);
  assert.equal(validateRoomChange({ slot: physicsEven, date: MON_EVEN, room: null }), null); // вернуть как было
});

test('/aud: на сегодня, на дату, всегда и сброс', async () => {
  const saved = [];
  const store = {
    range: async () => [], upcoming: async () => [],
    rooms: {
      all: async () => saved,
      set: async (r) => {
        const i = saved.findIndex((x) => x.slot === r.slot && x.date === r.date);
        if (i >= 0) saved.splice(i, 1);
        saved.push(r);
      },
      clear: async (slot, date) => {
        const i = saved.findIndex((x) => x.slot === slot && x.date === date);
        if (i < 0) return false;
        saved.splice(i, 1);
        return true;
      },
    },
  };
  const now = at(MON_EVEN, 8);
  const msg = (text) => ({ text, chat: { id: 1, type: 'private' }, from: { id: 5, first_name: 'Аня' } });

  const r1 = await replyTo(msg('/aud 2 305'), now, store);
  assert.match(r1.text, /Физика \(подгр\. Б\)<\/b>, 2-я пара — теперь в <b>305<\/b> на Пн, 19 октября/);
  assert.deepEqual(saved[0], { slot: '1|2|even|Физика (подгр. Б)', date: MON_EVEN, room: '305', authorId: 5, authorName: 'Аня' });

  const r2 = await replyTo(msg('/aud 26.10 1 228 КФЕН всегда'), now, store);
  assert.match(r2.text, /теперь в <b>228 КФЕН<\/b> каждую неделю/);
  assert.equal(saved[1].date, '');

  // сегодня в расписании бота — новые аудитории
  const day = await replyTo(msg('/today'), now, store);
  assert.match(day.text, /305 <i>\(вместо 214\)<\/i>/);
  assert.match(day.text, /228 КФЕН <i>\(вместо 461\)<\/i>/);

  assert.match((await replyTo(msg('/aud 2 сброс'), now, store)).text, /замена на Пн, 19 октября убрана — снова 214/);
  assert.match((await replyTo(msg('/aud 2 сброс'), now, store)).text, /не было/);
  assert.match((await replyTo(msg('/aud 1 сброс всегда'), now, store)).text, /постоянная замена убрана/);
  assert.equal(saved.length, 0);

  assert.match((await replyTo(msg('/aud 9 305'), now, store)).text, /9-й пары нет/);
  assert.match((await replyTo(msg('/aud'), now, store)).text, /Поменять аудиторию/);
  assert.match((await replyTo(msg('/aud 26.10 2 305'), now, store)).text, /теперь в <b>305<\/b> на Пн, 26 октября/); // подгр. А по нечётным
});

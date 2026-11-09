import assert from 'node:assert/strict';
import { test } from 'node:test';

import { replyTo, viewFor } from '../tgcloud/lib/bot.js';
import { SUBJECTS, findSubject, homeworkFor, nextPairDate, validateNote } from '../tgcloud/lib/homework.js';

// ср 14.10.2026, 10:10 по Якутску
const NOW = Date.UTC(2026, 9, 14, 1, 10);
const iso = (d) => d?.toISOString().slice(0, 10) ?? null;

/** Хранилище в памяти — как lib/notes.js, только без базы. */
function memoryStore(initial = []) {
  const rows = initial.map((n, i) => ({ id: i + 1, ...n }));
  return {
    rows,
    range: async (from, to) => rows.filter((n) => n.due && n.due >= from && n.due <= to),
    upcoming: async (from) => rows.filter((n) => !n.due || n.due >= from),
    add: async (n) => {
      const row = { id: rows.length + 1, ...n };
      rows.push(row);
      return row;
    },
  };
}

const msg = (text, from = { id: 7, first_name: 'Аня', last_name: 'Петрова' }) => ({ text, from, chat: { type: 'private' } });

test('предмет находится по началу слова, первым буквам и сокращениям', () => {
  assert.equal(SUBJECTS.length, 9);
  assert.equal(findSubject('мат').subject, 'Математика');
  assert.equal(findSubject('Химия').subject, 'Химия');
  assert.equal(findSubject('орг').subject, 'Основы российской государственности');
  assert.equal(findSubject('сцт').subject, 'Введение в сквозные цифровые технологии');
  assert.equal(findSubject('физра').subject, 'Физическая культура и спорт');
  assert.equal(findSubject('англ').subject, 'Иностранный язык');
  assert.deepEqual(findSubject('физ').candidates, ['Физика', 'Физическая культура и спорт']);
  assert.equal(findSubject('абракадабра').candidates.length, 9);
});

test('ДЗ записывается к ближайшей паре предмета', () => {
  // математика сегодня в 08:00 уже прошла → четверг
  assert.equal(iso(nextPairDate('Математика', NOW)), '2026-10-15');
  // цифровые технологии сегодня в 11:40 ещё будут → сегодня
  assert.equal(iso(nextPairDate('Введение в сквозные цифровые технологии', NOW)), '2026-10-14');
  // история по средам только на чётных, по понедельникам каждую → пн 19.10
  assert.equal(iso(nextPairDate('История России', NOW)), '2026-10-19');
  // после конца семестра пар нет
  assert.equal(nextPairDate('Математика', Date.UTC(2027, 0, 10)), null);
});

test('проверка записи', () => {
  assert.equal(validateNote({ subject: 'Химия', due: null, text: 'ок' }), null);
  assert.match(validateNote({ subject: 'Химия', due: null, text: '   ' }), /Пустой/);
  assert.match(validateNote({ subject: 'Астрология', due: null, text: 'ок' }), /предмета/);
  assert.match(validateNote({ subject: 'Химия', due: '15.10', text: 'ок' }), /дата/);
  assert.match(validateNote({ subject: 'Химия', due: null, text: 'х'.repeat(1001) }), /длинно/);
});

test('/dz мат: … сохраняет задание и показывает его у пары', async () => {
  const store = memoryStore();
  const reply = await replyTo(msg('/dz мат: №5–10, стр. 42'), NOW, store);
  assert.match(reply.text, /Записал ДЗ по предмету <b>Математика<\/b> к паре Чт, 15 октября/);
  assert.equal(reply.reply_markup.inline_keyboard[0][0].callback_data, 'd:2026-10-15');
  assert.deepEqual(store.rows, [{
    id: 1, subject: 'Математика', due: '2026-10-15', text: '№5–10, стр. 42', authorId: 7, authorName: 'Аня П.',
  }]);

  // в расписании четверга — у математики, не у других пар
  const day = await viewFor('d:2026-10-15', NOW, store);
  assert.match(day.text, /<b>Математика<\/b> · <i>практика<\/i>\n📍 626   👤 Филиппова М\.П\.\n📝 №5–10, стр\. 42 <i>— Аня П\.<\/i><\/blockquote>/);
  assert.equal(day.text.match(/📝/g).length, 1);
  // в неделе — значок у строки
  const week = await viewFor('w:2026-10-15', NOW, store);
  assert.match(week.text, /Математика <i>пр\.<\/i> · 📍 626 📝/);
  assert.equal(homeworkFor(store.rows, '2026-10-15', 'Математика').length, 1);
});

test('/dz без текста — список заданий и заметок, старые не показываются', async () => {
  const store = memoryStore([
    { subject: 'Химия', due: '2026-10-15', text: 'Лаба 3 <отчёт>', authorId: 1, authorName: 'Олег' },
    { subject: 'Физика', due: '2026-10-16', text: 'Задачи 1–4', authorId: 2, authorName: null },
    { subject: 'Математика', due: '2026-10-01', text: 'старое', authorId: 1, authorName: 'Олег' },
    { subject: 'Химия', due: null, text: 'Формулы на стр. 12', authorId: 3, authorName: 'Ира' },
  ]);
  const { text } = await replyTo(msg('/dz'), NOW, store);
  assert.match(text, /<b>Чт, 15 октября<\/b>\n• <b>Химия<\/b>: Лаба 3 &lt;отчёт&gt; <i>— Олег<\/i>/);
  assert.match(text, /<b>Пт, 16 октября<\/b>\n• <b>Физика<\/b>: Задачи 1–4\n/);
  assert.ok(!text.includes('старое'));
  assert.match(text, /🗒 <b>Заметки<\/b>\n• <b>Химия<\/b>: Формулы на стр\. 12 <i>— Ира<\/i>/);

  // кнопка «📝 Задания» внизу — то же самое
  assert.equal((await replyTo(msg('📝 Задания'), NOW, store)).text, text);
  // пусто
  assert.match((await replyTo(msg('/dz'), NOW, memoryStore())).text, /Пока ничего не задано/);
});

test('/note и ошибки ввода', async () => {
  const store = memoryStore();
  assert.match((await replyTo(msg('/note хим: формулы на стр. 12'), NOW, store)).text, /Заметка по предмету <b>Химия<\/b> сохранена/);
  assert.equal(store.rows[0].due, null);

  assert.match((await replyTo(msg('/dz мат №5'), NOW, store)).text, /двоеточия/);
  assert.match((await replyTo(msg('/dz физ: задачи'), NOW, store)).text, /Не понял, какой предмет: «физ»[\s\S]*• Физика\n• Физическая культура и спорт/);
  assert.match((await replyTo(msg('/dz мат:   '), NOW, store)).text, /А что задали/);
  assert.match((await replyTo(msg('/note'), NOW, store)).text, /Заметка: <code>\/note/);
  assert.equal(store.rows.length, 1);

  // в группе с упоминанием бота и многострочным текстом
  const group = { text: '/dz@For_Milian_bot хим: 1) лаба\n2) отчёт', from: { id: 9, first_name: 'Ким' }, chat: { type: 'supergroup' } };
  assert.match((await replyTo(group, NOW, store)).text, /Записал ДЗ по предмету <b>Химия<\/b>/);
  assert.equal(store.rows[1].text, '1) лаба\n2) отчёт');

  // если база упала — понятный ответ, а не тишина
  const broken = { ...memoryStore(), add: async () => { throw new Error('db down'); } };
  assert.match((await replyTo(msg('/dz мат: x'), NOW, broken)).text, /Не получилось сохранить/);
});

test('длинный список заданий обрезается по строкам и не ломает разметку', async () => {
  const many = Array.from({ length: 80 }, (_, i) => ({
    subject: 'Химия', due: '2026-10-15', text: `задание ${i} `.repeat(6), authorId: 1, authorName: 'Олег',
  }));
  const { text } = await replyTo(msg('/dz'), NOW, memoryStore(many));
  assert.ok(text.length <= 4096, `length ${text.length}`);
  assert.match(text, /Всё целиком — в приложении/);
  for (const tag of ['b', 'i', 'code']) {
    assert.equal((text.match(new RegExp(`<${tag}>`, 'g')) ?? []).length, (text.match(new RegExp(`</${tag}>`, 'g')) ?? []).length, tag);
  }
});

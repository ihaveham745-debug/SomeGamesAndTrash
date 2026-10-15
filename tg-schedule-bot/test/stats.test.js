import assert from 'node:assert/strict';
import { test } from 'node:test';

import { actionFor, replyTo } from '../tgcloud/lib/bot.js';

// чт 15.10.2026, 12:00 по Якутску
const NOW = Date.UTC(2026, 9, 15, 3, 0);
const sec = (ms) => Math.floor(ms / 1000);
const HOUR = 3600_000;
const DAY = 24 * HOUR;

const users = [
  { name: 'Аня П.', username: 'anya', firstSeen: sec(NOW - 2 * HOUR), lastSeen: sec(NOW - HOUR), hits: 5, appOpens: 2 },
  { name: null, username: 'petya', firstSeen: sec(NOW - 20 * DAY), lastSeen: sec(NOW - DAY), hits: 3, appOpens: 0 },
  { name: 'Оля <3', username: null, firstSeen: sec(NOW - 30 * DAY), lastSeen: sec(NOW - 10 * DAY), hits: 1, appOpens: 0 },
];
const store = { stats: async () => ({ users, tasks: 4, notes: 1 }) };
const msg = (text) => ({ text, from: { id: 1 }, chat: { type: 'group' } });

test('/stats считает людей и показывает, кто заходил', async () => {
  assert.equal(actionFor('/stats@For_Milian_bot'), 'stats');
  const { text } = await replyTo(msg('/stats'), NOW, store);
  assert.match(text, /Всего: <b>3<\/b> человека/);
  assert.match(text, /Сегодня: <b>1<\/b> · за неделю: <b>2<\/b>/);
  assert.match(text, /Новых за неделю: <b>1<\/b>/);
  assert.match(text, /приложение: <b>1<\/b>/);
  assert.match(text, /Заданий записано: <b>4<\/b> · 🗒 заметок: <b>1<\/b>/);
  assert.match(text, /• Аня П\. 📱 — сегодня 11:00/);
  assert.match(text, /• @petya — вчера 12:00/);
  assert.match(text, /• Оля &lt;3 — 5 октября/);
});

test('/stats без базы не падает', async () => {
  const { text } = await replyTo(msg('/stats'), NOW);
  assert.match(text, /недоступна/);
});

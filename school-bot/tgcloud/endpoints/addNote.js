// POST /api/addNote — новое задание (due — дата урока) или заметка к предмету (due = null).
// private: true — личная запись, её увидит только автор.

import { EndpointError } from 'sdk';
import { cleanText, groupOf, validateNote } from '../lib/homework.js';
import { store } from '../lib/notes.js';

export default async function (input, ctx) {
  const user = ctx.initData.user;
  if (!user) throw new EndpointError('Открой приложение из чата с ботом', { code: 'NO_USER' });

  const note = { cls: input.cls, subject: input.subject, due: input.due ?? null, text: cleanText(input.text) };
  const error = validateNote(note);
  if (error) throw new EndpointError(error, { code: 'INVALID' });

  const authorName = [user.first_name, user.last_name && `${user.last_name[0]}.`].filter(Boolean).join(' ') || user.username || null;
  const isPrivate = input.private === true;
  return { note: await store.add({ ...note, cls: groupOf(note.cls, note.subject), private: isPrivate, authorId: user.id, authorName }) };
}

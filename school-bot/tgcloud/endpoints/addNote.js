// POST /api/addNote — новое задание (due — дата урока) или заметка к предмету (due = null).
// private: true — личная запись, её увидит только автор.
// file: { name, type, data: base64 } — прикрепить файл (уходит в Telegram, в базе — file_id).

import { BotApiError, EndpointError } from 'sdk';
import { cleanText, groupOf, validateNote, MAX_FILE_MB } from '../lib/homework.js';
import { store } from '../lib/notes.js';
import { uploadFile } from '../lib/files.js';

export default async function (input, ctx) {
  const user = ctx.initData?.user;
  if (!user) throw new EndpointError('открой приложение из чата с ботом', { code: 'NO_USER' });

  const note = { cls: input.cls, subject: input.subject, due: input.due ?? null, text: cleanText(input.text) };
  const error = validateNote({ ...note, fileId: input.file ? 'pending' : null });
  if (error) throw new EndpointError(error, { code: 'INVALID' });

  let file = null;
  if (input.file) {
    try {
      file = await uploadFile(user.id, input.file);
    } catch (err) {
      if (err.message === 'TOO_BIG') throw new EndpointError(`файл больше ${MAX_FILE_MB} мб`, { code: 'TOO_BIG' });
      if (err.message === 'EMPTY') throw new EndpointError('пустой файл', { code: 'INVALID' });
      if (err instanceof BotApiError) {
        console.warn('upload failed', err.description);
        throw new EndpointError('не получилось загрузить файл. напиши боту /start и попробуй ещё раз', { code: 'UPLOAD' });
      }
      throw err;
    }
  }

  const authorName = [user.first_name, user.last_name && `${user.last_name[0]}.`].filter(Boolean).join(' ') || user.username || null;
  const isPrivate = input.private === true;
  return {
    note: await store.add({
      ...note, ...file, cls: groupOf(note.cls, note.subject), private: isPrivate, authorId: user.id, authorName,
    }),
  };
}

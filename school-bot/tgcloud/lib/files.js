// lib/files — файлы к записям: загрузить в Telegram и прислать обратно.
// Своего хранилища нет: файл живёт в Telegram, в базе — его file_id (см. schema.js).

import { api, InputFile } from 'sdk';
import { ddmm, parseDate } from './schedule.js';
import { MAX_FILE_MB } from './homework.js';

// Каким методом Bot API отправлять файл каждого вида и в каком поле.
const SEND = {
  photo: ['sendPhoto', 'photo'],
  video: ['sendVideo', 'video'],
  animation: ['sendAnimation', 'animation'],
  audio: ['sendAudio', 'audio'],
  voice: ['sendVoice', 'voice'],
  document: ['sendDocument', 'document'],
};

/** Прислать файл записи в чат, с подписью «предмет, дата: текст». */
export function sendNoteFile(chatId, note) {
  const [method, field] = SEND[note.fileKind] ?? SEND.document;
  const head = `${note.subject}${note.due ? `, ${ddmm(parseDate(note.due))}` : ''}`;
  const caption = (note.text ? `${head}: ${note.text}` : head).slice(0, 1000);
  return api[method]({ chat_id: chatId, [field]: note.fileId, caption });
}

// base64 — вручную: в облаке нет atob/btoa.
const ABC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const INDEX = new Map([...ABC].map((c, i) => [c, i]));

export function fromBase64(data) {
  const clean = data.replace(/[^A-Za-z0-9+/]/g, '');
  const bytes = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let n = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const a = INDEX.get(clean[i]);
    const b = INDEX.get(clean[i + 1]) ?? 0;
    const c = INDEX.get(clean[i + 2]);
    const d = INDEX.get(clean[i + 3]);
    bytes[n++] = (a << 2) | (b >> 4);
    if (c !== undefined) bytes[n++] = ((b & 15) << 4) | (c >> 2);
    if (d !== undefined) bytes[n++] = ((c & 3) << 6) | d;
  }
  return bytes.subarray(0, n);
}

export function toBase64(bytes) {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = bytes[i + 1];
    const c = bytes[i + 2];
    out += ABC[a >> 2] + ABC[((a & 3) << 4) | ((b ?? 0) >> 4)]
      + (b === undefined ? '=' : ABC[((b & 15) << 2) | ((c ?? 0) >> 6)])
      + (c === undefined ? '=' : ABC[c & 63]);
  }
  return out;
}

/**
 * Файл из Mini App ({ name, type, data: base64 }) → в Telegram → { fileId, fileKind, fileName }.
 * Чтобы получить file_id, бот отправляет файл человеку в личку и сразу удаляет это сообщение.
 * Картинки — фото (Telegram покажет их картинкой), остальное — документом.
 */
export async function uploadFile(userId, file) {
  const name = String(file?.name || 'файл').slice(0, 120);
  const type = String(file?.type || 'application/octet-stream');
  if (typeof file?.data !== 'string' || !file.data) throw new Error('EMPTY');
  const bytes = fromBase64(file.data);
  if (bytes.length > MAX_FILE_MB * 1024 * 1024) throw new Error('TOO_BIG');

  const asPhoto = /^image\/(jpeg|png|webp)$/.test(type);
  const [method, field] = asPhoto ? SEND.photo : SEND.document;
  const msg = await api[method]({
    chat_id: userId,
    [field]: new InputFile(bytes, name, { type }),
    disable_notification: true,
  });
  api.deleteMessage({ chat_id: userId, message_id: msg.message_id }).catch(() => {});

  if (asPhoto) return { fileId: msg.photo.at(-1).file_id, fileKind: 'photo', fileName: name };
  // Telegram может сам решить, что документ — это видео или гифка
  const kind = Object.keys(SEND).find((k) => k !== 'photo' && msg[k]?.file_id) ?? 'document';
  return { fileId: msg[kind].file_id, fileKind: kind, fileName: name };
}

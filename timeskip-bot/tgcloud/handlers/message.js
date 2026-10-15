// handlers/message — бот только зовёт в Mini App с играми.

import { api } from 'sdk';

const APP_URL = 'https://app8843830120.tgcloud.ai/';

const WELCOME = [
  '🎰 <b>TimeSkip</b> — мини-игры, чтобы убить время',
  '',
  '🎰 Слоты · 🃏 Блэкджек · 🎡 Рулетка · ♠️ Видеопокер · 🧱 Блоки · ♟ Шахматы',
  '',
  'Играем на игровые фишки: их нельзя купить или вывести, а когда закончатся — дадим ещё бесплатно.',
  '',
  'Жми <b>«Играть»</b> 👇',
].join('\n');

const COMMANDS = [
  { command: 'play', description: '🎰 Открыть игры' },
  { command: 'start', description: '👋 О боте' },
];

const COMMAND = /^\/([a-z_]+)(?:@(\w+))?(?:\s|$)/i;

export default async function (message, ctx) {
  const match = COMMAND.exec(message.text?.trim() ?? '');
  const isPrivate = message.chat.type === 'private';
  // В группах отвечаем только на свои команды.
  if (!isPrivate) {
    if (!match || !['start', 'play'].includes(match[1].toLowerCase())) return;
    const me = await api.getMe();
    if (match[2] && match[2].toLowerCase() !== me.username.toLowerCase()) return;
    await api.sendMessage({
      chat_id: message.chat.id,
      ...(message.is_topic_message && { message_thread_id: message.message_thread_id }),
      text: '🎰 Игры открываются в личке с ботом',
      reply_markup: { inline_keyboard: [[{ text: '🎰 Играть', url: `https://t.me/${me.username}?start=play` }]] },
    });
    return;
  }

  // Приглашение в шахматы: t.me/<бот>?start=chess_<код> → кнопка, открывающая эту партию.
  const invite = /^\/start\s+chess_([a-z0-9]{4,16})$/i.exec(message.text?.trim() ?? '');
  if (invite) {
    await api.sendMessage({
      chat_id: message.chat.id,
      text: '♟ Тебя позвали сыграть в шахматы!\nЖми кнопку — партия откроется.',
      reply_markup: { inline_keyboard: [[{ text: '♟ Открыть партию', web_app: { url: `${APP_URL}?chess=${invite[1].toLowerCase()}` } }]] },
    });
  }

  if (match?.[1].toLowerCase() === 'start') {
    const results = await Promise.allSettled([
      api.setMyCommands({ commands: COMMANDS }),
      api.setChatMenuButton({ menu_button: { type: 'web_app', text: 'Играть', web_app: { url: APP_URL } } }),
      api.setMyDescription({ description: '🎰 Слоты, блэкджек, рулетка, видеопокер, блоки и шахматы (с ботом, вдвоём или с другом онлайн) — просто чтобы убить время.' }),
      api.setMyShortDescription({ short_description: '🎰 Мини-игры: слоты, блэкджек, рулетка, покер, блоки, шахматы' }),
    ]);
    for (const r of results) {
      if (r.status === 'rejected') console.warn('bot profile setup failed', r.reason?.description ?? r.reason);
    }
  }

  if (invite) return;
  await api.sendMessage({
    chat_id: message.chat.id,
    text: WELCOME,
    parse_mode: 'HTML',
    reply_markup: { inline_keyboard: [[{ text: '🎰 Играть', web_app: { url: APP_URL } }]] },
  });
}

// lib/chessgames — шахматы и шашки с другом онлайн: партии в базе, проверка ходов, уведомления.

import { api, db, EndpointError } from 'sdk';
import { and, desc, eq, isNull, or } from 'sdk/db';
import { chessGames } from '../schema.js';
import * as chess from './chess.js';
import * as checkers from './checkers.js';

// Правила каждой игры: восстановить позицию, найти ход, итог, запись хода.
const RULES = {
  chess: {
    replay: chess.replay, findMove: chess.findMove, outcome: chess.outcome,
    notation: (state, move) => chess.san(state, move, true), name: 'шахматы', icon: '♟',
  },
  checkers: {
    replay: checkers.replay, findMove: checkers.findMove, outcome: checkers.outcome,
    notation: checkers.notation, name: 'шашки', icon: '⛀',
  },
};
const rulesOf = (game) => RULES[game.kind] ?? RULES.chess;

export const APP_URL = 'https://app8843830120.tgcloud.ai/';
const NOTIFY_IF_AWAY = 20; // секунд: если соперник не смотрит партию дольше — пишем ему в личку

const now = () => Math.floor(Date.now() / 1000);

export function playerName(user) {
  return [user.first_name, user.last_name && `${user.last_name[0]}.`].filter(Boolean).join(' ') || (user.username ? `@${user.username}` : 'Игрок');
}

export function requireUser(ctx) {
  const user = ctx.initData?.user;
  if (!user?.id) throw new EndpointError('Открой игру из Телеграма', { code: 'NO_USER' });
  return user;
}

function randomCode() {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => alphabet[b % alphabet.length]).join('');
}

const movesOf = (game) => (game.moves ? game.moves.split(' ') : []);

/** Что отдаём приложению. */
export function view(game, userId) {
  const you = game.whiteId === userId ? 'w' : game.blackId === userId ? 'b' : null;
  return {
    code: game.code,
    kind: game.kind ?? 'chess',
    white: game.whiteId ? { id: game.whiteId, name: game.whiteName } : null,
    black: game.blackId ? { id: game.blackId, name: game.blackName } : null,
    moves: movesOf(game),
    status: game.status,
    result: game.result,
    reason: game.reason,
    you,
    updated: game.updated,
  };
}

export async function getGame(code) {
  if (typeof code !== 'string' || !/^[a-z0-9]{4,16}$/.test(code)) throw new EndpointError('Партия не найдена', { code: 'NOT_FOUND' });
  const game = await db.select().from(chessGames).where(eq(chessGames.code, code)).get();
  if (!game) throw new EndpointError('Партия не найдена', { code: 'NOT_FOUND' });
  return game;
}

export async function createGame(user, color, kind = 'chess') {
  if (!RULES[kind]) throw new EndpointError('Нет такой игры', { code: 'BAD_KIND' });
  const side = color === 'w' || color === 'b' ? color : Math.random() < 0.5 ? 'w' : 'b';
  const seat = side === 'w'
    ? { whiteId: user.id, whiteName: playerName(user), whiteSeen: now() }
    : { blackId: user.id, blackName: playerName(user), blackSeen: now() };
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const [game] = await db.insert(chessGames).values({ code: randomCode(), kind, ...seat }).returning();
      return game;
    } catch (err) {
      if (attempt === 4) throw err; // совпал код — пробуем другой
    }
  }
  return null;
}

/** Сесть за свободный цвет. Если оба места заняты другими — смотрим как зритель. */
export async function joinGame(game, user) {
  if (game.whiteId === user.id || game.blackId === user.id) return touch(game, user.id);
  if (game.status !== 'waiting') return game;
  const seat = game.whiteId ? { blackId: user.id, blackName: playerName(user) } : { whiteId: user.id, whiteName: playerName(user) };
  // Условие на пустое место — чтобы двое одновременно не сели на один стул.
  const free = and(eq(chessGames.status, 'waiting'), isNull(game.whiteId ? chessGames.blackId : chessGames.whiteId));
  const [updated] = await db.update(chessGames)
    .set({ ...seat, status: 'active', updated: now(), [game.whiteId ? 'blackSeen' : 'whiteSeen']: now() })
    .where(and(eq(chessGames.id, game.id), free))
    .returning();
  if (!updated) return getGame(game.code);
  // Создателю — что соперник пришёл.
  const host = game.whiteId ?? game.blackId;
  await notify(host, `${rulesOf(updated).icon} <b>${escapeHtml(playerName(user))}</b> принял(а) вызов — партия началась!`, updated);
  return updated;
}

/** Отметить, что игрок смотрит партию. */
export async function touch(game, userId) {
  const field = game.whiteId === userId ? 'whiteSeen' : game.blackId === userId ? 'blackSeen' : null;
  if (!field) return game;
  const [updated] = await db.update(chessGames).set({ [field]: now() }).where(eq(chessGames.id, game.id)).returning();
  return updated ?? game;
}

export async function makeMove(game, user, uci, ply) {
  const you = game.whiteId === user.id ? 'w' : game.blackId === user.id ? 'b' : null;
  if (!you) throw new EndpointError('Ты не играешь в этой партии', { code: 'NOT_PLAYER' });
  if (game.status !== 'active') throw new EndpointError('Партия не идёт', { code: 'NOT_ACTIVE' });
  const moves = movesOf(game);
  if (ply !== moves.length) throw new EndpointError('Позиция уже изменилась', { code: 'STALE' });
  const rules = rulesOf(game);
  const state = rules.replay(moves);
  if (state.turn !== you) throw new EndpointError('Сейчас ход соперника', { code: 'NOT_YOUR_TURN' });
  const move = rules.findMove(state, uci);
  if (!move) throw new EndpointError('Так ходить нельзя', { code: 'ILLEGAL' });

  const notation = rules.notation(state, move);
  const after = rules.replay([...moves, uci]);
  const end = rules.outcome(after);
  const set = {
    moves: [...moves, uci].join(' '),
    updated: now(),
    [you === 'w' ? 'whiteSeen' : 'blackSeen']: now(),
    ...(end.over && { status: 'over', result: end.result, reason: end.reason }),
  };
  // Старый список ходов в условии: если параллельно прошёл другой ход, этот не запишется.
  const [updated] = await db.update(chessGames).set(set)
    .where(and(eq(chessGames.id, game.id), eq(chessGames.moves, game.moves)))
    .returning();
  if (!updated) throw new EndpointError('Позиция уже изменилась', { code: 'STALE' });

  const opponent = you === 'w' ? game.blackId : game.whiteId;
  const seen = you === 'w' ? game.blackSeen : game.whiteSeen;
  if (now() - seen > NOTIFY_IF_AWAY) {
    const who = escapeHtml(playerName(user));
    const icon = rules.icon;
    const text = end.over
      ? `${icon} ${who}: ${notation}\n${endText(end, you === 'w' ? 'b' : 'w')}`
      : `${icon} ${who} сходил(а) <b>${notation}</b>. Твой ход!`;
    await notify(opponent, text, game);
  }
  return updated;
}

export async function resign(game, user) {
  const you = game.whiteId === user.id ? 'w' : game.blackId === user.id ? 'b' : null;
  if (!you) throw new EndpointError('Ты не играешь в этой партии', { code: 'NOT_PLAYER' });
  if (game.status === 'over') return game;
  // Сдаться до прихода соперника — просто отменить приглашение.
  const result = game.status === 'waiting' ? null : you === 'w' ? '0-1' : '1-0';
  const [updated] = await db.update(chessGames)
    .set({ status: 'over', result, reason: game.status === 'waiting' ? 'cancelled' : 'resign', updated: now() })
    .where(eq(chessGames.id, game.id)).returning();
  if (result) {
    const opponent = you === 'w' ? game.blackId : game.whiteId;
    await notify(opponent, `🏳 ${escapeHtml(playerName(user))} сдался(-ась). Победа твоя!`, game);
  }
  return updated;
}

export async function myGames(userId, kind = 'chess') {
  return db.select().from(chessGames)
    .where(and(eq(chessGames.kind, kind), or(eq(chessGames.whiteId, userId), eq(chessGames.blackId, userId))))
    .orderBy(desc(chessGames.updated)).limit(15).all();
}

function endText(end, forColor) {
  if (end.reason === 'mate') return end.winner === forColor ? 'Мат! Ты победил(а) 🏆' : 'Мат. Партия проиграна.';
  if (end.reason === 'nomoves') return end.winner === forColor ? 'У соперника не осталось ходов. Победа! 🏆' : 'Ходов не осталось. Партия проиграна.';
  const why = {
    stalemate: 'пат', fifty: 'правило 50 ходов', repetition: 'троекратное повторение', material: 'мало фигур', kings: '15 ходов дамками без взятий',
  }[end.reason];
  return `Ничья — ${why}.`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[ch]));
}

/** Сообщение игроку в личку с кнопкой «Открыть партию». Если бот ему писать не может — молча пропускаем. */
async function notify(userId, text, game) {
  if (!userId) return;
  const param = game.kind === 'checkers' ? 'checkers' : 'chess';
  try {
    await api.sendMessage({
      chat_id: userId,
      text,
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: [[{ text: `${rulesOf(game).icon} Открыть партию`, web_app: { url: `${APP_URL}?${param}=${game.code}` } }]] },
    });
  } catch (err) {
    console.warn('chess notify failed', err.description ?? err);
  }
}

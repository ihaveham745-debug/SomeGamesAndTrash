// lib/bot — тексты и кнопки игры в группе, разбор нажатий. Без 'sdk', чтобы проверять тестами.
//
// Одна игра на чат. Сообщение игры одно и меняется на месте; роль каждый смотрит кнопкой
// «моя роль» — Telegram показывает всплывающее окно только тому, кто нажал.
//
// callback_data: j — играю/выйти, s — начать, c — категория, n — число шпионов, h — подсказка шпиону,
// r — моя роль, v:<id> — голос, g — шпион угадывает, gi:<i> — вариант, e — итоги, x — отменить/закончить,
// a — ещё раз.

import {
  MIN_PLAYERS, allVoted, cycleCategory, cycleSpies, finishVote, guess, isPlayer, isSpy, maxSpies, newLobby,
  openGuess, playerName, rematch, roleText, startGame, stopGame, tally, toggleHint, toggleJoin, toggleMode, vote,
} from './game.js';
import { CATEGORIES, categoryName } from './words.js';

export const MINI_APP_URL = 'https://app8801791786.tgcloud.ai/';

export const COMMANDS = [
  { command: 'spy', description: '🕵️ новая игра в шпиона (в группе)' },
  { command: 'rules', description: '📖 правила' },
  { command: 'stop', description: '✖ отменить игру (ведущий)' },
];

export const DESCRIPTION = [
  '🕵️ Игра «Шпион»',
  '',
  'У всех игроков одно общее слово — кроме шпиона: у него другое слово той же темы.',
  'Вычислите его по вопросам!',
  '',
  'Добавь бота в группу и напиши /spy — или играй с одного телефона в приложении.',
].join('\n');

export const SHORT_DESCRIPTION = '🕵️ Шпион: у всех одно слово, у шпиона — другое той же темы. Играй в группе или с одного телефона';

export const RULES = [
  '📖 <b>Правила «Шпиона»</b>',
  '',
  '1. Все, кроме шпиона, получают одно и то же слово (место, еду, животное…). У шпиона — другое слово той же темы,',
  '   и он сам не знает, что он шпион. (В режиме «без слова» шпион знает, кто он, но слова не знает.)',
  '2. Каждый смотрит свою роль кнопкой «🎭 моя роль» — её видит только он.',
  '3. По очереди задавайте друг другу вопросы про слово, не называя его: «ты бы там был зимой?», «это дорого?».',
  '4. Шпион слушает и притворяется, что знает слово.',
  '5. Когда готовы — голосуйте кнопками, кто шпион. Набрал больше всех голосов шпион — победили мирные, нет — шпион.',
  '6. В режиме «без слова» шпион может раскрыться и угадать слово из 8 вариантов: угадал — победа шпиона.',
  '',
  'Играть: добавь бота в группу и напиши /spy. С одного телефона — в приложении.',
].join('\n');

export const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Как назвать игрока: имя и первая буква фамилии, или @ник. */
export function userName(user) {
  return [user?.first_name, user?.last_name && `${user.last_name[0]}.`].filter(Boolean).join(' ') || user?.username || 'игрок';
}

const btn = (text, data) => ({ text, callback_data: data });
const names = (state, ids) => ids.map((id) => `<b>${esc(playerName(state, id))}</b>`).join(', ');
const plural = (n, one, few, many) => {
  const n10 = n % 10;
  const n100 = n % 100;
  if (n10 === 1 && n100 !== 11) return one;
  if (n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14)) return few;
  return many;
};

/** Сообщение игры для её состояния: { text, reply_markup }. */
export function render(state) {
  if (state.status === 'lobby') {
    const n = state.players.length;
    const list = state.players.map((p, i) => `${i + 1}. ${esc(p.name)}${p.id === state.hostId ? ' 👑' : ''}`).join('\n');
    return {
      text: [
        '🕵️ <b>Шпион</b> — набираем игроков',
        '',
        list,
        '',
        `тема: <b>${esc(categoryName(state.category))}</b> · шпионов: <b>${state.spyCount}</b>`,
        state.mode === 'classic'
          ? `режим: <b>шпион без слова</b> — знает, что он шпион${state.hint ? ', и знает тему' : ''}`
          : 'режим: <b>другое слово</b> — у шпиона другое слово той же темы, и он не знает, что он шпион',
        '',
        n < MIN_PLAYERS
          ? `жми «✋ играю» — нужно ещё ${MIN_PLAYERS - n} ${plural(MIN_PLAYERS - n, 'игрок', 'игрока', 'игроков')}`
          : `игроков: ${n}. ведущий 👑 нажимает «начать», когда все соберутся`,
      ].join('\n'),
      reply_markup: {
        inline_keyboard: [
          [btn('✋ играю / выйти', 'j'), btn('▶️ начать', 's')],
          [btn(`🗂 ${categoryName(state.category)}`, 'c'), btn(`🕵️ ×${state.spyCount}`, 'n')],
          [btn(state.mode === 'classic' ? '🎭 режим: без слова' : '🎭 режим: другое слово', 'm'),
            ...(state.mode === 'classic' ? [btn(`💡 ${state.hint ? 'подсказка' : 'без подсказки'}`, 'h')] : [])],
          [btn('✖ отменить', 'x')],
        ],
      },
    };
  }

  if (state.status === 'play') {
    const { counts } = tally(state);
    const votesOf = (id) => counts.find((c) => c.id === id)?.votes ?? 0;
    const voted = Object.keys(state.votes).length;
    const rows = [];
    for (let i = 0; i < state.players.length; i += 2) {
      rows.push(state.players.slice(i, i + 2).map((p) => btn(`${p.name}${votesOf(p.id) ? ` · ${votesOf(p.id)}` : ''}`.slice(0, 40), `v:${p.id}`)));
    }
    return {
      text: [
        '🕵️ <b>Игра началась!</b>',
        '',
        `игроков: ${state.players.length}, шпионов: ${state.spyIds.length}${state.spyWord || state.hint ? ` · тема: <b>${esc(CATEGORIES[state.wordCategory].name)}</b>` : ''}`,
        ...(state.spyWord ? ['<i>у шпиона другое слово той же темы — и он сам не знает, что он шпион</i>'] : []),
        '',
        '1. жми «🎭 моя роль» — увидишь только ты',
        `2. по очереди задавайте вопросы, первым спрашивает <b>${esc(playerName(state, state.firstId))}</b>`,
        '3. голосуйте кнопками с именами, кто шпион',
        '',
        `проголосовали: ${voted} из ${state.players.length}${voted ? ` (${names(state, Object.keys(state.votes).map(Number))})` : ''}`,
      ].join('\n'),
      reply_markup: {
        inline_keyboard: [
          [btn('🎭 моя роль', 'r')],
          ...rows,
          ...(state.spyWord ? [] : [[btn('🕵️ я шпион — угадать слово', 'g')]]),
          [btn('📊 итоги', 'e'), btn('✖ закончить', 'x')],
        ],
      },
    };
  }

  if (state.status === 'guess') {
    const rows = [];
    for (let i = 0; i < state.options.length; i += 2) {
      rows.push(state.options.slice(i, i + 2).map((w, j) => btn(w, `gi:${i + j}`)));
    }
    return {
      text: `🕵️ <b>${esc(playerName(state, state.guesserId))}</b> раскрылся — это шпион!\n\nтеперь он угадывает слово. угадает — победа шпиона, нет — победа мирных.`,
      reply_markup: { inline_keyboard: rows },
    };
  }

  if (state.status === 'cancelled') return { text: '🕵️ игру отменили. новая — /spy', reply_markup: { inline_keyboard: [] } };

  // over
  const lines = [
    '🏁 <b>Игра окончена</b>',
    '',
    `слово: <b>${esc(state.word)}</b> (${esc(CATEGORIES[state.wordCategory].name)})`,
    `${state.spyIds.length > 1 ? 'шпионы' : 'шпион'}: ${names(state, state.spyIds)}${state.spyWord ? ` — у него было слово <b>${esc(state.spyWord)}</b>` : ''}`,
    '',
  ];
  if (state.reason === 'caught' || state.reason === 'wrong') {
    lines.push(`больше всех голосов у ${names(state, [state.suspect])} — ${state.reason === 'caught' ? 'это шпион! 🎯' : 'а это не шпион 😬'}`);
  } else if (state.reason === 'tie') {
    lines.push('голоса разделились — шпиона не вычислили');
  } else if (state.reason === 'guessed') {
    lines.push(`шпион угадал слово «${esc(state.guessed)}» 🎯`);
  } else if (state.reason === 'missed') {
    lines.push(`шпион назвал «${esc(state.guessed)}» — мимо 😬`);
  } else {
    lines.push('игру закончили досрочно');
  }
  const { counts } = tally(state);
  const voteLines = counts.filter((c) => c.votes > 0).map((c) => `${esc(playerName(state, c.id))} — ${c.votes}`);
  if (voteLines.length && state.reason !== 'guessed' && state.reason !== 'missed') lines.push('', `голоса: ${voteLines.join(', ')}`);
  if (state.winner) lines.push('', state.winner === 'players' ? '🎉 <b>победили мирные!</b>' : '🕵️ <b>победа шпиона!</b>');
  return { text: lines.join('\n'), reply_markup: { inline_keyboard: [[btn('🔁 ещё раз', 'a')]] } };
}

const HOST_ONLY = new Set(['s', 'c', 'n', 'h', 'm', 'x', 'a']);

/**
 * Нажатие кнопки игры: → { state, alert?, toast? }. state — новое состояние (то же, если ничего не поменялось),
 * alert — всплывающее окно только нажавшему (роль), toast — короткая подсказка.
 */
export function press(state, data, user, rnd = Math.random) {
  const me = { id: user.id, name: userName(user) };
  if (HOST_ONLY.has(data) && me.id !== state.hostId && !(data === 'x' && state.status === 'over')) {
    return { state, toast: `это может только ведущий — ${playerName(state, state.hostId)}` };
  }
  const apply = (res, ok) => (res.error ? { state, toast: res.error } : { state: res.state, toast: ok });

  if (data === 'j') {
    const res = toggleJoin(state, me);
    return apply(res, res.joined ? 'ты в игре ✋' : 'ты вышел из игры');
  }
  if (data === 's') return apply(startGame(state, rnd), 'игра началась — жми «моя роль»');
  if (data === 'c') return state.status === 'lobby' ? { state: cycleCategory(state) } : { state };
  if (data === 'n') {
    if (state.status !== 'lobby') return { state };
    const next = cycleSpies(state);
    return { state: next, toast: next.spyCount === state.spyCount ? `при ${state.players.length} игроках — ${maxSpies(state.players.length)} шпион(а)` : undefined };
  }
  if (data === 'h') return state.status === 'lobby' ? { state: toggleHint(state) } : { state };
  if (data === 'm') return state.status === 'lobby' ? { state: toggleMode(state) } : { state };
  if (data === 'r') return { state, alert: roleText(state, me.id) };
  if (data.startsWith('v:')) {
    const res = vote(state, me.id, Number(data.slice(2)));
    if (res.error) return { state, toast: res.error };
    if (allVoted(res.state)) return { state: finishVote(res.state).state, toast: 'все проголосовали!' };
    return { state: res.state, toast: `твой голос: ${playerName(state, Number(data.slice(2)))}` };
  }
  if (data === 'g') return apply(openGuess(state, me.id, rnd));
  if (data.startsWith('gi:')) return apply(guess(state, me.id, Number(data.slice(3))));
  if (data === 'e') {
    if (me.id !== state.hostId && !isPlayer(state, me.id)) return { state, toast: 'ты не в этой игре' };
    if (Object.keys(state.votes).length === 0) return { state, toast: 'ещё никто не проголосовал' };
    return apply(finishVote(state));
  }
  if (data === 'x') {
    if (state.status === 'lobby') return { state: { ...state, status: 'cancelled' }, toast: 'игра отменена' };
    if (state.status === 'over') return { state };
    return { state: stopGame(state) };
  }
  if (data === 'a') return state.status === 'over' ? { state: rematch(state), toast: 'новая игра — жмите «играю»' } : { state };
  return { state };
}

/** Можно ли начать новую игру в чате, где уже есть эта. */
export const isActive = (state) => Boolean(state) && ['lobby', 'play', 'guess'].includes(state.status);

export { isSpy, newLobby };

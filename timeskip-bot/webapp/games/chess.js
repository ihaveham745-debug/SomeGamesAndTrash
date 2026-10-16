// Шахматы: против бота, вдвоём на одном телефоне или с другом онлайн (каждый со своего).
// Правила — lib/chess.js, бот — lib/chessai.js (думает в chess-worker.js),
// онлайн-партии хранит сервер бота (tgcloud/endpoints/chess*.js).

import {
  colorOf, findMove, fromFen, inCheck, legalMoves, outcome, play, san, squareName, toUci,
} from '../lib/chess.js';
import { bestMove } from '../lib/chessai.js';
import { lang, t } from '../i18n.js';
import { haptic, jojo, sleep, tg, toast } from '../ui.js';

export const title = () => t('Шахматы', 'Chess');

const BOT_USERNAME = 'fish_and_chips_bloody_hell_Bot';
const STORE = 'timeskip.chess';
const GLYPH = { K: '♚', Q: '♛', R: '♜', B: '♝', N: '♞', P: '♟' };
const LEVEL_NAMES = () => t({ easy: 'Лёгкий', medium: 'Средний', hard: 'Сильный' }, { easy: 'Easy', medium: 'Medium', hard: 'Hard' });
const REASONS_RU = {
  mate: 'мат', stalemate: 'пат', fifty: 'правило 50 ходов', repetition: 'троекратное повторение',
  material: 'мало фигур для мата', resign: 'сдача', cancelled: 'приглашение отменено',
};
const REASONS_EN = {
  mate: 'checkmate', stalemate: 'stalemate', fifty: '50-move rule', repetition: 'threefold repetition',
  material: 'insufficient material', resign: 'resignation', cancelled: 'invite cancelled',
};
const reasonText = (r) => t(REASONS_RU, REASONS_EN)[r] ?? r ?? '';

// Ошибки сервера приходят по-русски — в английском режиме переводим по коду.
const SERVER_ERRORS_EN = {
  NO_USER: 'Open the game from Telegram', NOT_FOUND: 'Game not found', NOT_PLAYER: 'You are not playing in this game',
  NOT_ACTIVE: 'The game is not in progress', STALE: 'The position has changed', NOT_YOUR_TURN: 'It’s your opponent’s turn',
  ILLEGAL: 'Illegal move',
};
function errText(err, fallbackRu, fallbackEn) {
  if (lang === 'en') return SERVER_ERRORS_EN[err?.parameters?.code] ?? (err?.type === 'ENDPOINT_ERROR' ? err.message : null) ?? fallbackEn;
  return err?.message || fallbackRu;
}

// --- Состояние ---
// game: { mode: 'bot' | 'local' | 'online', moves: ['e2e4', …], states: [позиция до каждого хода + текущая],
//         me: 'w' | 'b' (bot/online), level, code, online: ответ сервера, over: итог }

let menuPrefs = loadPrefs();
let game = null;
let view = null;
let ctxRef = null;
let selected = -1;
let flipped = false;
let pollTimer = null;
let botJob = 0;
let worker = null;

function loadPrefs() {
  try {
    return { level: 'medium', color: 'w', autoFlip: true, ...JSON.parse(localStorage.getItem(`${STORE}.prefs`)) };
  } catch {
    return { level: 'medium', color: 'w', autoFlip: true };
  }
}

function savePrefs() {
  try {
    localStorage.setItem(`${STORE}.prefs`, JSON.stringify(menuPrefs));
  } catch {
    // без хранилища
  }
}

/** Партию с ботом и партию вдвоём сохраняем — можно выйти и продолжить. */
function saveLocal() {
  if (!game || game.mode === 'online') return;
  try {
    localStorage.setItem(`${STORE}.${game.mode}`, JSON.stringify({ moves: game.moves, me: game.me, level: game.level }));
  } catch {
    // без хранилища
  }
}

function loadLocal(mode) {
  try {
    const raw = JSON.parse(localStorage.getItem(`${STORE}.${mode}`));
    if (!raw?.moves?.length) return null;
    return startGame(mode, raw);
  } catch {
    return null;
  }
}

function clearLocal(mode) {
  try {
    localStorage.removeItem(`${STORE}.${mode}`);
  } catch {
    // без хранилища
  }
}

function startGame(mode, { moves = [], me = 'w', level = 'medium', code = null, online = null } = {}) {
  const states = [fromFen()];
  for (const uci of moves) {
    const next = play(states.at(-1), uci);
    if (!next) break;
    states.push(next);
  }
  return { mode, moves: moves.slice(0, states.length - 1), states, me, level, code, online };
}

const current = () => game.states.at(-1);

// --- Связь с сервером (онлайн) ---

function callBot(name, input = {}) {
  return new Promise((resolve, reject) => {
    if (!tg?.Serverless?.call) {
      reject(new Error(t('Игра с другом работает только внутри Телеграма', 'Playing with a friend only works inside Telegram')));
      return;
    }
    tg.Serverless.call(name, input, (err, result) => (err ? reject(err) : resolve(result)));
  });
}

// --- Экран ---

export function mount(root, ctx) {
  ctxRef = ctx;
  view = { root };
  if (ctx.params?.chess) {
    openOnline(ctx.params.chess);
  } else if (game) {
    renderGame();
    if (game.mode === 'online') startPolling();
    else maybeBotMove();
  } else {
    renderMenu();
  }
  return () => {
    stopPolling();
    root.onclick = null;
    view = null;
  };
}

function renderMenu() {
  if (!view) return;
  stopPolling();
  game = null;
  window.scrollTo(0, 0);
  const saved = ['bot', 'local'].map((m) => ({ m, g: (() => { try { return JSON.parse(localStorage.getItem(`${STORE}.${m}`)); } catch { return null; } })() })).filter((x) => x.g?.moves?.length);
  const seg = (name, options, value) => `
    <div class="seg" role="radiogroup" data-pref="${name}">
      ${options.map(([v, label]) => `<button type="button" role="radio" aria-checked="${v === value}" data-v="${v}" class="press">${label}</button>`).join('')}
    </div>`;
  view.root.innerHTML = `
    <section class="hero chess-hero">
      <h2>${t('Шахматы', 'Chess')}</h2>
      <p>${t('С ботом, вдвоём на одном телефоне или с другом онлайн.', 'Against the bot, two players on one phone, or online with a friend.')}</p>
    </section>
    ${saved.map(({ m, g }) => `
      <button type="button" class="chess-resume press" data-resume="${m}">
        <span class="chess-resume-icon">♞</span>
        <span><b>${t('Продолжить', 'Resume')}: ${m === 'bot' ? `${t('против бота', 'vs bot')} (${LEVEL_NAMES()[g.level] ?? ''})` : t('вдвоём', 'two players')}</b><small>${t(`${Math.ceil(g.moves.length / 2)}-й ход`, `move ${Math.ceil(g.moves.length / 2)}`)}</small></span>
      </button>`).join('')}
    <section class="chess-card">
      <h3><span>🤖</span> ${t('Против бота', 'Vs bot')}</h3>
      <label>${t('Сложность', 'Difficulty')}</label>
      ${seg('level', Object.entries(LEVEL_NAMES()), menuPrefs.level)}
      <label>${t('Играю за', 'Play as')}</label>
      ${seg('color', [['w', t('Белых', 'White')], ['random', t('Случайно', 'Random')], ['b', t('Чёрных', 'Black')]], menuPrefs.color)}
      <button type="button" class="btn-primary press" data-start="bot">${t('Играть', 'Play')}</button>
    </section>
    <section class="chess-card">
      <h3><span>👥</span> ${t('Вдвоём на одном телефоне', 'Two players, one phone')}</h3>
      <p>${t('Ходите по очереди и передаёте телефон. Доска поворачивается к тому, чей ход.', 'Take turns and pass the phone. The board turns to whoever moves next.')}</p>
      <button type="button" class="btn-glass press" data-start="local">${t('Начать', 'Start')}</button>
    </section>
    <section class="chess-card">
      <h3><span>🌐</span> ${t('С другом онлайн', 'Online with a friend')}</h3>
      <p>${t('Отправь другу приглашение — каждый играет со своего телефона. Когда друг сходит, бот напишет тебе.', 'Send a friend an invite — each of you plays on your own phone. The bot messages you when it’s your move.')}</p>
      <button type="button" class="btn-glass press" data-start="online">${t('Пригласить друга', 'Invite a friend')}</button>
      <div class="chess-list" id="chess-list"></div>
    </section>`;

  view.root.onclick = async (e) => {
    const segBtn = e.target.closest('.seg [data-v]');
    if (segBtn) {
      const pref = segBtn.parentElement.dataset.pref;
      menuPrefs[pref] = segBtn.dataset.v;
      savePrefs();
      for (const b of segBtn.parentElement.children) b.setAttribute('aria-checked', String(b === segBtn));
      haptic('select');
      return;
    }
    const resume = e.target.closest('[data-resume]')?.dataset.resume;
    if (resume) {
      game = loadLocal(resume);
      if (game) enterGame();
      return;
    }
    const start = e.target.closest('[data-start]')?.dataset.start;
    if (start === 'bot') {
      const me = menuPrefs.color === 'random' ? (Math.random() < 0.5 ? 'w' : 'b') : menuPrefs.color;
      game = startGame('bot', { me, level: menuPrefs.level });
      saveLocal();
      enterGame();
    } else if (start === 'local') {
      game = startGame('local');
      saveLocal();
      enterGame();
    } else if (start === 'online') {
      await createOnline();
    }
    const open = e.target.closest('[data-open]')?.dataset.open;
    if (open) openOnline(open);
  };
  loadOnlineList();
}

async function loadOnlineList() {
  if (!tg?.Serverless?.call) return;
  try {
    const { games } = await callBot('chessList');
    const list = view?.root.querySelector('#chess-list');
    if (!list || !games.length) return;
    list.innerHTML = `<h4>${t('Мои партии', 'My games')}</h4>${games.slice(0, 8).map((g) => {
      const opp = g.you === 'w' ? g.black?.name : g.white?.name;
      let status;
      if (g.status === 'waiting') status = t('ждём соперника', 'waiting for opponent');
      else if (g.status === 'over') status = g.result ? resultText(g.result, g.reason, g.you) : t('отменена', 'cancelled');
      else status = (g.moves.length % 2 === 0 ? 'w' : 'b') === g.you ? `<b class="your-turn">${t('твой ход', 'your move')}</b>` : t('ход соперника', 'opponent’s move');
      return `<button type="button" class="chess-row press" data-open="${g.code}"><span>${g.you === 'w' ? '♔' : '♚'} ${escapeHtml(opp ?? t('без соперника', 'no opponent'))}</span><small>${status}</small></button>`;
    }).join('')}`;
  } catch {
    // список — не главное
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
}

// --- Онлайн ---

async function createOnline() {
  try {
    const online = await callBot('chessCreate', { color: menuPrefs.color });
    game = startGame('online', { me: online.you, code: online.code, online });
    enterGame();
    invite();
  } catch (err) {
    toast(errText(err, 'Не получилось создать партию', 'Couldn’t create the game'));
  }
}

async function openOnline(code) {
  if (view) view.root.innerHTML = `<p class="chess-loading">${t('Открываем партию…', 'Opening the game…')}</p>`;
  try {
    const online = await callBot('chessJoin', { code });
    game = startGame('online', { moves: online.moves, me: online.you ?? 'w', code, online });
    enterGame();
    if (online.status === 'active' && online.you && online.moves.length === 0) toast(t('Партия началась!', 'The game has started!'));
  } catch (err) {
    toast(errText(err, 'Партия не найдена', 'Game not found'));
    renderMenu();
  }
}

function inviteLink() {
  return `https://t.me/${BOT_USERNAME}?start=chess_${game.code}`;
}

function invite() {
  const url = `https://t.me/share/url?url=${encodeURIComponent(inviteLink())}&text=${encodeURIComponent(t('Сыграем в шахматы? ♟ Жми на ссылку', 'Fancy a game of chess? ♟ Tap the link'))}`;
  if (tg?.openTelegramLink) tg.openTelegramLink(url);
  else window.open(url, '_blank');
}

function startPolling() {
  stopPolling();
  const tick = async () => {
    if (!game || game.mode !== 'online' || !view) return;
    try {
      applyOnline(await callBot('chessGet', { code: game.code }));
    } catch {
      // сеть моргнула — попробуем в следующий раз
    }
    if (game?.mode === 'online' && game.online.status !== 'over' && view) {
      const myTurn = game.online.status === 'active' && current().turn === game.me;
      pollTimer = setTimeout(tick, myTurn ? 5000 : 2000);
    }
  };
  pollTimer = setTimeout(tick, 1500);
}

function stopPolling() {
  clearTimeout(pollTimer);
  pollTimer = null;
}

/** Пришло состояние с сервера: доиграть недостающие ходы (с анимацией последнего). */
function applyOnline(online) {
  if (!game || game.mode !== 'online' || online.code !== game.code) return;
  const wasStatus = game.online.status;
  game.online = online;
  if (online.you) game.me = online.you;
  if (online.moves.length < game.moves.length || online.moves.some((m, i) => i < game.moves.length && m !== game.moves[i])) {
    game = startGame('online', { moves: online.moves, me: game.me, code: game.code, online });
    renderGame();
    return;
  }
  const fresh = online.moves.slice(game.moves.length);
  for (const uci of fresh) applyMove(uci, { animate: true, fromServer: true });
  if (!fresh.length && wasStatus !== online.status) {
    if (online.status === 'active' && wasStatus === 'waiting') {
      haptic('success');
      toast(t('Соперник пришёл — играем!', 'Your opponent is here — let’s play!'));
    }
    renderGame();
  } else if (fresh.length) {
    haptic('light');
  }
}

// --- Партия ---

function enterGame() {
  selected = -1;
  window.scrollTo(0, 0);
  flipped = game.mode === 'local' ? (menuPrefs.autoFlip && current().turn === 'b') : game.me === 'b';
  renderGame();
  if (game.mode === 'online') startPolling();
  else maybeBotMove();
}

function gameOutcome() {
  if (game.mode === 'online' && game.online?.status === 'over') {
    return { over: true, result: game.online.result, reason: game.online.reason, winner: game.online.result === '1-0' ? 'w' : game.online.result === '0-1' ? 'b' : null };
  }
  if (game.resigned) return game.resigned;
  return outcome(current());
}

function resultText(result, reason, me) {
  if (!result) return t('отменена', 'cancelled');
  if (result === '1/2-1/2') return `${t('ничья', 'draw')} — ${reasonText(reason)}`;
  const winner = result === '1-0' ? 'w' : 'b';
  if (me) return `${winner === me ? t('победа', 'win') : t('поражение', 'loss')} — ${reasonText(reason)}`;
  return `${winner === 'w' ? t('белые победили', 'white won') : t('чёрные победили', 'black won')} — ${reasonText(reason)}`;
}

function playerLabel(color) {
  if (game.mode === 'bot') return color === game.me ? t('Ты', 'You') : `${t('Бот', 'Bot')} · ${LEVEL_NAMES()[game.level]}`;
  if (game.mode === 'local') return color === 'w' ? t('Белые', 'White') : t('Чёрные', 'Black');
  const p = color === 'w' ? game.online.white : game.online.black;
  if (!p) return t('Ждём соперника…', 'Waiting for opponent…');
  return color === game.online.you ? t('Ты', 'You') : p.name;
}

/** Взятые фигуры и перевес по материалу. */
function captured(board) {
  const start = { P: 8, N: 2, B: 2, R: 2, Q: 1 };
  const count = { w: { P: 0, N: 0, B: 0, R: 0, Q: 0 }, b: { P: 0, N: 0, B: 0, R: 0, Q: 0 } };
  for (const p of board) if (p && p.toUpperCase() !== 'K') count[colorOf(p)][p.toUpperCase()]++;
  const value = { P: 1, N: 3, B: 3, R: 5, Q: 9 };
  const lost = (c) => Object.entries(start).flatMap(([t, n]) => Array(Math.max(0, n - count[c][t])).fill(t));
  const material = (c) => Object.entries(count[c]).reduce((s, [t, n]) => s + value[t] * n, 0);
  return { w: lost('b'), b: lost('w'), diff: material('w') - material('b') };
}

function renderGame() {
  if (!view || !game) return;
  view.root.onclick = null;
  const top = flipped ? 'w' : 'b';
  const bottom = flipped ? 'b' : 'w';
  view.root.innerHTML = `
    ${game.mode === 'online' && game.online.status === 'waiting' ? `
      <section class="chess-invite">
        <b>${t('Ждём соперника', 'Waiting for an opponent')}</b>
        <p>${t('Отправь другу приглашение — партия начнётся, как только он откроет ссылку.', 'Send a friend the invite — the game starts as soon as they open the link.')}</p>
        <div class="chess-invite-actions">
          <button type="button" class="btn-primary press" data-act="invite">${t('Пригласить', 'Invite')}</button>
          <button type="button" class="btn-glass press" data-act="copy">${t('Ссылка', 'Link')}</button>
        </div>
      </section>` : ''}
    <div class="chess-player" id="p-top"></div>
    <section class="chess-board-wrap">
      <div class="chess-board${flipped ? ' flipped' : ''}" id="board" role="grid" aria-label="${t('Шахматная доска', 'Chessboard')}">
        <div class="chess-squares" id="squares">${Array.from({ length: 64 }, (_, i) => `<div class="sq ${((i >> 3) + (i & 7)) % 2 ? 'dark' : 'light'}" data-sq="${i}"></div>`).join('')}</div>
        <div class="chess-pieces" id="pieces"></div>
      </div>
      <div class="chess-promo" id="promo" hidden></div>
      <div class="chess-over" id="over" hidden></div>
    </section>
    <div class="chess-player" id="p-bottom"></div>
    <p class="chess-status" id="status" aria-live="polite"></p>
    <div class="chess-moves" id="moves" aria-label="${t('Ходы партии', 'Moves')}"></div>
    <div class="chess-actions" id="actions"></div>`;

  view.board = view.root.querySelector('#board');
  view.squares = [...view.root.querySelectorAll('.sq')];
  view.pieces = view.root.querySelector('#pieces');
  view.top = view.root.querySelector('#p-top');
  view.bottom = view.root.querySelector('#p-bottom');
  view.status = view.root.querySelector('#status');
  view.moves = view.root.querySelector('#moves');
  view.actions = view.root.querySelector('#actions');
  view.promo = view.root.querySelector('#promo');
  view.over = view.root.querySelector('#over');
  view.topColor = top;
  view.bottomColor = bottom;
  view.pieceEls = new Map();

  // координаты по краю доски
  view.squares.forEach((sq, i) => {
    const r = i >> 3;
    const c = i & 7;
    const name = squareName(i);
    if (c === (flipped ? 7 : 0)) sq.insertAdjacentHTML('beforeend', `<span class="coord rank">${name[1]}</span>`);
    if (r === (flipped ? 0 : 7)) sq.insertAdjacentHTML('beforeend', `<span class="coord file">${name[0]}</span>`);
  });

  view.board.addEventListener('click', onBoardClick);
  view.root.querySelector('.chess-invite')?.addEventListener('click', onInviteClick);
  view.actions.addEventListener('click', onAction);
  drawPieces();
  refresh();
}

function onInviteClick(e) {
  const act = e.target.closest('[data-act]')?.dataset.act;
  if (act === 'invite') invite();
  if (act === 'copy') {
    const link = inviteLink();
    navigator.clipboard?.writeText(link).then(() => toast(t('Ссылка скопирована', 'Link copied')), () => toast(link));
  }
}

function place(el, i) {
  let r = i >> 3;
  let c = i & 7;
  if (flipped) {
    r = 7 - r;
    c = 7 - c;
  }
  el.style.transform = `translate(${c * 100}%, ${r * 100}%)`;
}

function pieceEl(p, i) {
  const el = document.createElement('div');
  el.className = `pc ${colorOf(p) === 'w' ? 'white' : 'black'}`;
  el.textContent = `${GLYPH[p.toUpperCase()]}︎`;
  el.dataset.p = p;
  place(el, i);
  return el;
}

function drawPieces() {
  view.pieces.replaceChildren();
  view.pieceEls.clear();
  current().board.forEach((p, i) => {
    if (!p) return;
    const el = pieceEl(p, i);
    view.pieces.append(el);
    view.pieceEls.set(i, el);
  });
}

/** Подсветка, игроки, статус, ходы, кнопки — всё, кроме фигур. */
function refresh() {
  if (!view?.squares) return;
  const state = current();
  const last = game.moves.length ? findLast() : null;
  const end = gameOutcome();
  const checkSq = inCheck(state) ? state.board.indexOf(state.turn === 'w' ? 'K' : 'k') : -1;
  const targets = selected >= 0 ? legalMoves(state, selected) : [];
  view.squares.forEach((sq, i) => {
    sq.classList.toggle('last', !!last && (i === last.from || i === last.to));
    sq.classList.toggle('sel', i === selected);
    sq.classList.toggle('check', i === checkSq);
    const t = targets.find((m) => m.to === i);
    sq.classList.toggle('can-go', !!t && !t.captured);
    sq.classList.toggle('can-take', !!t && !!t.captured);
  });

  const cap = captured(state.board);
  const playerHtml = (color) => {
    const turn = !end.over && state.turn === color && !(game.mode === 'online' && game.online.status === 'waiting');
    const adv = color === 'w' ? cap.diff : -cap.diff;
    const taken = cap[color].map((p) => `${GLYPH[p]}︎`).join('');
    return `<span class="chess-avatar ${color === 'w' ? 'white' : 'black'}">${GLYPH.K}︎</span>
      <span class="chess-name">${escapeHtml(playerLabel(color))}</span>
      <span class="chess-taken ${color === 'w' ? 'of-black' : 'of-white'}">${taken}${adv > 0 ? `<b>+${adv}</b>` : ''}</span>
      ${turn ? `<span class="chess-turn" aria-label="${t('ходит', 'to move')}"></span>` : ''}`;
  };
  view.top.innerHTML = playerHtml(view.topColor);
  view.bottom.innerHTML = playerHtml(view.bottomColor);

  view.status.className = 'chess-status';
  if (end.over) {
    view.status.textContent = `${t('Партия окончена', 'Game over')}: ${resultText(end.result, end.reason, game.mode === 'local' ? null : game.me)}`;
  } else if (game.mode === 'online' && game.online.status === 'waiting') {
    view.status.textContent = t('Ждём, пока соперник откроет приглашение…', 'Waiting for your friend to open the invite…');
  } else {
    const check = inCheck(state) ? t('Шах! ', 'Check! ') : '';
    let who;
    if (game.mode === 'local') who = state.turn === 'w' ? t('Ход белых', 'White to move') : t('Ход чёрных', 'Black to move');
    else if (game.mode === 'online' && !game.online.you) who = state.turn === 'w' ? t('Ход белых', 'White to move') : t('Ход чёрных', 'Black to move');
    else if (state.turn === game.me) who = t('Твой ход', 'Your move');
    else who = game.mode === 'bot' ? t('Бот думает…', 'Bot is thinking…') : t('Ход соперника', 'Opponent’s move');
    view.status.textContent = check + who;
    if (check) view.status.classList.add('in-check');
  }

  // ходы парами: 1. e4 e5
  const sans = game.moves.map((uci, i) => san(game.states[i], findMove(game.states[i], uci), lang === 'ru'));
  let html = '';
  for (let i = 0; i < sans.length; i += 2) {
    html += `<span class="mv"><i>${i / 2 + 1}.</i>${sans[i]}${sans[i + 1] ? ` ${sans[i + 1]}` : ''}</span>`;
  }
  view.moves.innerHTML = html || `<span class="mv empty">${t('Ходов пока нет', 'No moves yet')}</span>`;
  view.moves.scrollLeft = view.moves.scrollWidth;

  const btn = (act, label, extra = '') => `<button type="button" class="btn-glass press" data-act="${act}" ${extra}>${label}</button>`;
  const buttons = [];
  if (game.mode !== 'online') buttons.push(btn('undo', t('↶ Ход', '↶ Undo'), `aria-label="${t('Отменить ход', 'Undo move')}" ${game.moves.length ? '' : 'disabled'}`));
  buttons.push(btn('flip', t('⇅ Доска', '⇅ Flip'), `aria-label="${t('Перевернуть доску', 'Flip board')}"`));
  if (end.over) buttons.push(btn('new', t('Заново', 'New')));
  else if (game.mode === 'online') buttons.push(btn('resign', game.online.status === 'waiting' ? t('Отменить', 'Cancel') : t('Сдаться', 'Resign')));
  else buttons.push(btn('resign', t('Сдаться', 'Resign'), game.moves.length ? '' : 'disabled'));
  buttons.push(btn('menu', t('Меню', 'Menu')));
  view.actions.innerHTML = buttons.join('');

  renderOver(end);
}

function findLast() {
  const i = game.moves.length - 1;
  return findMove(game.states[i], game.moves[i]);
}

function renderOver(end) {
  if (!view.over) return;
  if (!end.over || view.overShown === game.moves.length) {
    if (!end.over) view.over.hidden = true;
    return;
  }
  view.overShown = game.moves.length;
  let headline;
  if (end.result === '1/2-1/2') headline = t('Ничья', 'Draw');
  else if (!end.result) headline = t('Партия отменена', 'Game cancelled');
  else if (game.mode === 'local') headline = end.result === '1-0' ? t('Белые победили', 'White wins') : t('Чёрные победили', 'Black wins');
  else headline = (end.result === '1-0' ? 'w' : 'b') === game.me ? t('Победа! 🏆', 'Victory! 🏆') : t('Поражение', 'Defeat');
  view.over.innerHTML = `
    <div class="chess-over-card">
      <b>${headline}</b>
      <span>${reasonText(end.reason)}</span>
      <div class="chess-over-actions">
        <button type="button" class="btn-primary press" data-over="new">${t('Новая партия', 'New game')}</button>
        <button type="button" class="btn-glass press" data-over="look">${t('Посмотреть доску', 'View board')}</button>
      </div>
    </div>`;
  view.over.hidden = false;
  view.over.onclick = (e) => {
    const act = e.target.closest('[data-over]')?.dataset.over;
    if (act === 'look') view.over.hidden = true;
    if (act === 'new') newGame();
  };
  const won = end.result && end.result !== '1/2-1/2' && (game.mode === 'local' || (end.result === '1-0' ? 'w' : 'b') === game.me);
  haptic(won ? 'success' : end.result === '1/2-1/2' ? 'warning' : 'error');
  if (won) jojo('big');
  else if (end.result === '1/2-1/2') jojo('draw');
  else if (end.result) jojo('tbc');
}

// --- Ходы игрока ---

function canMoveNow() {
  if (!game || gameOutcome().over) return false;
  const turn = current().turn;
  if (game.mode === 'local') return true;
  if (game.mode === 'online') return game.online.status === 'active' && !!game.online.you && turn === game.online.you;
  return turn === game.me && !game.thinking;
}

function squareFromEvent(e) {
  const box = view.board.getBoundingClientRect();
  let c = Math.floor(((e.clientX - box.left) / box.width) * 8);
  let r = Math.floor(((e.clientY - box.top) / box.height) * 8);
  if (c < 0 || c > 7 || r < 0 || r > 7) return -1;
  if (flipped) {
    r = 7 - r;
    c = 7 - c;
  }
  return r * 8 + c;
}

function onBoardClick(e) {
  if (!canMoveNow()) return;
  const sq = squareFromEvent(e);
  if (sq < 0) return;
  const state = current();
  const piece = state.board[sq];
  if (selected >= 0) {
    const options = legalMoves(state, selected).filter((m) => m.to === sq);
    if (options.length) {
      const from = selected;
      selected = -1;
      if (options[0].promo) choosePromotion(from, sq, state.turn);
      else userMove(toUci(options[0]));
      return;
    }
  }
  if (piece && colorOf(piece) === state.turn && legalMoves(state, sq).length) {
    selected = sq === selected ? -1 : sq;
    haptic('select');
  } else {
    selected = -1;
  }
  refresh();
}

function choosePromotion(from, to, color) {
  const pieces = color === 'w' ? ['Q', 'R', 'B', 'N'] : ['q', 'r', 'b', 'n'];
  view.promo.innerHTML = `<div class="chess-promo-card"><b>${t('Превратить пешку в', 'Promote pawn to')}</b><div>${pieces.map((p) => `<button type="button" class="pc-btn press ${color === 'w' ? 'white' : 'black'}" data-p="${p}">${GLYPH[p.toUpperCase()]}︎</button>`).join('')}</div></div>`;
  view.promo.hidden = false;
  view.promo.onclick = (e) => {
    const p = e.target.closest('[data-p]')?.dataset.p;
    view.promo.hidden = true;
    if (p) userMove(`${squareName(from)}${squareName(to)}${p.toLowerCase()}`);
    else refresh();
  };
}

async function userMove(uci) {
  const ply = game.moves.length;
  applyMove(uci, { animate: true });
  if (game.mode === 'online') {
    try {
      applyOnline(await callBot('chessMove', { code: game.code, uci, ply }));
    } catch (err) {
      toast(errText(err, 'Ход не прошёл', 'Move failed'));
      try {
        const online = await callBot('chessGet', { code: game.code });
        game = startGame('online', { moves: online.moves, me: game.me, code: game.code, online });
        renderGame();
      } catch {
        // покажем как есть
      }
    }
    return;
  }
  if (game.mode === 'local' && menuPrefs.autoFlip && !gameOutcome().over) {
    await sleep(450);
    if (view && game?.mode === 'local') {
      flipped = current().turn === 'b';
      renderGame();
    }
  }
  maybeBotMove();
}

/** Сделать ход на доске: передвинуть фигуру (плавно), убрать взятую, рокировка, превращение. */
function applyMove(uci, { animate = true } = {}) {
  const state = current();
  const move = findMove(state, uci);
  if (!move) return;
  const next = play(state, uci);
  game.moves.push(uci);
  game.states.push(next);
  saveLocal();
  selected = -1;

  if (view?.pieceEls) {
    const els = view.pieceEls;
    const capSq = move.flag === 'ep' ? move.to + (state.turn === 'w' ? 8 : -8) : move.to;
    const victim = move.captured ? els.get(capSq) : null;
    if (victim) {
      victim.classList.add('taken');
      setTimeout(() => victim.remove(), 250);
      els.delete(capSq);
    }
    const el = els.get(move.from);
    if (el) {
      if (!animate) el.style.transition = 'none';
      place(el, move.to);
      els.delete(move.from);
      els.set(move.to, el);
      el.classList.add('moving');
      setTimeout(() => el.classList.remove('moving'), 260);
      if (move.promo) {
        setTimeout(() => {
          el.textContent = `${GLYPH[move.promo.toUpperCase()]}︎`;
          el.dataset.p = move.promo;
        }, 200);
      }
    }
    if (move.flag === 'castle') {
      const kingside = move.to > move.from;
      const rookFrom = kingside ? move.from + 3 : move.from - 4;
      const rookTo = kingside ? move.from + 1 : move.from - 1;
      const rook = els.get(rookFrom);
      if (rook) {
        place(rook, rookTo);
        els.delete(rookFrom);
        els.set(rookTo, rook);
      }
    }
  }
  haptic(move.captured ? 'medium' : 'light');
  refresh();
}

// --- Бот ---

function getWorker() {
  if (worker === false) return null;
  try {
    worker ??= new Worker(new URL('./chess-worker.js', import.meta.url), { type: 'module' });
    return worker;
  } catch {
    worker = false;
    return null;
  }
}

function askBot(moves, level) {
  const id = ++botJob;
  const w = getWorker();
  return new Promise((resolve) => {
    if (!w) {
      // без воркера думаем в основном потоке (интерфейс ненадолго замрёт)
      setTimeout(() => {
        const m = bestMove(game.states.at(-1), level);
        resolve({ id, uci: m && toUci(m) });
      }, 30);
      return;
    }
    const onMessage = ({ data }) => {
      if (data.id !== id) return;
      w.removeEventListener('message', onMessage);
      resolve(data);
    };
    w.addEventListener('message', onMessage);
    w.addEventListener('error', () => {
      worker = false;
      resolve(askBot(moves, level));
    }, { once: true });
    w.postMessage({ id, moves, level });
  });
}

async function maybeBotMove() {
  if (!game || game.mode !== 'bot' || game.thinking || gameOutcome().over || current().turn === game.me) return;
  game.thinking = true;
  refresh();
  const g = game;
  const started = Date.now();
  const { id, uci } = await askBot([...g.moves], g.level);
  // «Думает» хотя бы полсекунды — мгновенный ответ выглядит странно.
  await sleep(Math.max(0, 500 - (Date.now() - started)));
  g.thinking = false;
  if (game !== g || id !== botJob || !uci) return;
  applyMove(uci, { animate: true });
}

// --- Кнопки ---

async function onAction(e) {
  const act = e.target.closest('[data-act]')?.dataset.act;
  if (!act) return;
  if (act === 'flip') {
    flipped = !flipped;
    if (game.mode === 'local') {
      menuPrefs.autoFlip = false;
      savePrefs();
    }
    renderGame();
  } else if (act === 'undo') {
    undo();
  } else if (act === 'resign') {
    await resign();
  } else if (act === 'new') {
    newGame();
  } else if (act === 'menu') {
    renderMenu();
  }
}

function undo() {
  if (!game.moves.length || game.mode === 'online') return;
  botJob++; // ответ бота на отменённую позицию не нужен
  game.thinking = false;
  game.resigned = null;
  // против бота отматываем и его ход, чтобы снова ходил игрок
  let n = 1;
  if (game.mode === 'bot') n = current().turn === game.me ? 2 : 1;
  n = Math.min(n, game.moves.length);
  game.moves.splice(-n);
  game.states.splice(-n);
  saveLocal();
  if (!game.moves.length) clearLocal(game.mode);
  selected = -1;
  if (game.mode === 'local' && menuPrefs.autoFlip) flipped = current().turn === 'b';
  renderGame();
  maybeBotMove();
}

function ask(text) {
  if (tg?.isVersionAtLeast?.('6.2')) return new Promise((resolve) => tg.showConfirm(text, resolve));
  return Promise.resolve(window.confirm(text));
}

async function resign() {
  if (game.mode === 'online') {
    const waiting = game.online.status === 'waiting';
    if (!(await ask(waiting ? t('Отменить приглашение?', 'Cancel the invite?') : t('Сдаться в этой партии?', 'Resign this game?')))) return;
    try {
      applyOnline(await callBot('chessResign', { code: game.code }));
      if (waiting) renderMenu();
      else refresh();
    } catch (err) {
      toast(errText(err, 'Не получилось', 'Something went wrong'));
    }
    return;
  }
  if (!(await ask(t('Сдаться?', 'Resign?')))) return;
  const loser = game.mode === 'bot' ? game.me : current().turn;
  game.resigned = { over: true, result: loser === 'w' ? '0-1' : '1-0', reason: 'resign', winner: loser === 'w' ? 'b' : 'w' };
  botJob++;
  game.thinking = false;
  clearLocal(game.mode);
  refresh();
}

function newGame() {
  if (game.mode !== 'online') clearLocal(game.mode);
  if (game.mode === 'bot') {
    const me = menuPrefs.color === 'random' ? (Math.random() < 0.5 ? 'w' : 'b') : game.me;
    game = startGame('bot', { me, level: game.level });
    enterGame();
  } else if (game.mode === 'local') {
    game = startGame('local');
    enterGame();
  } else {
    renderMenu();
  }
}

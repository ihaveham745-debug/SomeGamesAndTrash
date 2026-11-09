// Шашки (русские): против бота, вдвоём на одном телефоне или с другом онлайн.
// Правила — lib/checkers.js, бот — lib/checkersai.js (думает в checkers-worker.js),
// онлайн-партии — те же эндпоинты, что у шахмат (tgcloud/endpoints/chess*.js, kind: 'checkers').

import {
  colorOf, count, isKing, legalMoves, moveId, newGame, notation, outcome, play, squareName,
} from '../lib/checkers.js';
import { bestMove } from '../lib/checkersai.js';
import { lang, t } from '../i18n.js';
import { haptic, jojo, sleep, tg, toast } from '../ui.js';

export const title = () => t('Шашки', 'Checkers');

const KIND = 'checkers';
const BOT_USERNAME = 'fish_and_chips_bloody_hell_Bot';
const STORE = 'timeskip.checkers';
const LEVEL_NAMES = () => t({ easy: 'Лёгкий', medium: 'Средний', hard: 'Сильный' }, { easy: 'Easy', medium: 'Medium', hard: 'Hard' });
const reasonText = (r) => t(
  { nomoves: 'ходов не осталось', repetition: 'троекратное повторение', kings: '15 ходов дамками без взятий', resign: 'сдача', cancelled: 'приглашение отменено' },
  { nomoves: 'no moves left', repetition: 'threefold repetition', kings: '15 king moves without captures', resign: 'resignation', cancelled: 'invite cancelled' },
)[r] ?? r ?? '';

const SERVER_ERRORS_EN = {
  NO_USER: 'Open the game from Telegram', NOT_FOUND: 'Game not found', NOT_PLAYER: 'You are not playing in this game',
  NOT_ACTIVE: 'The game is not in progress', STALE: 'The position has changed', NOT_YOUR_TURN: 'It’s your opponent’s turn',
  ILLEGAL: 'Illegal move',
};
function errText(err, fallbackRu, fallbackEn) {
  if (lang === 'en') return SERVER_ERRORS_EN[err?.parameters?.code] ?? fallbackEn;
  return err?.message || fallbackRu;
}

// --- Состояние ---
// game: { mode: 'bot' | 'local' | 'online', moves: ['c3d4', …], states: [позиции], me, level, code, online }

let prefs = loadPrefs();
let game = null;
let view = null;
let picked = null; // { from, steps: [клетки, уже выбранные в серии взятий] }
let flipped = false;
let pollTimer = null;
let botJob = 0;
let worker = null;

function loadPrefs() {
  const base = { level: 'medium', color: 'w', autoFlip: true };
  try {
    return { ...base, ...JSON.parse(localStorage.getItem(`${STORE}.prefs`)) };
  } catch {
    return base;
  }
}

function store(key, value) {
  try {
    if (value === null) localStorage.removeItem(`${STORE}.${key}`);
    else localStorage.setItem(`${STORE}.${key}`, JSON.stringify(value));
  } catch {
    // без хранилища
  }
}

function read(key) {
  try {
    return JSON.parse(localStorage.getItem(`${STORE}.${key}`));
  } catch {
    return null;
  }
}

const saveLocal = () => game && game.mode !== 'online' && store(game.mode, { moves: game.moves, me: game.me, level: game.level });

function startGame(mode, { moves = [], me = 'w', level = 'medium', code = null, online = null } = {}) {
  const states = [newGame()];
  for (const id of moves) {
    const next = play(states.at(-1), id);
    if (!next) break;
    states.push(next);
  }
  return { mode, moves: moves.slice(0, states.length - 1), states, me, level, code, online };
}

const current = () => game.states.at(-1);

function callBot(name, input = {}) {
  return new Promise((resolve, reject) => {
    if (!tg?.Serverless?.call) {
      reject(new Error(t('Игра с другом работает только внутри Телеграма', 'Playing with a friend only works inside Telegram')));
      return;
    }
    tg.Serverless.call(name, input, (err, result) => (err ? reject(err) : resolve(result)));
  });
}

const escapeHtml = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

// --- Экран ---

export function mount(root, ctx) {
  view = { root };
  if (ctx.params?.checkers) openOnline(ctx.params.checkers);
  else if (game) {
    renderGame();
    if (game.mode === 'online') startPolling();
    else maybeBotMove();
  } else renderMenu();
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
  const saved = ['bot', 'local'].map((m) => ({ m, g: read(m) })).filter((x) => x.g?.moves?.length);
  const seg = (name, options, value) => `
    <div class="seg" role="radiogroup" data-pref="${name}">
      ${options.map(([v, label]) => `<button type="button" role="radio" aria-checked="${v === value}" data-v="${v}" class="press">${label}</button>`).join('')}
    </div>`;
  view.root.innerHTML = `
    <section class="hero chess-hero">
      <h2>${t('Шашки', 'Checkers')}</h2>
      <p>${t('Русские шашки: бить обязательно, дамка ходит далеко.', 'Russian draughts: captures are compulsory, kings fly.')}</p>
    </section>
    ${saved.map(({ m, g }) => `
      <button type="button" class="chess-resume press" data-resume="${m}">
        <span class="chess-resume-icon">⛀</span>
        <span><b>${t('Продолжить', 'Resume')}: ${m === 'bot' ? `${t('против бота', 'vs bot')} (${LEVEL_NAMES()[g.level] ?? ''})` : t('вдвоём', 'two players')}</b><small>${t(`${Math.ceil(g.moves.length / 2)}-й ход`, `move ${Math.ceil(g.moves.length / 2)}`)}</small></span>
      </button>`).join('')}
    <section class="chess-card">
      <h3><span>🤖</span> ${t('Против бота', 'Vs bot')}</h3>
      <label>${t('Сложность', 'Difficulty')}</label>
      ${seg('level', Object.entries(LEVEL_NAMES()), prefs.level)}
      <label>${t('Играю за', 'Play as')}</label>
      ${seg('color', [['w', t('Белых', 'White')], ['random', t('Случайно', 'Random')], ['b', t('Чёрных', 'Black')]], prefs.color)}
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
      <div class="chess-list" id="list"></div>
    </section>`;

  view.root.onclick = async (e) => {
    const segBtn = e.target.closest('.seg [data-v]');
    if (segBtn) {
      prefs[segBtn.parentElement.dataset.pref] = segBtn.dataset.v;
      store('prefs', prefs);
      for (const b of segBtn.parentElement.children) b.setAttribute('aria-checked', String(b === segBtn));
      haptic('select');
      return;
    }
    const resume = e.target.closest('[data-resume]')?.dataset.resume;
    if (resume) {
      game = startGame(resume, read(resume));
      enterGame();
      return;
    }
    const start = e.target.closest('[data-start]')?.dataset.start;
    if (start === 'bot') {
      const me = prefs.color === 'random' ? (Math.random() < 0.5 ? 'w' : 'b') : prefs.color;
      game = startGame('bot', { me, level: prefs.level });
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
    const { games } = await callBot('chessList', { kind: KIND });
    const list = view?.root.querySelector('#list');
    if (!list || !games.length) return;
    list.innerHTML = `<h4>${t('Мои партии', 'My games')}</h4>${games.slice(0, 8).map((g) => {
      const opp = g.you === 'w' ? g.black?.name : g.white?.name;
      let status;
      if (g.status === 'waiting') status = t('ждём соперника', 'waiting for opponent');
      else if (g.status === 'over') status = g.result ? resultText(g.result, g.reason, g.you) : t('отменена', 'cancelled');
      else status = (g.moves.length % 2 === 0 ? 'w' : 'b') === g.you ? `<b class="your-turn">${t('твой ход', 'your move')}</b>` : t('ход соперника', 'opponent’s move');
      return `<button type="button" class="chess-row press" data-open="${g.code}"><span>${g.you === 'w' ? '⛀' : '⛂'} ${escapeHtml(opp ?? t('без соперника', 'no opponent'))}</span><small>${status}</small></button>`;
    }).join('')}`;
  } catch {
    // список — не главное
  }
}

// --- Онлайн ---

async function createOnline() {
  try {
    const online = await callBot('chessCreate', { color: prefs.color, kind: KIND });
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

const inviteLink = () => `https://t.me/${BOT_USERNAME}?start=chk_${game.code}`;

function invite() {
  const text = t('Сыграем в шашки? ⛀ Жми на ссылку', 'Fancy a game of checkers? ⛀ Tap the link');
  const url = `https://t.me/share/url?url=${encodeURIComponent(inviteLink())}&text=${encodeURIComponent(text)}`;
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
      // сеть моргнула — попробуем ещё
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
  (async () => {
    for (const id of fresh) await applyMove(id);
  })();
  if (!fresh.length && wasStatus !== online.status) {
    if (online.status === 'active' && wasStatus === 'waiting') {
      haptic('success');
      toast(t('Соперник пришёл — играем!', 'Your opponent is here — let’s play!'));
    }
    renderGame();
  }
}

// --- Партия ---

function enterGame() {
  picked = null;
  window.scrollTo(0, 0);
  flipped = game.mode === 'local' ? prefs.autoFlip && current().turn === 'b' : game.me === 'b';
  renderGame();
  if (game.mode === 'online') startPolling();
  else maybeBotMove();
}

function gameOutcome() {
  if (game.mode === 'online' && game.online?.status === 'over') {
    const r = game.online.result;
    return { over: true, result: r, reason: game.online.reason, winner: r === '1-0' ? 'w' : r === '0-1' ? 'b' : null };
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

function renderGame() {
  if (!view || !game) return;
  view.root.onclick = null;
  view.overShown = null;
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
      <div class="chess-board ck-board${flipped ? ' flipped' : ''}" id="board" role="grid" aria-label="${t('Доска для шашек', 'Checkers board')}">
        <div class="chess-squares">${Array.from({ length: 64 }, (_, i) => `<div class="sq ${((i >> 3) + (i & 7)) % 2 ? 'dark' : 'light'}" data-sq="${i}"></div>`).join('')}</div>
        <div class="chess-pieces" id="pieces"></div>
      </div>
      <div class="chess-over" id="over" hidden></div>
    </section>
    <div class="chess-player" id="p-bottom"></div>
    <p class="chess-status" id="status" aria-live="polite"></p>
    <div class="chess-moves" id="moves" aria-label="${t('Ходы партии', 'Moves')}"></div>
    <div class="chess-actions" id="actions"></div>`;

  Object.assign(view, {
    board: view.root.querySelector('#board'),
    squares: [...view.root.querySelectorAll('.sq')],
    pieces: view.root.querySelector('#pieces'),
    top: view.root.querySelector('#p-top'),
    bottom: view.root.querySelector('#p-bottom'),
    status: view.root.querySelector('#status'),
    moves: view.root.querySelector('#moves'),
    actions: view.root.querySelector('#actions'),
    over: view.root.querySelector('#over'),
    topColor: flipped ? 'w' : 'b',
    bottomColor: flipped ? 'b' : 'w',
    pieceEls: new Map(),
  });
  view.squares.forEach((sq, i) => {
    const name = squareName(i);
    if ((i & 7) === (flipped ? 7 : 0)) sq.insertAdjacentHTML('beforeend', `<span class="coord rank">${name[1]}</span>`);
    if (i >> 3 === (flipped ? 0 : 7)) sq.insertAdjacentHTML('beforeend', `<span class="coord file">${name[0]}</span>`);
  });
  view.board.addEventListener('click', onBoardClick);
  view.root.querySelector('.chess-invite')?.addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'invite') invite();
    if (act === 'copy') navigator.clipboard?.writeText(inviteLink()).then(() => toast(t('Ссылка скопирована', 'Link copied')), () => toast(inviteLink()));
  });
  view.actions.addEventListener('click', onAction);
  drawPieces();
  refresh();
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
  el.className = `ck ${colorOf(p) === 'w' ? 'white' : 'black'}${isKing(p) ? ' king' : ''}`;
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

/** Ходы, совместимые с уже выбранной частью серии. */
function candidateMoves() {
  if (!picked) return [];
  return legalMoves(current(), picked.from).filter((m) => picked.steps.every((sq, k) => m.path[k] === sq));
}

function refresh() {
  if (!view?.squares) return;
  const state = current();
  const end = gameOutcome();
  const lastMove = game.moves.length ? legalMoves(game.states.at(-2)).find((m) => moveId(m) === game.moves.at(-1)) : null;
  const lastSquares = lastMove ? [lastMove.from, ...lastMove.path] : [];
  const cands = candidateMoves();
  const step = picked ? picked.steps.length : 0;
  const nextTargets = new Set(cands.map((m) => m.path[step]).filter((x) => x !== undefined));
  const all = legalMoves(state);
  const mustCapture = all[0]?.captured.length > 0;
  const movable = canMoveNow() && !picked && mustCapture ? new Set(all.map((m) => m.from)) : new Set();
  view.squares.forEach((sq, i) => {
    sq.classList.toggle('last', lastSquares.includes(i));
    sq.classList.toggle('sel', !!picked && (i === picked.from || picked.steps.includes(i)));
    sq.classList.toggle('can-go', nextTargets.has(i));
    sq.classList.toggle('must', movable.has(i));
  });

  const playerHtml = (color) => {
    const turn = !end.over && state.turn === color && !(game.mode === 'online' && game.online.status === 'waiting');
    const left = count(state.board, color);
    const lost = 12 - count(state.board, color === 'w' ? 'b' : 'w');
    return `<span class="chess-avatar ck-avatar ${color === 'w' ? 'white' : 'black'}"><i></i></span>
      <span class="chess-name">${escapeHtml(playerLabel(color))}</span>
      <span class="chess-taken ck-count">${t(`${left} шаш.`, `${left} pcs`)}${lost ? ` · ${t('съел', 'took')} ${lost}` : ''}</span>
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
    const mustTake = legalMoves(state)[0]?.captured.length ? t('Бить обязательно! ', 'You must capture! ') : '';
    let who;
    if (game.mode === 'local' || (game.mode === 'online' && !game.online.you)) who = state.turn === 'w' ? t('Ход белых', 'White to move') : t('Ход чёрных', 'Black to move');
    else if (state.turn === game.me) who = t('Твой ход', 'Your move');
    else who = game.mode === 'bot' ? t('Бот думает…', 'Bot is thinking…') : t('Ход соперника', 'Opponent’s move');
    const showMust = mustTake && (game.mode === 'local' || state.turn === game.me);
    view.status.textContent = (showMust ? mustTake : '') + who;
    if (showMust) view.status.classList.add('in-check');
  }

  const notes = game.moves.map((id, i) => notation(game.states[i], legalMoves(game.states[i]).find((m) => moveId(m) === id)));
  let html = '';
  for (let i = 0; i < notes.length; i += 2) html += `<span class="mv"><i>${i / 2 + 1}.</i>${notes[i]}${notes[i + 1] ? ` ${notes[i + 1]}` : ''}</span>`;
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

function renderOver(end) {
  if (!end.over) {
    view.over.hidden = true;
    return;
  }
  if (view.overShown === game.moves.length) return;
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
    if (act === 'new') newGameSameMode();
  };
  const won = end.result && end.result !== '1/2-1/2' && (game.mode === 'local' || (end.result === '1-0' ? 'w' : 'b') === game.me);
  haptic(won ? 'success' : end.result === '1/2-1/2' ? 'warning' : 'error');
  if (won) jojo('big');
  else if (end.result === '1/2-1/2') jojo('draw');
  else if (end.result) jojo('tbc');
}

// --- Ходы игрока ---

function canMoveNow() {
  if (!game || gameOutcome().over || game.animating) return false;
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

/**
 * Касание доски. Серию взятий выбираем по шагам: сначала шашку, потом клетки,
 * куда она прыгает. Как только ход однозначен — он делается.
 */
function onBoardClick(e) {
  if (!canMoveNow()) return;
  const sq = squareFromEvent(e);
  if (sq < 0) return;
  const state = current();
  if (picked) {
    const step = picked.steps.length;
    const cands = candidateMoves().filter((m) => m.path[step] === sq);
    if (cands.length) {
      const done = cands.find((m) => m.path.length === step + 1);
      if (cands.length === 1 || (done && cands.every((m) => m === done))) {
        const move = cands[0];
        picked = null;
        userMove(moveId(move));
        return;
      }
      picked.steps.push(sq);
      haptic('select');
      refresh();
      return;
    }
  }
  const mine = legalMoves(state, sq);
  if (state.board[sq] && colorOf(state.board[sq]) === state.turn && mine.length) {
    picked = picked?.from === sq && !picked.steps.length ? null : { from: sq, steps: [] };
    haptic('select');
  } else {
    if (state.board[sq] && colorOf(state.board[sq]) === state.turn && legalMoves(state)[0]?.captured.length) {
      toast(t('Бить обязательно — выбери шашку, которая может взять', 'Capturing is compulsory — pick a piece that can capture'));
    }
    picked = null;
  }
  refresh();
}

async function userMove(id) {
  const ply = game.moves.length;
  await applyMove(id);
  if (game.mode === 'online') {
    try {
      applyOnline(await callBot('chessMove', { code: game.code, uci: id, ply }));
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
  if (game.mode === 'local' && prefs.autoFlip && !gameOutcome().over) {
    await sleep(350);
    if (view && game?.mode === 'local') {
      flipped = current().turn === 'b';
      renderGame();
    }
  }
  maybeBotMove();
}

/** Сделать ход: шашка прыгает по клеткам серии, сбитые исчезают, на краю — корона. */
async function applyMove(id) {
  const state = current();
  const move = legalMoves(state).find((m) => moveId(m) === id);
  if (!move) return;
  const g = game;
  g.moves.push(id);
  g.states.push(play(state, id));
  saveLocal();
  picked = null;
  g.animating = true;
  refresh();

  const els = view?.pieceEls;
  const el = els?.get(move.from);
  if (el) {
    els.delete(move.from);
    el.classList.add('moving');
    for (let k = 0; k < move.path.length; k++) {
      place(el, move.path[k]);
      const victim = move.captured[k];
      if (victim !== undefined) {
        const vEl = els.get(victim);
        if (vEl) {
          setTimeout(() => vEl.classList.add('taken'), 120);
          els.delete(victim);
          setTimeout(() => vEl.remove(), 400);
        }
        haptic('medium');
      } else haptic('light');
      await sleep(move.path.length > 1 ? 230 : 200);
    }
    el.classList.remove('moving');
    if (move.promote) el.classList.add('king');
    els.set(move.path.at(-1), el);
  }
  g.animating = false;
  if (game === g) refresh();
}

// --- Бот ---

function getWorker() {
  if (worker === false) return null;
  try {
    worker ??= new Worker(new URL('./checkers-worker.js', import.meta.url), { type: 'module' });
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
      setTimeout(() => {
        const m = bestMove(game.states.at(-1), level);
        resolve({ id, move: m && moveId(m) });
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
  const { id, move } = await askBot([...g.moves], g.level);
  await sleep(Math.max(0, 500 - (Date.now() - started)));
  g.thinking = false;
  if (game !== g || id !== botJob || !move) return;
  await applyMove(move);
}

// --- Кнопки ---

async function onAction(e) {
  const act = e.target.closest('[data-act]')?.dataset.act;
  if (!act) return;
  if (act === 'flip') {
    flipped = !flipped;
    if (game.mode === 'local') {
      prefs.autoFlip = false;
      store('prefs', prefs);
    }
    renderGame();
  } else if (act === 'undo') undo();
  else if (act === 'resign') await resign();
  else if (act === 'new') newGameSameMode();
  else if (act === 'menu') renderMenu();
}

function undo() {
  if (!game.moves.length || game.mode === 'online' || game.animating) return;
  botJob++;
  game.thinking = false;
  game.resigned = null;
  let n = 1;
  if (game.mode === 'bot') n = current().turn === game.me ? 2 : 1;
  n = Math.min(n, game.moves.length);
  game.moves.splice(-n);
  game.states.splice(-n);
  saveLocal();
  if (!game.moves.length) store(game.mode, null);
  picked = null;
  if (game.mode === 'local' && prefs.autoFlip) flipped = current().turn === 'b';
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
  store(game.mode, null);
  refresh();
}

function newGameSameMode() {
  if (game.mode !== 'online') store(game.mode, null);
  if (game.mode === 'bot') {
    const me = prefs.color === 'random' ? (Math.random() < 0.5 ? 'w' : 'b') : game.me;
    game = startGame('bot', { me, level: game.level });
    enterGame();
  } else if (game.mode === 'local') {
    game = startGame('local');
    enterGame();
  } else renderMenu();
}

// Русские шашки: доска 8×8, играют на тёмных полях, первыми ходят белые.
// Простая шашка ходит вперёд по диагонали, бьёт и вперёд, и назад. Бить обязательно,
// серией — пока есть кого; можно выбрать любую серию (не обязательно самую длинную).
// Сбитые шашки снимаются после хода («турецкий удар»: через одну шашку дважды не прыгают).
// Дамка ходит и бьёт на любое расстояние; шашка, дошедшая до края во время боя,
// становится дамкой и продолжает бить уже как дамка.
//
// Без DOM: тот же файл — в браузере, в воркере бота и на сервере (tgcloud/lib/checkers.js — копия).
// Доска — 64 клетки, 0 = a8 … 63 = h1. Фигура: 'w'/'b' — шашка, 'W'/'B' — дамка, null — пусто.

const FILES = 'abcdefgh';
export const squareName = (i) => `${FILES[i & 7]}${8 - (i >> 3)}`;
export const squareIndex = (name) => (8 - Number(name[1])) * 8 + FILES.indexOf(name[0]);
export const isDark = (i) => ((i >> 3) + (i & 7)) % 2 === 1;

export const colorOf = (p) => (p ? p.toLowerCase() : null);
export const isKing = (p) => p === 'W' || p === 'B';
const other = (c) => (c === 'w' ? 'b' : 'w');
const DIRS = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
const on = (r, c) => r >= 0 && r < 8 && c >= 0 && c < 8;
const lastRow = (color) => (color === 'w' ? 0 : 7);

// Ничья: 15 ходов каждого (30 полуходов) только дамками и без взятий.
const QUIET_LIMIT = 30;

export function newGame() {
  const board = Array(64).fill(null);
  for (let i = 0; i < 64; i++) {
    if (!isDark(i)) continue;
    if (i < 24) board[i] = 'b';
    else if (i >= 40) board[i] = 'w';
  }
  const state = { board, turn: 'w', quiet: 0, seen: {} };
  state.seen[positionKey(state)] = 1;
  return state;
}

/** Позиция из строки: 64 символа '.wbWB' (для тестов) и очередь хода. */
export function fromString(s, turn = 'w') {
  const cells = s.replace(/\s+/g, '');
  if (cells.length !== 64) throw new Error('Нужно 64 клетки');
  const board = [...cells].map((ch) => (ch === '.' ? null : ch));
  const state = { board, turn, quiet: 0, seen: {} };
  state.seen[positionKey(state)] = 1;
  return state;
}

const positionKey = (state) => `${state.board.map((p) => p || '.').join('')}${state.turn}`;

// --- Ходы ---
// Ход: { from, path: [клетки, куда встаёт по очереди], captured: [сбитые клетки], piece, promote }.

/** Все серии взятий фигуры с клетки from. */
function captureSequences(board, from) {
  const piece = board[from];
  const color = colorOf(piece);
  const out = [];
  const b = board.slice();
  b[from] = null; // фигура ушла с исходной клетки — дамка может пройти через неё

  const dfs = (sq, king, captured, path) => {
    const r = sq >> 3;
    const c = sq & 7;
    let found = false;
    for (const [dr, dc] of DIRS) {
      if (king) {
        let rr = r + dr;
        let cc = c + dc;
        while (on(rr, cc) && b[rr * 8 + cc] === null) {
          rr += dr;
          cc += dc;
        }
        if (!on(rr, cc)) continue;
        const victim = rr * 8 + cc;
        if (colorOf(b[victim]) === color || captured.includes(victim)) continue;
        rr += dr;
        cc += dc;
        while (on(rr, cc) && b[rr * 8 + cc] === null) {
          const land = rr * 8 + cc;
          found = true;
          dfs(land, true, [...captured, victim], [...path, land]);
          rr += dr;
          cc += dc;
        }
      } else {
        const vr = r + dr;
        const vc = c + dc;
        const lr = r + 2 * dr;
        const lc = c + 2 * dc;
        if (!on(lr, lc)) continue;
        const victim = vr * 8 + vc;
        const land = lr * 8 + lc;
        if (!b[victim] || colorOf(b[victim]) === color || captured.includes(victim) || b[land] !== null) continue;
        found = true;
        dfs(land, lr === lastRow(color), [...captured, victim], [...path, land]);
      }
    }
    if (!found && path.length) {
      out.push({ from, path, captured, piece, promote: !isKing(piece) && (king || (path.at(-1) >> 3) === lastRow(color)) });
    }
  };
  dfs(from, isKing(piece), [], []);
  return out;
}

function quietMoves(board, from) {
  const piece = board[from];
  const color = colorOf(piece);
  const r = from >> 3;
  const c = from & 7;
  const out = [];
  if (isKing(piece)) {
    for (const [dr, dc] of DIRS) {
      let rr = r + dr;
      let cc = c + dc;
      while (on(rr, cc) && board[rr * 8 + cc] === null) {
        out.push({ from, path: [rr * 8 + cc], captured: [], piece, promote: false });
        rr += dr;
        cc += dc;
      }
    }
  } else {
    const dr = color === 'w' ? -1 : 1;
    for (const dc of [-1, 1]) {
      const rr = r + dr;
      const cc = c + dc;
      if (on(rr, cc) && board[rr * 8 + cc] === null) {
        out.push({ from, path: [rr * 8 + cc], captured: [], piece, promote: rr === lastRow(color) });
      }
    }
  }
  return out;
}

/** Все ходы стороны, чья очередь. Если можно бить — только взятия. */
export function legalMoves(state, from = -1) {
  const caps = [];
  const quiet = [];
  for (let i = 0; i < 64; i++) {
    const p = state.board[i];
    if (!p || colorOf(p) !== state.turn) continue;
    caps.push(...captureSequences(state.board, i));
    if (!caps.length) quiet.push(...quietMoves(state.board, i));
  }
  const moves = caps.length ? caps : quiet;
  return from >= 0 ? moves.filter((m) => m.from === from) : moves;
}

/** Код хода: клетки подряд — 'c3d4', 'c3e5g7'. */
export const moveId = (m) => [m.from, ...m.path].map(squareName).join('');

export function findMove(state, id) {
  if (typeof id !== 'string' || !/^([a-h][1-8]){2,}$/.test(id)) return null;
  return legalMoves(state).find((m) => moveId(m) === id) ?? null;
}

export function makeMove(state, move) {
  const board = state.board.slice();
  for (const sq of move.captured) board[sq] = null;
  board[move.from] = null;
  board[move.path.at(-1)] = move.promote ? move.piece.toUpperCase() : move.piece;
  const quietKingMove = isKing(move.piece) && !move.captured.length;
  return { board, turn: other(state.turn), quiet: quietKingMove ? state.quiet + 1 : 0, seen: state.seen };
}

/** Ход в партии с учётом повторений. null — такого хода нет. */
export function play(state, id) {
  const move = findMove(state, id);
  if (!move) return null;
  const next = makeMove(state, move);
  const key = positionKey(next);
  next.seen = { ...state.seen, [key]: (state.seen[key] || 0) + 1 };
  return next;
}

export function replay(ids) {
  let state = newGame();
  for (const id of ids) {
    const next = play(state, id);
    if (!next) throw new Error(`Illegal move ${id}`);
    state = next;
  }
  return state;
}

/** Запись: 'c3-d4', взятие 'c3:e5:g7'. */
export const notation = (state, move) => [move.from, ...move.path].map(squareName).join(move.captured.length ? ':' : '-');

/**
 * { over: false } или { over: true, result: '1-0' | '0-1' | '1/2-1/2', reason, winner }.
 * reason: 'nomoves' — у того, кто ходит, нет ходов (все съедены или заперты) — он проиграл;
 * 'repetition' — позиция трижды; 'kings' — 15 ходов дамками без взятий.
 */
export function outcome(state) {
  if (!legalMoves(state).length) {
    const winner = other(state.turn);
    return { over: true, result: winner === 'w' ? '1-0' : '0-1', reason: 'nomoves', winner };
  }
  if ((state.seen[positionKey(state)] || 0) >= 3) return { over: true, result: '1/2-1/2', reason: 'repetition' };
  if (state.quiet >= QUIET_LIMIT) return { over: true, result: '1/2-1/2', reason: 'kings' };
  return { over: false };
}

export const count = (board, color) => board.filter((p) => colorOf(p) === color).length;

// Шахматы: правила целиком — ходы, шах и мат, пат, рокировка, взятие на проходе,
// превращение пешки, ничьи (50 ходов, троекратное повторение, мало фигур).
// Без DOM: тот же файл работает в браузере, в воркере бота-соперника и на сервере
// (tgcloud/lib/chess.js — копия, её кладёт scripts/deploy.mjs; тест сверяет, что они одинаковые).
//
// Доска — массив из 64 клеток, 0 = a8 … 63 = h1 (как в FEN). Фигура — буква:
// заглавная у белых (PNBRQK), строчная у чёрных, null — пусто.

export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

const FILES = 'abcdefgh';
export const squareName = (i) => `${FILES[i & 7]}${8 - (i >> 3)}`;
export const squareIndex = (name) => (8 - Number(name[1])) * 8 + FILES.indexOf(name[0]);

export const colorOf = (p) => (p ? (p === p.toUpperCase() ? 'w' : 'b') : null);
const other = (c) => (c === 'w' ? 'b' : 'w');
const isWhite = (p) => p === p.toUpperCase();

const KNIGHT = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
const KING = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
const ROOK_DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]];
const BISHOP_DIRS = [[-1, -1], [-1, 1], [1, -1], [1, 1]];

const on = (r, c) => r >= 0 && r < 8 && c >= 0 && c < 8;

// --- FEN ---

export function fromFen(fen = START_FEN) {
  const [placement, turn, castling, ep, half, full] = fen.trim().split(/\s+/);
  const board = [];
  for (const ch of placement) {
    if (ch === '/') continue;
    if (/\d/.test(ch)) for (let k = 0; k < Number(ch); k++) board.push(null);
    else board.push(ch);
  }
  if (board.length !== 64) throw new Error(`Bad FEN: ${fen}`);
  const state = {
    board,
    turn: turn === 'b' ? 'b' : 'w',
    castling: castling && castling !== '-' ? castling : '',
    ep: ep && ep !== '-' ? squareIndex(ep) : -1,
    half: Number(half) || 0,
    full: Number(full) || 1,
    seen: {},
  };
  state.seen[positionKey(state)] = 1;
  return state;
}

export function toFen(state) {
  const rows = [];
  for (let r = 0; r < 8; r++) {
    let row = '';
    let empty = 0;
    for (let c = 0; c < 8; c++) {
      const p = state.board[r * 8 + c];
      if (!p) empty++;
      else {
        if (empty) row += empty;
        empty = 0;
        row += p;
      }
    }
    if (empty) row += empty;
    rows.push(row);
  }
  const ep = state.ep >= 0 ? squareName(state.ep) : '-';
  return `${rows.join('/')} ${state.turn} ${state.castling || '-'} ${ep} ${state.half} ${state.full}`;
}

/** Ключ позиции для повторений: расстановка, очередь хода, права рокировки и взятия на проходе. */
function positionKey(state) {
  return `${state.board.map((p) => p || '.').join('')}${state.turn}${state.castling}${state.ep}`;
}

// --- Атаки ---

/** Бьёт ли сторона by клетку sq. */
export function isAttacked(board, sq, by) {
  const r = sq >> 3;
  const c = sq & 7;
  const white = by === 'w';
  // пешки
  const pr = white ? r + 1 : r - 1;
  for (const dc of [-1, 1]) {
    if (on(pr, c + dc) && board[pr * 8 + c + dc] === (white ? 'P' : 'p')) return true;
  }
  for (const [dr, dc] of KNIGHT) {
    if (on(r + dr, c + dc) && board[(r + dr) * 8 + c + dc] === (white ? 'N' : 'n')) return true;
  }
  for (const [dr, dc] of KING) {
    if (on(r + dr, c + dc) && board[(r + dr) * 8 + c + dc] === (white ? 'K' : 'k')) return true;
  }
  const slide = (dirs, pieces) => dirs.some(([dr, dc]) => {
    let rr = r + dr;
    let cc = c + dc;
    while (on(rr, cc)) {
      const p = board[rr * 8 + cc];
      if (p) return isWhite(p) === white && pieces.includes(p.toUpperCase());
      rr += dr;
      cc += dc;
    }
    return false;
  });
  return slide(ROOK_DIRS, 'RQ') || slide(BISHOP_DIRS, 'BQ');
}

const kingSquare = (board, color) => board.indexOf(color === 'w' ? 'K' : 'k');

export const inCheck = (state, color = state.turn) => isAttacked(state.board, kingSquare(state.board, color), other(color));

// --- Ходы ---
// Ход: { from, to, piece, captured, promo, flag } — flag: 'ep' | 'castle' | 'double' | undefined.

function pseudoMoves(state, onlyFrom = -1) {
  const { board, turn } = state;
  const white = turn === 'w';
  const moves = [];
  const add = (from, to, extra = {}) => moves.push({ from, to, piece: board[from], captured: board[to], ...extra });

  for (let from = 0; from < 64; from++) {
    if (onlyFrom >= 0 && from !== onlyFrom) continue;
    const p = board[from];
    if (!p || isWhite(p) !== white) continue;
    const r = from >> 3;
    const c = from & 7;
    const type = p.toUpperCase();

    if (type === 'P') {
      const dir = white ? -1 : 1;
      const startRow = white ? 6 : 1;
      const lastRow = white ? 0 : 7;
      const pushPawn = (to, extra = {}) => {
        if (to >> 3 === lastRow) for (const promo of 'QRBN') add(from, to, { ...extra, promo: white ? promo : promo.toLowerCase() });
        else add(from, to, extra);
      };
      const one = from + dir * 8;
      if (on(r + dir, c) && !board[one]) {
        pushPawn(one);
        const two = from + dir * 16;
        if (r === startRow && !board[two]) add(from, two, { flag: 'double' });
      }
      for (const dc of [-1, 1]) {
        if (!on(r + dir, c + dc)) continue;
        const to = (r + dir) * 8 + c + dc;
        if (board[to] && isWhite(board[to]) !== white) pushPawn(to);
        else if (to === state.ep) add(from, to, { flag: 'ep', captured: white ? 'p' : 'P' });
      }
    } else if (type === 'N' || type === 'K') {
      for (const [dr, dc] of type === 'N' ? KNIGHT : KING) {
        if (!on(r + dr, c + dc)) continue;
        const to = (r + dr) * 8 + c + dc;
        if (!board[to] || isWhite(board[to]) !== white) add(from, to);
      }
      if (type === 'K') castleMoves(state, from, add);
    } else {
      const dirs = type === 'R' ? ROOK_DIRS : type === 'B' ? BISHOP_DIRS : [...ROOK_DIRS, ...BISHOP_DIRS];
      for (const [dr, dc] of dirs) {
        let rr = r + dr;
        let cc = c + dc;
        while (on(rr, cc)) {
          const to = rr * 8 + cc;
          if (board[to]) {
            if (isWhite(board[to]) !== white) add(from, to);
            break;
          }
          add(from, to);
          rr += dr;
          cc += dc;
        }
      }
    }
  }
  return moves;
}

function castleMoves(state, from, add) {
  const { board, turn, castling } = state;
  const white = turn === 'w';
  const home = white ? 60 : 4; // e1 / e8
  if (from !== home) return;
  const enemy = other(turn);
  const rights = white ? ['K', 'Q'] : ['k', 'q'];
  // Короткая: f и g пусты; e, f, g не под боем. Длинная: b, c, d пусты; e, d, c не под боем.
  if (castling.includes(rights[0]) && !board[home + 1] && !board[home + 2] && board[home + 3] === (white ? 'R' : 'r')
    && ![home, home + 1, home + 2].some((s) => isAttacked(board, s, enemy))) {
    add(home, home + 2, { flag: 'castle' });
  }
  if (castling.includes(rights[1]) && !board[home - 1] && !board[home - 2] && !board[home - 3] && board[home - 4] === (white ? 'R' : 'r')
    && ![home, home - 1, home - 2].some((s) => isAttacked(board, s, enemy))) {
    add(home, home - 2, { flag: 'castle' });
  }
}

/** Сделать ход (без проверки легальности). Возвращает новое состояние. */
export function makeMove(state, move) {
  const board = state.board.slice();
  const white = state.turn === 'w';
  board[move.to] = move.promo || move.piece;
  board[move.from] = null;
  if (move.flag === 'ep') board[move.to + (white ? 8 : -8)] = null;
  if (move.flag === 'castle') {
    const kingside = move.to > move.from;
    const rookFrom = kingside ? move.from + 3 : move.from - 4;
    const rookTo = kingside ? move.from + 1 : move.from - 1;
    board[rookTo] = board[rookFrom];
    board[rookFrom] = null;
  }

  let { castling } = state;
  if (castling) {
    const lose = (sq) => ({ 60: 'KQ', 4: 'kq', 63: 'K', 56: 'Q', 7: 'k', 0: 'q' }[sq] || '');
    for (const ch of lose(move.from) + lose(move.to)) castling = castling.replace(ch, '');
  }

  const type = move.piece.toUpperCase();
  const next = {
    board,
    turn: other(state.turn),
    castling,
    ep: move.flag === 'double' ? (move.from + move.to) / 2 : -1,
    half: type === 'P' || move.captured ? 0 : state.half + 1,
    full: state.full + (white ? 0 : 1),
    seen: state.seen,
  };
  return next;
}

/** Все легальные ходы стороны, чья очередь (или только фигуры с клетки from). */
export function legalMoves(state, from = -1) {
  return pseudoMoves(state, from).filter((m) => {
    const next = makeMove(state, m);
    return !isAttacked(next.board, kingSquare(next.board, state.turn), next.turn);
  });
}

/** Ход в партии: легальный ход + учёт повторений. null — такого хода нет. */
export function play(state, uci) {
  const move = findMove(state, uci);
  if (!move) return null;
  const next = makeMove(state, move);
  const key = positionKey(next);
  next.seen = { ...state.seen, [key]: (state.seen[key] || 0) + 1 };
  return next;
}

// --- Запись ходов ---

/** 'e2e4', 'e7e8q' */
export const toUci = (m) => `${squareName(m.from)}${squareName(m.to)}${m.promo ? m.promo.toLowerCase() : ''}`;

export function findMove(state, uci) {
  if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci ?? '')) return null;
  const from = squareIndex(uci.slice(0, 2));
  const to = squareIndex(uci.slice(2, 4));
  const promo = uci[4];
  return legalMoves(state, from).find((m) => m.to === to && (m.promo ? m.promo.toLowerCase() === promo : !promo)) ?? null;
}

const LETTER_RU = { K: 'Кр', Q: 'Ф', R: 'Л', B: 'С', N: 'К', P: '' };

/** Короткая запись хода: 'Nf3', 'exd5', 'O-O', 'e8=Q+'. ru — русские буквы фигур (Кf3). */
export function san(state, move, ru = false) {
  const letter = (t) => (ru ? LETTER_RU[t] : t === 'P' ? '' : t);
  let s;
  const type = move.piece.toUpperCase();
  if (move.flag === 'castle') s = move.to > move.from ? 'O-O' : 'O-O-O';
  else {
    s = letter(type);
    if (type === 'P') {
      if (move.captured) s += squareName(move.from)[0];
    } else {
      // Неоднозначность: другая такая же фигура может пойти на ту же клетку.
      const rivals = legalMoves(state).filter((m) => m.to === move.to && m.piece === move.piece && m.from !== move.from);
      if (rivals.length) {
        const sameFile = rivals.some((m) => (m.from & 7) === (move.from & 7));
        const sameRank = rivals.some((m) => (m.from >> 3) === (move.from >> 3));
        if (!sameFile) s += squareName(move.from)[0];
        else if (!sameRank) s += squareName(move.from)[1];
        else s += squareName(move.from);
      }
    }
    if (move.captured) s += ru ? ':' : 'x';
    s += squareName(move.to);
    if (move.promo) s += `=${letter(move.promo.toUpperCase())}`;
  }
  const next = makeMove(state, move);
  if (inCheck(next)) s += legalMoves(next).length ? '+' : '#';
  return s;
}

// --- Итог партии ---

function insufficient(board) {
  const pieces = board.map((p, i) => p && { p: p.toUpperCase(), i }).filter((x) => x && x.p !== 'K');
  if (pieces.length === 0) return true;
  if (pieces.length === 1 && 'NB'.includes(pieces[0].p)) return true;
  // только слоны, все на полях одного цвета
  if (pieces.every((x) => x.p === 'B')) {
    const shade = (i) => ((i >> 3) + (i & 7)) % 2;
    return pieces.every((x) => shade(x.i) === shade(pieces[0].i));
  }
  return false;
}

/**
 * Состояние партии: { over: false } или
 * { over: true, result: '1-0' | '0-1' | '1/2-1/2', reason: 'mate' | 'stalemate' | 'fifty' | 'repetition' | 'material' }.
 */
export function outcome(state) {
  const moves = legalMoves(state);
  if (!moves.length) {
    if (inCheck(state)) return { over: true, result: state.turn === 'w' ? '0-1' : '1-0', reason: 'mate', winner: other(state.turn) };
    return { over: true, result: '1/2-1/2', reason: 'stalemate' };
  }
  if (state.half >= 100) return { over: true, result: '1/2-1/2', reason: 'fifty' };
  if ((state.seen[positionKey(state)] || 0) >= 3) return { over: true, result: '1/2-1/2', reason: 'repetition' };
  if (insufficient(state.board)) return { over: true, result: '1/2-1/2', reason: 'material' };
  return { over: false };
}

/** Партия из списка ходов в UCI. Бросает ошибку на нелегальном ходе. */
export function replay(uciMoves, fen = START_FEN) {
  let state = fromFen(fen);
  for (const uci of uciMoves) {
    const next = play(state, uci);
    if (!next) throw new Error(`Illegal move ${uci} at ${toFen(state)}`);
    state = next;
  }
  return state;
}

/** Число позиций на глубине depth — для проверки генератора ходов. */
export function perft(state, depth) {
  if (depth === 0) return 1;
  const moves = legalMoves(state);
  if (depth === 1) return moves.length;
  let n = 0;
  for (const m of moves) n += perft(makeMove(state, m), depth - 1);
  return n;
}

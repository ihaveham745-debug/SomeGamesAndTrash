// Блоки (как Block Blast): перетаскивай фигуры на поле, собирай целые ряды и столбцы.
// Без фишек — играем на очки и рекорд.

import { PIECES, SIZE, canPlace, fullLines, newGame, play } from '../lib/blocks.js';
import { fmt, haptic, tg } from '../ui.js';

export const title = 'Блоки';

const STORE = 'timeskip.blocks';
const CLOUD_BEST = 'blocks_best';
const cloud = tg?.isVersionAtLeast?.('6.9') ? tg.CloudStorage : null;

// --- Сохранение: партия переживает закрытие приложения ---

function save() {
  try {
    const tray = st.tray.map((s) => s && { id: s.piece.id, color: s.color });
    localStorage.setItem(STORE, JSON.stringify({ ...st, tray, last: null, best }));
  } catch {
    // приватный режим — без сохранения
  }
}

function restore() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE));
    if (!raw || raw.board?.length !== SIZE * SIZE) return null;
    const tray = raw.tray.map((s) => s && { piece: PIECES.find((p) => p.id === s.id), color: s.color });
    if (tray.some((s) => s && !s.piece)) return null; // фигуры поменялись — начнём заново
    best = Number(raw.best) || 0;
    return { ...raw, tray, last: null };
  } catch {
    return null;
  }
}

let best = 0;
let st = restore() ?? newGame();
let view = null;
let drag = null;

cloud?.getItem(CLOUD_BEST, (err, value) => {
  const v = Number(value);
  if (!err && v > best) {
    best = v;
    renderScore();
  }
});

// --- Экран ---

export function mount(root) {
  root.innerHTML = `
    <section class="blocks-head">
      <div class="blocks-stat"><span>Очки</span><b id="score"></b></div>
      <div class="blocks-stat best"><span>Рекорд</span><b id="best"></b></div>
      <button type="button" class="btn-glass press blocks-restart" id="restart" aria-label="Новая игра">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3M4.5 4v4h4"/></svg>
      </button>
    </section>
    <section class="blocks-board-wrap">
      <div class="blocks-board" id="board" role="grid" aria-label="Поле 8 на 8">
        ${Array.from({ length: SIZE * SIZE }, () => '<div class="bcell"></div>').join('')}
      </div>
      <div class="blocks-float" id="float" aria-live="polite"></div>
      <div class="blocks-over" id="over" hidden>
        <h2>Ходов нет</h2>
        <p id="over-text"></p>
        <button type="button" class="btn-primary press" id="again">Новая игра</button>
      </div>
    </section>
    <section class="blocks-tray" id="tray" aria-label="Фигуры"></section>
    <p class="note">Перетащи фигуру на поле. Целый ряд или столбец сгорает.</p>`;

  view = {
    board: root.querySelector('#board'),
    cells: [...root.querySelectorAll('.bcell')],
    tray: root.querySelector('#tray'),
    score: root.querySelector('#score'),
    best: root.querySelector('#best'),
    float: root.querySelector('#float'),
    over: root.querySelector('#over'),
    overText: root.querySelector('#over-text'),
  };
  root.querySelector('#restart').addEventListener('click', async () => {
    if (st.moves && !st.over && !(await ask('Начать заново? Текущая партия пропадёт.'))) return;
    restart();
  });
  root.querySelector('#again').addEventListener('click', restart);
  view.tray.addEventListener('pointerdown', startDrag);
  renderAll();
  return () => {
    endDrag(false);
    view = null;
  };
}

function ask(text) {
  if (tg?.isVersionAtLeast?.('6.2')) return new Promise((resolve) => tg.showConfirm(text, resolve));
  return Promise.resolve(window.confirm(text));
}

function restart() {
  st = newGame();
  save();
  haptic('medium');
  renderAll();
}

function renderAll() {
  renderBoard(st.board);
  renderTray();
  renderScore();
  renderOver();
}

function renderBoard(board) {
  if (!view) return;
  view.cells.forEach((cell, i) => {
    cell.className = board[i] ? `bcell filled c${board[i]}` : 'bcell';
  });
}

function pieceHtml(piece, color) {
  const cells = new Set(piece.cells.map(([r, c]) => `${r}:${c}`));
  let html = '';
  for (let r = 0; r < piece.rows; r++) {
    for (let c = 0; c < piece.cols; c++) html += cells.has(`${r}:${c}`) ? `<i class="filled c${color}"></i>` : '<i></i>';
  }
  return `<div class="piece" style="--rows:${piece.rows};--cols:${piece.cols}">${html}</div>`;
}

function renderTray() {
  if (!view) return;
  view.tray.innerHTML = st.tray.map((s, i) => {
    if (!s) return '<div class="tray-slot empty"></div>';
    return `<div class="tray-slot" data-i="${i}" aria-label="Фигура из ${s.piece.cells.length} клеток">${pieceHtml(s.piece, s.color)}</div>`;
  }).join('');
}

function renderScore() {
  if (!view) return;
  view.score.textContent = fmt(st.score);
  view.best.textContent = fmt(Math.max(best, st.score));
}

function renderOver() {
  if (!view) return;
  view.over.hidden = !st.over;
  if (st.over) {
    const record = st.score > 0 && st.score >= best;
    view.overText.innerHTML = record ? `Новый рекорд: <b>${fmt(st.score)}</b> 🏆` : `Очки: <b>${fmt(st.score)}</b> · рекорд ${fmt(best)}`;
  }
}

// --- Перетаскивание ---

function boardGeometry() {
  const a = view.cells[0].getBoundingClientRect();
  const b = view.cells[1].getBoundingClientRect();
  return { x: a.left, y: a.top, cell: a.width, step: b.left - a.left };
}

function startDrag(e) {
  const slot = e.target.closest('.tray-slot[data-i]');
  if (!slot || drag || st.over || !view) return;
  e.preventDefault();
  const index = Number(slot.dataset.i);
  const { piece, color } = st.tray[index];
  const geo = boardGeometry();

  const ghost = document.createElement('div');
  ghost.className = 'drag-piece';
  ghost.style.setProperty('--cell', `${geo.cell}px`);
  ghost.style.setProperty('--gap', `${geo.step - geo.cell}px`);
  ghost.innerHTML = pieceHtml(piece, color);
  document.body.append(ghost);

  const w = piece.cols * geo.step - (geo.step - geo.cell);
  const h = piece.rows * geo.step - (geo.step - geo.cell);
  // Фигура висит над пальцем, чтобы её было видно.
  const lift = e.pointerType === 'mouse' ? h / 2 : h + 28;
  drag = { index, piece, color, geo, ghost, w, h, lift, slot, pointerId: e.pointerId, target: null };
  slot.classList.add('dragging');
  slot.setPointerCapture?.(e.pointerId);
  slot.addEventListener('pointermove', moveDrag);
  slot.addEventListener('pointerup', dropDrag);
  slot.addEventListener('pointercancel', cancelDrag);
  haptic('light');
  moveDrag(e);
}

function moveDrag(e) {
  if (!drag || e.pointerId !== drag.pointerId) return;
  const left = e.clientX - drag.w / 2;
  const top = e.clientY - drag.lift;
  drag.ghost.style.transform = `translate(${left}px, ${top}px)`;

  const { geo, piece } = drag;
  const col = Math.round((left - geo.x) / geo.step);
  const row = Math.round((top - geo.y) / geo.step);
  const ok = canPlace(st.board, piece, row, col);
  const key = ok ? `${row}:${col}` : null;
  if (key === drag.target) return;
  drag.target = key;
  drag.row = row;
  drag.col = col;
  preview(ok ? { row, col } : null);
  if (ok) haptic('select');
}

/** Подсветка: куда встанет фигура и какие линии сгорят. */
function preview(at) {
  for (const c of view.cells) c.classList.remove('ghost', 'will-clear', ...GHOST_COLORS);
  if (!at) return;
  const board = [...st.board];
  for (const [r, c] of drag.piece.cells) {
    const i = (at.row + r) * SIZE + at.col + c;
    board[i] = drag.color;
    view.cells[i].classList.add('ghost', `g${drag.color}`);
  }
  const { rows, cols } = fullLines(board);
  for (const r of rows) for (let c = 0; c < SIZE; c++) view.cells[r * SIZE + c].classList.add('will-clear');
  for (const c of cols) for (let r = 0; r < SIZE; r++) view.cells[r * SIZE + c].classList.add('will-clear');
}
const GHOST_COLORS = [1, 2, 3, 4, 5, 6, 7].map((n) => `g${n}`);

function dropDrag(e) {
  if (!drag || e.pointerId !== drag.pointerId) return;
  const { index, row, col, target } = drag;
  endDrag(!target);
  if (target) place(index, row, col);
}

function cancelDrag() {
  endDrag(true);
}

function endDrag(missed) {
  if (!drag) return;
  const d = drag;
  drag = null;
  d.slot.classList.remove('dragging');
  d.slot.removeEventListener('pointermove', moveDrag);
  d.slot.removeEventListener('pointerup', dropDrag);
  d.slot.removeEventListener('pointercancel', cancelDrag);
  if (view) preview(null);
  if (missed && view) {
    // Плавно возвращаем фигуру в лоток.
    const to = d.slot.getBoundingClientRect();
    d.ghost.style.transition = 'transform .2s ease, opacity .2s ease';
    d.ghost.style.transform = `translate(${to.left + to.width / 2 - d.w / 2}px, ${to.top + to.height / 2 - d.h / 2}px) scale(.6)`;
    d.ghost.style.opacity = '0';
    setTimeout(() => d.ghost.remove(), 210);
  } else {
    d.ghost.remove();
  }
}

// --- Ход ---

async function place(index, row, col) {
  const prev = st;
  const next = play(st, index, row, col);
  if (!next) return;
  st = next;
  if (st.score > best) best = st.score;
  save();

  const { last } = st;
  // Сначала показываем поставленную фигуру, потом сжигаем линии.
  const between = [...prev.board];
  for (const i of last.placed) between[i] = prev.tray[index].color;
  renderBoard(between);
  renderTray();
  for (const i of last.placed) view?.cells[i].classList.add('pop-in');
  haptic('light');

  const lines = last.rows.length + last.cols.length;
  if (lines) {
    const burning = new Set();
    for (const r of last.rows) for (let c = 0; c < SIZE; c++) burning.add(r * SIZE + c);
    for (const c of last.cols) for (let r = 0; r < SIZE; r++) burning.add(r * SIZE + c);
    burning.forEach((i) => view?.cells[i].classList.add('burn'));
    haptic(lines > 1 ? 'heavy' : 'medium');
    floatText(last);
    await new Promise((resolve) => setTimeout(resolve, 320));
  }
  renderBoard(st.board);
  renderScore();

  if (st.over) {
    haptic('error');
    if (best === st.score) cloud?.setItem(CLOUD_BEST, String(best), () => {});
    setTimeout(renderOver, 350);
  }
}

function floatText(last) {
  if (!view) return;
  const parts = [`+${fmt(last.points)}`];
  if (last.cleared) parts.push('Чисто!');
  else if (last.combo > 1) parts.push(`Комбо ×${last.combo}`);
  view.float.innerHTML = parts.map((p, i) => `<span class="${i ? 'tag' : ''}">${p}</span>`).join('');
  view.float.classList.remove('show');
  void view.float.offsetWidth;
  view.float.classList.add('show');
}

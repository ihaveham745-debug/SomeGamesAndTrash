// Блоки — как Block Blast: перетаскивай фигуры на поле 8×8, целые ряды и столбцы сгорают.
// Без фишек — играем на очки и рекорд. Правила — в lib/blocks.js, здесь только экран.

import { COMBO_WINDOW, PIECES, SIZE, canPlace, fitsAnywhere, fullLines, newGame, play } from '../lib/blocks.js';
import { sfx, setSound, soundOn } from '../sound.js';
import { fmt, haptic, tg } from '../ui.js';

export const title = 'Блоки';

const STORE = 'timeskip.blocks';
const CLOUD_BEST = 'blocks_best';
const cloud = tg?.isVersionAtLeast?.('6.9') ? tg.CloudStorage : null;

// Цвета фигур 1…7 — те же, что у классов .c1….c7 в style.css.
const HEX = [null, '#ff4d4d', '#ff9a1f', '#ffd31a', '#3ddc5a', '#2ed3e6', '#3a7bff', '#b061ff'];

// Похвала за число линий одним ходом.
const PRAISE = { 2: 'Хорошо!', 3: 'Отлично!', 4: 'Супер!', 5: 'Потрясающе!', 6: 'Невероятно!' };

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
let shownScore = st.score;

cloud?.getItem(CLOUD_BEST, (err, value) => {
  const v = Number(value);
  if (!err && v > best) {
    best = v;
    renderBest();
  }
});

const CROWN = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 8.5 7.5 12 12 5l4.5 7L21 8.5 19 18H5z"/></svg>';
const icon = (on) => (on
  ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4zM15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/></svg>'
  : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4zM16 9.5l5 5M21 9.5l-5 5"/></svg>');

// --- Экран ---

export function mount(root) {
  root.innerHTML = `
    <section class="bb-top">
      <div class="bb-best" aria-label="Рекорд">${CROWN}<b id="best"></b></div>
      <div class="bb-center">
        <div class="bb-score" id="score" aria-live="polite"></div>
        <div class="combo off" id="combo"></div>
      </div>
      <div class="bb-actions">
        <button type="button" class="bb-btn press" id="sound"></button>
        <button type="button" class="bb-btn press" id="restart" aria-label="Новая игра">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3M4.5 4v4h4"/></svg>
        </button>
      </div>
    </section>
    <section class="blocks-board-wrap" id="wrap">
      <div class="blocks-board" id="board" role="grid" aria-label="Поле 8 на 8">
        ${Array.from({ length: SIZE * SIZE }, () => '<div class="bcell"></div>').join('')}
      </div>
      <div class="bb-fx" id="fx" aria-hidden="true"></div>
      <div class="blocks-float" id="float" aria-live="polite"></div>
      <div class="blocks-over" id="over" hidden>
        <p class="over-title">Нет места!</p>
        <div class="over-card">
          <span>Счёт</span>
          <b id="over-score"></b>
          <p id="over-best"></p>
          <button type="button" class="btn-primary press" id="again">Ещё раз</button>
        </div>
      </div>
    </section>
    <section class="blocks-tray" id="tray" aria-label="Фигуры"></section>`;

  view = {
    board: root.querySelector('#board'),
    cells: [...root.querySelectorAll('.bcell')],
    tray: root.querySelector('#tray'),
    score: root.querySelector('#score'),
    best: root.querySelector('#best'),
    fx: root.querySelector('#fx'),
    float: root.querySelector('#float'),
    combo: root.querySelector('#combo'),
    wrap: root.querySelector('#wrap'),
    over: root.querySelector('#over'),
    overScore: root.querySelector('#over-score'),
    overBest: root.querySelector('#over-best'),
    sound: root.querySelector('#sound'),
  };
  root.querySelector('#restart').addEventListener('click', async () => {
    if (st.moves && !st.over && !(await ask('Начать заново? Текущая партия пропадёт.'))) return;
    restart();
  });
  root.querySelector('#again').addEventListener('click', restart);
  view.sound.addEventListener('click', () => {
    setSound(!soundOn());
    renderSound();
    sfx.pick();
  });
  view.tray.addEventListener('pointerdown', startDrag);
  shownScore = st.score;
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
  shownScore = 0;
  save();
  haptic('medium');
  renderAll();
}

function renderAll() {
  renderBoard(st.board, st.over);
  renderTray();
  view.score.textContent = fmt(shownScore);
  renderBest();
  renderCombo();
  renderSound();
  renderOver();
}

function renderSound() {
  if (!view) return;
  view.sound.innerHTML = icon(soundOn());
  view.sound.setAttribute('aria-label', soundOn() ? 'Выключить звук' : 'Включить звук');
}

function renderBest() {
  if (view) view.best.textContent = fmt(Math.max(best, st.score));
}

/** Счёт «набегает», как в Block Blast. */
function countScore() {
  if (!view) return;
  const from = shownScore;
  const to = st.score;
  shownScore = to;
  const el = view.score;
  const start = performance.now();
  const dur = Math.min(700, 250 + (to - from) * 4);
  const step = (now) => {
    const k = Math.min(1, (now - start) / dur);
    el.textContent = fmt(from + (to - from) * (1 - (1 - k) ** 3));
    if (k < 1 && view?.score === el) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
  if (to > from) {
    el.classList.remove('bump');
    void el.offsetWidth;
    el.classList.add('bump');
  }
  renderBest();
}

/** Плашка серии: множитель и сколько ходов без сожжённой линии осталось до её конца. */
function renderCombo(bump = false) {
  if (!view) return;
  const el = view.combo;
  const on = st.combo > 1 && !st.over;
  if (!on) {
    el.classList.add('off');
    return;
  }
  const left = COMBO_WINDOW - st.sinceClear;
  const dots = Array.from({ length: COMBO_WINDOW }, (_, i) => `<i class="${i < left ? '' : 'used'}"></i>`).join('');
  el.className = `combo hot${Math.min(st.combo, 4)}`;
  el.innerHTML = `<span>Комбо <b>${st.combo}</b></span><span class="combo-left" aria-label="Ходов, чтобы продлить серию: ${left}">${dots}</span>`;
  if (bump) {
    void el.offsetWidth;
    el.classList.add('bump');
  }
}

function renderBoard(board, dead = false) {
  if (!view) return;
  view.cells.forEach((cell, i) => {
    cell.className = board[i] ? `bcell filled c${board[i]}${dead ? ' dead' : ''}` : 'bcell';
    cell.style.removeProperty('--b');
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
    // Фигуры, которым сейчас нет места, — тусклые (как в Block Blast).
    const fits = fitsAnywhere(st.board, s.piece);
    return `<div class="tray-slot${fits ? '' : ' nofit'}" data-i="${i}" aria-label="Фигура из ${s.piece.cells.length} клеток${fits ? '' : ', сейчас не влезает'}">${pieceHtml(s.piece, s.color)}</div>`;
  }).join('');
}

function renderOver() {
  if (!view) return;
  view.over.hidden = !st.over;
  if (!st.over) return;
  const record = st.score > 0 && st.score >= best;
  view.overScore.textContent = fmt(st.score);
  view.overBest.innerHTML = record ? `${CROWN} Новый рекорд!` : `${CROWN} Рекорд ${fmt(best)}`;
  view.overBest.classList.toggle('record', record);
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
  sfx.unlock();
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
  const lift = e.pointerType === 'mouse' ? h / 2 : h + geo.step * 1.2;
  drag = { index, piece, color, geo, ghost, w, h, lift, slot, pointerId: e.pointerId, target: null };
  slot.classList.add('dragging');
  slot.setPointerCapture?.(e.pointerId);
  slot.addEventListener('pointermove', moveDrag);
  slot.addEventListener('pointerup', dropDrag);
  slot.addEventListener('pointercancel', cancelDrag);
  haptic('light');
  sfx.pick();
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

/**
 * Подсказка: тень фигуры на месте, куда она встанет, а ряды, которые сгорят,
 * перекрашиваются в её цвет — как в Block Blast.
 */
function preview(at) {
  for (const c of view.cells) {
    c.classList.remove('ghost', 'will-clear');
    c.style.removeProperty('--b');
  }
  if (!at) return;
  const board = [...st.board];
  for (const [r, c] of drag.piece.cells) {
    const i = (at.row + r) * SIZE + at.col + c;
    board[i] = drag.color;
    view.cells[i].classList.add('ghost');
    view.cells[i].style.setProperty('--b', HEX[drag.color]);
  }
  const { rows, cols } = fullLines(board);
  const mark = (i) => {
    view.cells[i].classList.add('will-clear');
    view.cells[i].style.setProperty('--b', HEX[drag.color]);
  };
  for (const r of rows) for (let c = 0; c < SIZE; c++) mark(r * SIZE + c);
  for (const c of cols) for (let r = 0; r < SIZE; r++) mark(r * SIZE + c);
}

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
    sfx.miss();
    const to = d.slot.getBoundingClientRect();
    d.ghost.style.transition = 'transform .2s ease, opacity .2s ease';
    d.ghost.style.transform = `translate(${to.left + to.width / 2 - d.w / 2}px, ${to.top + to.height / 2 - d.h / 2}px) scale(.45)`;
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
  const color = prev.tray[index].color;
  // Сначала показываем поставленную фигуру, потом сжигаем линии.
  const between = [...prev.board];
  for (const i of last.placed) between[i] = color;
  renderBoard(between);
  renderTray();
  for (const i of last.placed) view?.cells[i].classList.add('pop-in');
  haptic('light');
  sfx.place();

  const lines = last.rows.length + last.cols.length;
  if (lines) {
    const burning = new Set();
    for (const r of last.rows) for (let c = 0; c < SIZE; c++) burning.add(r * SIZE + c);
    for (const c of last.cols) for (let r = 0; r < SIZE; r++) burning.add(r * SIZE + c);
    // Сгорающие блоки вспыхивают цветом поставленной фигуры и разлетаются искрами.
    burning.forEach((i) => {
      const cell = view?.cells[i];
      if (!cell) return;
      cell.style.setProperty('--b', HEX[color]);
      cell.classList.add('burn');
    });
    sparks(burning, color);
    const big = last.combo >= 3 || lines >= 3 || last.cleared;
    haptic(big ? 'heavy' : lines > 1 || last.combo > 1 ? 'medium' : 'light');
    if (big) {
      haptic('success');
      view?.wrap.classList.remove('shake');
      void view?.wrap.offsetWidth;
      view?.wrap.classList.add('shake');
    }
    setTimeout(() => (big ? sfx.big() : sfx.clear(lines, last.combo)), 60);
    floatText(last, lines);
    await new Promise((resolve) => setTimeout(resolve, 360));
  }
  renderBoard(st.board);
  countScore();
  renderCombo(lines > 0);
  if (prev.combo > 1 && st.combo === 0) toastCombo(prev.combo);

  if (st.over) await gameOver();
}

/** Конец партии: поле снизу вверх «гаснет», потом карточка со счётом. */
async function gameOver() {
  haptic('error');
  sfx.over();
  if (best === st.score) cloud?.setItem(CLOUD_BEST, String(best), () => {});
  renderTray();
  for (let r = SIZE - 1; r >= 0; r--) {
    if (!view) return;
    for (let c = 0; c < SIZE; c++) {
      const cell = view.cells[r * SIZE + c];
      if (cell.classList.contains('filled')) cell.classList.add('dead');
    }
    await new Promise((resolve) => setTimeout(resolve, 70));
  }
  await new Promise((resolve) => setTimeout(resolve, 250));
  renderOver();
}

/** Искры от сгоревших клеток. */
function sparks(cells, color) {
  if (!view) return;
  const geo = boardGeometry();
  const box = view.fx.getBoundingClientRect();
  const frag = document.createDocumentFragment();
  cells.forEach((i) => {
    const r = Math.floor(i / SIZE);
    const c = i % SIZE;
    for (let k = 0; k < 2; k++) {
      const s = document.createElement('i');
      const angle = Math.random() * Math.PI * 2;
      const dist = geo.step * (0.8 + Math.random() * 1.4);
      s.style.left = `${geo.x - box.left + c * geo.step + geo.cell / 2}px`;
      s.style.top = `${geo.y - box.top + r * geo.step + geo.cell / 2}px`;
      s.style.setProperty('--dx', `${Math.cos(angle) * dist}px`);
      s.style.setProperty('--dy', `${Math.sin(angle) * dist - geo.step * 0.6}px`);
      s.style.setProperty('--b', k ? '#fff' : HEX[color]);
      s.style.animationDelay = `${Math.random() * 80}ms`;
      frag.append(s);
    }
  });
  view.fx.append(frag);
  setTimeout(() => view?.fx.replaceChildren(), 800);
}

function floatText(last, lines) {
  if (!view) return;
  const parts = [];
  const praise = last.cleared ? 'Чисто!' : PRAISE[Math.min(lines, 6)];
  if (praise) parts.push(`<span class="praise">${praise}</span>`);
  if (last.combo > 1) parts.push(`<span class="combo-word">Комбо ${last.combo}</span>`);
  parts.push(`<span class="pts">+${fmt(last.points)}</span>`);
  view.float.innerHTML = parts.join('');
  view.float.classList.toggle('big', last.combo >= 3 || lines >= 3 || last.cleared);
  view.float.classList.remove('show');
  void view.float.offsetWidth;
  view.float.classList.add('show');
}

function toastCombo(was) {
  if (!view) return;
  view.combo.className = 'combo';
  view.combo.innerHTML = `<span class="combo-hint">Комбо ${was} прервалось</span>`;
  setTimeout(() => {
    if (view && st.combo < 2) view.combo.classList.add('off');
  }, 1400);
}

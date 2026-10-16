// Европейская рулетка: ставки фишками на поле, потом крутим колесо.

import { randInt } from '../lib/random.js';
import { OUTSIDE, WHEEL, colorOf, totalPayout } from '../lib/roulette.js';
import { chipPicker, fmt, haptic, jojo, short, toast } from '../ui.js';

export const title = 'Рулетка';

const STEP = 360 / 37;
const SPIN_MS = 4800;

let chip = 10;
let bets = {};
let placed = []; // [spot, amount] — чтобы отменять по одной
let lastBets = null;
let history = [];
let rotation = 0;
let spinning = false;
let view = null;
let ctxRef = null;

const COLORS = { red: '#d7263d', black: '#16181d', green: '#109a5a' };

function point(r, deg) {
  const a = (deg * Math.PI) / 180;
  return `${(r * Math.sin(a)).toFixed(2)} ${(-r * Math.cos(a)).toFixed(2)}`;
}

function sector(r0, r1, a0, a1) {
  return `M${point(r0, a0)} L${point(r1, a0)} A${r1} ${r1} 0 0 1 ${point(r1, a1)} L${point(r0, a1)} A${r0} ${r0} 0 0 0 ${point(r0, a0)}Z`;
}

function wheelSvg() {
  const parts = WHEEL.map((n, k) => {
    const a0 = (k - 0.5) * STEP;
    const a1 = (k + 0.5) * STEP;
    const fill = COLORS[colorOf(n)];
    return `<path d="${sector(72, 93, a0, a1)}" fill="${fill}"/>
      <path d="${sector(58, 72, a0, a1)}" fill="${fill}" opacity=".55"/>
      <text transform="rotate(${(k * STEP).toFixed(2)}) translate(0 -82.5)">${n}</text>`;
  }).join('');
  const spokes = [0, 45, 90, 135].map((d) => `<rect x="-1.6" y="-46" width="3.2" height="92" rx="1.6" transform="rotate(${d})"/>`).join('');
  return `
    <svg viewBox="-100 -100 200 200" class="wheel-svg" aria-hidden="true">
      <circle r="99" class="rim"/>
      <g class="wheel-rot">
        ${parts}
        <circle r="58" class="hub"/>
        <g class="spokes">${spokes}</g>
        <circle r="13" class="cap"/>
      </g>
      <g class="ball-rot"><circle cy="-65" r="4.2" class="ball"/></g>
    </svg>`;
}

function cell(spot, label, cls = '') {
  return `<button type="button" class="cell ${cls} press" data-spot="${spot}"><span>${label}</span></button>`;
}

export function mount(root, ctx) {
  ctxRef = ctx;
  const numbers = [];
  for (let n = 1; n <= 36; n++) numbers.push(cell(`n${n}`, n, colorOf(n)));
  root.innerHTML = `
    <section class="wheel-box">
      <div class="wheel">
        ${wheelSvg()}
        <div class="pointer" aria-hidden="true"></div>
      </div>
      <div class="history" id="history" aria-label="Последние числа"></div>
    </section>
    <p class="table-msg" id="msg" aria-live="polite"></p>
    <section class="board" id="board">
      ${cell('n0', 0, 'green zero')}
      <div class="numbers">${numbers.join('')}</div>
      <div class="outside dozens">${['dozen1', 'dozen2', 'dozen3'].map((s) => cell(s, OUTSIDE[s].label)).join('')}</div>
      <div class="outside evens">
        ${cell('low', '1–18')}${cell('even', 'Чёт')}${cell('red', '<i class="dot red"></i>', 'pick-red')}${cell('black', '<i class="dot black"></i>', 'pick-black')}${cell('odd', 'Нечет')}${cell('high', '19–36')}
      </div>
    </section>
    <div class="dock">
      <div class="bet-row"><span>Фишка</span><div id="chips"></div></div>
      <div class="controls actions">
        <button type="button" class="btn-glass press" data-act="undo">Отменить</button>
        <button type="button" class="btn-glass press" data-act="clear">Сбросить</button>
        <button type="button" class="btn-primary press" data-act="spin">Крутить</button>
      </div>
    </div>`;

  view = {
    root,
    wheel: root.querySelector('.wheel-rot'),
    ball: root.querySelector('.ball-rot'),
    board: root.querySelector('#board'),
    msg: root.querySelector('#msg'),
    history: root.querySelector('#history'),
    picker: chipPicker({ get: () => chip, set: (v) => { chip = v; }, wallet: ctx.wallet }),
  };
  root.querySelector('#chips').replaceWith(view.picker.el);
  view.wheel.style.transform = `rotate(${rotation}deg)`;

  view.board.addEventListener('click', (e) => {
    const c = e.target.closest('[data-spot]');
    if (c) place(c.dataset.spot);
  });
  root.querySelector('.controls').addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'undo') undo();
    else if (act === 'clear') clear();
    else if (act === 'spin') spin();
  });
  render();
  return () => {
    view = null;
  };
}

function totalBet() {
  return Object.values(bets).reduce((s, x) => s + x, 0);
}

function render(message, tone = '') {
  if (!view) return;
  for (const c of view.board.querySelectorAll('[data-spot]')) {
    const amount = bets[c.dataset.spot];
    let badge = c.querySelector('.stake');
    if (amount && !badge) {
      badge = document.createElement('b');
      badge.className = 'stake';
      c.append(badge);
    }
    if (badge) {
      if (amount) badge.textContent = short(amount);
      else badge.remove();
    }
  }
  view.history.innerHTML = history.map((n) => `<span class="h ${colorOf(n)}">${n}</span>`).join('');
  const total = totalBet();
  const undoBtn = view.root.querySelector('[data-act="undo"]');
  const clearBtn = view.root.querySelector('[data-act="clear"]');
  const spinBtn = view.root.querySelector('[data-act="spin"]');
  undoBtn.disabled = spinning || !placed.length;
  clearBtn.disabled = spinning || !placed.length;
  if (!spinning && !placed.length && lastBets) {
    spinBtn.textContent = 'Повторить ставку';
    spinBtn.dataset.act = 'spin';
  } else {
    spinBtn.textContent = total ? `Крутить · ${fmt(total)}` : 'Крутить';
  }
  spinBtn.disabled = spinning;
  view.picker.disable(spinning);
  view.picker.update();
  if (message !== undefined) {
    view.msg.innerHTML = message;
    view.msg.className = `table-msg ${tone}`;
  } else if (!spinning && !view.msg.innerHTML) view.msg.textContent = 'Нажимай на числа и поля, чтобы поставить';
}

function place(spot) {
  if (spinning) return;
  if (!ctxRef.wallet.take(chip)) return ctxRef.noChips();
  bets[spot] = (bets[spot] ?? 0) + chip;
  placed.push([spot, chip]);
  haptic('select');
  render('');
  view?.board.querySelector(`[data-spot="${spot}"] .stake`)?.animate(
    [{ transform: 'scale(.4)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }],
    { duration: 180, easing: 'cubic-bezier(.3,1.5,.6,1)' },
  );
}

function undo() {
  const last = placed.pop();
  if (!last) return;
  const [spot, amount] = last;
  bets[spot] -= amount;
  if (!bets[spot]) delete bets[spot];
  ctxRef.wallet.give(amount);
  ctxRef.wallet.render();
  haptic('light');
  render();
}

function clear() {
  const total = totalBet();
  if (!total) return;
  ctxRef.wallet.give(total);
  ctxRef.wallet.render();
  bets = {};
  placed = [];
  haptic('light');
  render();
}

/** Повторить прошлые ставки, если хватает фишек. */
function rebet() {
  const total = Object.values(lastBets).reduce((s, x) => s + x, 0);
  if (!ctxRef.wallet.take(total)) {
    ctxRef.noChips();
    return false;
  }
  bets = { ...lastBets };
  placed = Object.entries(bets);
  return true;
}

async function spin() {
  if (spinning) return;
  if (!placed.length) {
    if (!lastBets) {
      toast('Сначала поставь: нажми на число или поле');
      return;
    }
    if (!rebet()) return;
  }
  spinning = true;
  const result = randInt(37);
  const payout = totalPayout(bets, result);
  const staked = totalBet();
  ctxRef.wallet.give(payout);
  lastBets = bets;
  bets = {};
  placed = [];

  const v = view;
  render('Ставки сделаны, ставок больше нет…');
  if (v) for (const c of v.board.querySelectorAll('.cell.win')) c.classList.remove('win');
  // Выпавший карман должен прийти под стрелку сверху; плюс случайный сдвиг внутри кармана.
  const k = WHEEL.indexOf(result);
  const jitter = (randInt(60) / 100 - 0.3) * STEP;
  const target = (((-k * STEP + jitter - rotation) % 360) + 360) % 360;
  rotation += 360 * 5 + target;
  haptic('medium');
  if (v) {
    v.root.querySelector('.wheel-box').scrollIntoView({ behavior: 'smooth', block: 'start' });
    v.wheel.style.transition = `transform ${SPIN_MS}ms cubic-bezier(.12,.6,.1,1)`;
    v.wheel.style.transform = `rotate(${rotation}deg)`;
    v.ball.animate(
      [{ transform: 'rotate(0deg)' }, { transform: `rotate(${-360 * 4 + jitter}deg)` }],
      { duration: SPIN_MS, easing: 'cubic-bezier(.2,.65,.15,1)', fill: 'forwards' },
    );
  }
  await new Promise((resolve) => setTimeout(resolve, SPIN_MS + 100));

  spinning = false;
  history = [result, ...history].slice(0, 12);
  const color = { red: 'красное', black: 'чёрное', green: 'зеро' }[colorOf(result)];
  const profit = payout - staked;
  const text = payout
    ? `<span class="num ${colorOf(result)}">${result}</span> ${color} · ${profit > 0 ? `<b>+${fmt(profit)}</b>` : profit === 0 ? 'в ноль' : `вернулось ${fmt(payout)}`}`
    : `<span class="num ${colorOf(result)}">${result}</span> ${color} · мимо`;
  haptic(profit > 0 ? 'success' : payout ? 'warning' : 'error');
  if (profit > 0) jojo(profit >= staked * 5 ? 'big' : 'win');
  ctxRef.wallet.render({ bump: profit > 0 });
  view?.board.querySelector(`[data-spot="n${result}"]`)?.classList.add('win');
  render(text, profit > 0 ? 'won' : payout ? '' : 'lost');
}

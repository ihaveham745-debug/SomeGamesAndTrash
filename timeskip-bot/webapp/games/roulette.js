// Европейская рулетка: ставки фишками на поле, потом крутим колесо.

import { ICON } from '../icons.js';
import { randInt } from '../lib/random.js';
import { OUTSIDE, WHEEL, colorOf, totalPayout } from '../lib/roulette.js';
import { chipPicker, fmt, haptic, setMsg, short, toast } from '../ui.js';

export const title = 'Рулетка';

const STEP = 360 / 37;
const SPIN_MS = 4000;
const IDLE = { text: 'Нажимай на числа и поля, чтобы поставить' };

let chip = 10;
let bets = {};
let placed = []; // [spot, amount] — чтобы отменять по одной
let lastBets = null;
let history = [];
let rotation = 0;
let spinning = false;
let msgState = IDLE;
let winSpots = [];
let view = null;
let ctxRef = null;

const COLORS = { red: '#D9383E', black: '#0B1118', green: '#1F9D5C' };
const WORD = { red: 'Красное', black: 'Чёрное', green: 'Зеро' };

function point(r, deg) {
  const a = (deg * Math.PI) / 180;
  return `${(r * Math.sin(a)).toFixed(2)} ${(-r * Math.cos(a)).toFixed(2)}`;
}

function sector(r0, r1, a0, a1) {
  return `M${point(r0, a0)} L${point(r1, a0)} A${r1} ${r1} 0 0 1 ${point(r1, a1)} L${point(r0, a1)} A${r0} ${r0} 0 0 0 ${point(r0, a0)}Z`;
}

function wheelSvg() {
  const pockets = WHEEL.map((n, k) => {
    const a0 = (k - 0.5) * STEP;
    const a1 = (k + 0.5) * STEP;
    return `<path d="${sector(70, 96, a0, a1)}" fill="${COLORS[colorOf(n)]}" stroke="#1A2533" stroke-width=".6"/>`;
  }).join('');
  const ticks = Array.from({ length: 8 }, (_, k) => `<path d="M0 -56V-46" class="tick" transform="rotate(${k * 45})"/>`).join('');
  const last = spinning ? undefined : history[0];
  return `
    <svg viewBox="-104 -104 208 208" class="wheel-svg" aria-hidden="true">
      <circle r="100" class="rim"/>
      <g class="wheel-rot">
        ${pockets}
        <circle r="70" class="track"/>
        <circle r="56" class="hub"/>
        ${ticks}
      </g>
      <g class="ball-rot"><circle cy="-63" r="4.5" class="ball"/></g>
      <circle r="34" class="readout"/>
      <text class="hub-num" data-c="${last === undefined ? '' : colorOf(last)}">${last ?? '—'}</text>
      <path d="M-7 -103H7L0 -91Z" class="pointer"/>
    </svg>`;
}

function cell(spot, label, cls = '', sub = '', style = '') {
  return `<button type="button" class="cell ${cls} press" data-spot="${spot}"${style ? ` style="${style}"` : ''}><span>${label}</span>${sub ? `<small>${sub}</small>` : ''}</button>`;
}

export function mount(root, ctx) {
  ctxRef = ctx;
  const numbers = [];
  for (let n = 1; n <= 36; n++) numbers.push(cell(`n${n}`, n, colorOf(n)));
  const dozens = [1, 2, 3].map((d) => cell(`dozen${d}`, OUTSIDE[`dozen${d}`].label, 'dozen', '×3', `grid-column:7;grid-row:${d * 2 - 1}/span 2`)).join('');
  root.innerHTML = `
    <section class="wheel-box">
      <div class="wheel">${wheelSvg()}</div>
      <div class="wheel-side">
        <span class="side-label">Последние</span>
        <div class="history" id="history" aria-label="Последние числа"></div>
        <div class="odds" aria-hidden="true"><i class="o-r"></i><i class="o-b"></i><i class="o-z"></i></div>
        <ul class="odds-legend"><li><i class="o-r"></i>Красное 48,6%</li><li><i class="o-b"></i>Чёрное 48,6%</li><li><i class="o-z"></i>Зеро 2,7%</li></ul>
      </div>
    </section>
    <p class="msg" id="msg" aria-live="polite"></p>
    <section class="board" id="board">
      <div class="row-a">${cell('n0', '0', 'zero', '×36')}${cell('red', 'Красное', 'pick-red', '48,6% · ×2')}${cell('black', 'Чёрное', 'pick-black', '48,6% · ×2')}</div>
      <div class="grid-n">${numbers.join('')}${dozens}</div>
      <div class="row-c">${cell('low', '1–18')}${cell('even', 'Чёт')}${cell('odd', 'Нечет')}${cell('high', '19–36')}</div>
    </section>
    <details class="rules">
      <summary>Правила ${ICON.down}</summary>
      <ul>
        <li>Европейская рулетка, одно зеро</li>
        <li>Число — ×36, шанс 2,7%</li>
        <li>Дюжина — ×3, шанс 32,4%</li>
        <li>Цвет, чёт/нечет, половина — ×2, шанс 48,6%</li>
        <li>Зеро проигрывает все внешние ставки</li>
        <li>Возврат 97,3%</li>
      </ul>
    </details>
    <div class="dock">
      <div class="dock-info"><span id="in-play">Ставок нет</span><span id="max-win"></span></div>
      <div class="dock-chips"><span class="dock-label">Фишка</span><div id="chips"></div></div>
      <div class="dock-actions">
        <button type="button" class="btn-icon press" data-act="undo" aria-label="Отменить последнюю ставку">${ICON.undo}</button>
        <button type="button" class="btn-icon press" data-act="clear" aria-label="Убрать все ставки">${ICON.trash}</button>
        <button type="button" class="btn-primary press" data-act="spin">Крутить</button>
      </div>
    </div>`;

  view = {
    root,
    wheel: root.querySelector('.wheel-rot'),
    ball: root.querySelector('.ball-rot'),
    hubNum: root.querySelector('.hub-num'),
    board: root.querySelector('#board'),
    msg: root.querySelector('#msg'),
    history: root.querySelector('#history'),
    inPlay: root.querySelector('#in-play'),
    maxWin: root.querySelector('#max-win'),
    undo: root.querySelector('[data-act="undo"]'),
    clear: root.querySelector('[data-act="clear"]'),
    spin: root.querySelector('[data-act="spin"]'),
    picker: chipPicker({ get: () => chip, set: (v) => { chip = v; }, wallet: ctx.wallet, label: 'Фишка' }),
  };
  root.querySelector('#chips').replaceWith(view.picker.el);
  view.wheel.style.transform = `rotate(${rotation}deg)`;
  if (!spinning) for (const s of winSpots) view.board.querySelector(`[data-spot="${s}"]`)?.classList.add('win');

  view.board.addEventListener('click', (e) => {
    const c = e.target.closest('[data-spot]');
    if (c) place(c.dataset.spot);
  });
  root.querySelector('.dock-actions').addEventListener('click', (e) => {
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

const sum = (b) => Object.values(b).reduce((s, x) => s + x, 0);
const maxPayout = (b) => Math.max(...Array.from({ length: 37 }, (_, r) => totalPayout(b, r)));

function render() {
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
    c.classList.toggle('has-stake', !!amount);
  }
  view.history.innerHTML = history.length
    ? history.map((n) => `<span class="h ${colorOf(n)}">${n}</span>`).join('')
    : '<span class="empty">Пока пусто</span>';

  const total = sum(bets);
  if (total) {
    view.inPlay.innerHTML = `В игре <b>${fmt(total)}</b>`;
    view.maxWin.innerHTML = `Можно выиграть до <b>${fmt(maxPayout(bets))}</b>`;
  } else {
    view.inPlay.textContent = 'Ставок нет';
    view.maxWin.textContent = '';
  }

  view.undo.disabled = spinning || !placed.length;
  view.clear.disabled = spinning || !placed.length;
  view.spin.disabled = spinning;
  if (spinning) {
    view.spin.setAttribute('aria-busy', 'true');
    view.spin.textContent = 'Крутим…';
  } else {
    view.spin.removeAttribute('aria-busy');
    if (total) view.spin.textContent = `Крутить · ${fmt(total)}`;
    else if (lastBets) view.spin.textContent = `Повторить · ${fmt(sum(lastBets))}`;
    else view.spin.textContent = 'Крутить';
  }
  view.board.classList.toggle('busy', spinning);
  view.picker.disable(spinning);
  view.picker.update();
  setMsg(view.msg, msgState);
}

function clearWins() {
  winSpots = [];
  if (view) for (const c of view.board.querySelectorAll('.cell.win')) c.classList.remove('win');
}

function place(spot) {
  if (spinning) return;
  if (!ctxRef.wallet.take(chip)) return ctxRef.noChips();
  bets[spot] = (bets[spot] ?? 0) + chip;
  placed.push([spot, chip]);
  haptic('select');
  msgState = IDLE;
  render();
  view?.board.querySelector(`[data-spot="${spot}"] .stake`)?.animate(
    [{ transform: 'scale(.6)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }],
    { duration: 160, easing: 'cubic-bezier(.2,.8,.2,1)' },
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
  msgState = IDLE;
  render();
}

function clear() {
  const total = sum(bets);
  if (!total) return;
  ctxRef.wallet.give(total);
  ctxRef.wallet.render();
  bets = {};
  placed = [];
  haptic('light');
  msgState = IDLE;
  render();
}

/** Повторить прошлые ставки, если хватает фишек. */
function rebet() {
  if (!ctxRef.wallet.take(sum(lastBets))) {
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
  const staked = sum(bets);
  ctxRef.wallet.give(payout);
  ctxRef.record?.(payout - staked);
  lastBets = bets;
  bets = {};
  placed = [];

  const v = view;
  clearWins();
  msgState = { text: 'Ставок больше нет…', tone: 'busy' };
  render();
  // Выпавший карман должен прийти под стрелку сверху; плюс случайный сдвиг внутри кармана.
  const k = WHEEL.indexOf(result);
  const jitter = (randInt(60) / 100 - 0.3) * STEP;
  const target = (((-k * STEP + jitter - rotation) % 360) + 360) % 360;
  rotation += 360 * 5 + target;
  haptic('medium');
  if (v) {
    v.hubNum.textContent = '—';
    v.hubNum.dataset.c = '';
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
  const color = colorOf(result);
  const profit = payout - staked;
  const label = `<span class="pocket ${color}">${result}</span> ${WORD[color]}`;
  if (profit > 0) msgState = { html: label, tone: lastBets[`n${result}`] ? 'big' : 'won', amount: profit };
  else if (profit === 0) msgState = { html: `${label} · в ноль`, tone: 'push', amount: 0 };
  else if (payout) msgState = { html: `${label} · вернулось ${fmt(payout)}`, tone: 'push', amount: profit };
  else msgState = { html: label, tone: 'lost', amount: -staked };
  winSpots = [`n${result}`, ...Object.keys(OUTSIDE).filter((s) => OUTSIDE[s].wins(result))];

  haptic(profit > 0 ? 'success' : payout ? 'warning' : 'error');
  ctxRef.wallet.render({ bump: profit > 0 });
  if (!view) return;
  view.hubNum.textContent = result;
  view.hubNum.dataset.c = color;
  for (const s of winSpots) view.board.querySelector(`[data-spot="${s}"]`)?.classList.add('win');
  render();
}

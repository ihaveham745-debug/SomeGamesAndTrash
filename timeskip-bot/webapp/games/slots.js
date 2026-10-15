// Слоты: три барабана, линия выплат посередине.

import { ICON, SYM, symSvg } from '../icons.js';
import { randInt } from '../lib/random.js';
import { SYMBOLS, TWO_CHERRIES, multiplier, spin } from '../lib/slots.js';
import { betPanel, haptic, setMsg } from '../ui.js';

export const title = 'Слоты';

const randomSymbol = () => SYMBOLS[randInt(SYMBOLS.length)].s;
const symIndex = (s) => SYMBOLS.findIndex((x) => x.s === s);
const CHERRY = SYMBOLS[0].s;
const symHtml = (s) => `<div class="sym">${symSvg(symIndex(s), 44)}</div>`;

// Шанс каждой комбинации (точный расчёт по весам из lib/slots.js), от дорогой к дешёвой.
const CHANCE = ['1,56%', '0,98%', '0,57%', '0,29%', '0,12%', '0,04%', '0,005%'];
const IDLE = { text: 'Три одинаковых на линии или две вишни — выигрыш' };

// Состояние живёт между заходами в игру.
let bet = 10;
let spinning = false;
const visible = [0, 1, 2].map(() => [randomSymbol(), randomSymbol(), randomSymbol()]);
let msgState = IDLE;
let view = null;
let ctxRef = null;

function rulesHtml() {
  const row = (art, chance, pay) => `<tr><td>${art}</td><td>${chance}</td><td>×${pay}</td></tr>`;
  const three = (i) => `<span class="syms">${symSvg(i, 20).repeat(3)}</span>`;
  const rows = SYMBOLS.map((x, i) => row(three(i), CHANCE[i], x.three)).reverse();
  rows.push(row(`<span class="syms">${symSvg(0, 20).repeat(2)}</span><span class="where">где угодно</span>`, '14,1%', TWO_CHERRIES));
  return `
    <details class="rules">
      <summary>Правила и выплаты ${ICON.down}</summary>
      <div class="rules-body">
        <table class="rules-table">
          <thead><tr><th>Комбинация</th><th>Шанс</th><th>Выплата</th></tr></thead>
          <tbody>${rows.join('')}</tbody>
        </table>
        <p class="rules-foot">Выплата — вместе со ставкой. Возврат 93,8% на дистанции.</p>
      </div>
    </details>`;
}

export function mount(root, ctx) {
  ctxRef = ctx;
  root.innerHTML = `
    <section class="stage slots-stage">
      <div class="reels">
        ${[0, 1, 2].map(() => '<div class="reel"><div class="strip"></div></div>').join('')}
        <div class="band" aria-hidden="true"></div>
      </div>
    </section>
    <section class="trade"><p class="msg" id="msg" aria-live="polite"></p><div id="controls"></div></section>
    ${rulesHtml()}`;

  const reels = [...root.querySelectorAll('.reel')];
  const panel = betPanel({
    get: () => bet,
    set: (v) => { bet = v; },
    wallet: ctx.wallet,
    verb: 'Крутить',
    id: 'spin',
    toWin: (b) => ({ value: b * 500, upTo: true }),
    caption: () => 'вместе со ставкой · шанс выигрыша 17,6%',
  });
  root.querySelector('#controls').append(panel.el);

  reels.forEach((reel, i) => {
    reel.firstElementChild.innerHTML = visible[i].map(symHtml).join('');
  });
  view = { reels, band: root.querySelector('.band'), msg: root.querySelector('#msg'), panel };
  setMsg(view.msg, msgState);
  setBusy(view, spinning);

  panel.button.addEventListener('click', play);
  return () => {
    view = null;
  };
}

function setBusy(v, on) {
  v.panel.disable(on);
  if (on) {
    v.panel.button.setAttribute('aria-busy', 'true');
    v.panel.button.textContent = 'Крутим…';
  } else {
    v.panel.button.removeAttribute('aria-busy');
    v.panel.update();
  }
}

function animateReel(reel, i, symbol) {
  const strip = reel.firstElementChild;
  const filler = Array.from({ length: 16 + i * 6 }, randomSymbol);
  const above = randomSymbol();
  const below = randomSymbol();
  const items = [...visible[i], ...filler, above, symbol, below];
  visible[i] = [above, symbol, below];

  strip.innerHTML = items.map(symHtml).join('');
  strip.style.transition = 'none';
  strip.style.transform = 'translateY(0)';
  const h = strip.firstElementChild.getBoundingClientRect().height;
  void strip.offsetHeight;
  const seconds = 1.0 + i * 0.3;
  strip.style.transition = `transform ${seconds}s cubic-bezier(.2,.7,.2,1)`;
  strip.style.transform = `translateY(${-(items.length - 3) * h}px)`;
  return new Promise((resolve) => {
    setTimeout(() => {
      haptic('light');
      resolve();
    }, seconds * 1000);
  });
}

function resultMsg(result, win) {
  if (!win) return { text: 'Мимо', tone: 'lost', amount: -bet };
  const m = multiplier(result);
  const three = result[0] === result[1] && result[1] === result[2];
  if (!three) return { text: `Две вишни · ×${TWO_CHERRIES}`, tone: 'won', amount: win - bet };
  const i = symIndex(result[0]);
  if (i === SYMBOLS.length - 1) return { text: `Джекпот · ${SYM[i].three}`, tone: 'big', amount: win - bet };
  return { text: `${SYM[i].three} · ×${m}`, tone: m >= 60 ? 'big' : 'won', amount: win - bet };
}

async function play() {
  if (spinning || !view) return;
  const { wallet, noChips } = ctxRef;
  if (!wallet.take(bet)) return noChips();
  spinning = true;
  const v = view;
  setBusy(v, true);
  setMsg(v.msg, (msgState = { text: 'Крутим…', tone: 'busy' }));
  for (const r of v.reels) r.classList.remove('win');
  v.band.classList.remove('win');
  haptic('medium');

  const result = spin();
  const win = bet * multiplier(result);
  wallet.give(win); // начисляем сразу: если уйти с экрана, выигрыш не пропадёт
  ctxRef.record?.(win - bet);
  const final = resultMsg(result, win);

  await Promise.all(v.reels.map((reel, i) => animateReel(reel, i, result[i])));
  spinning = false;
  msgState = final;
  const cur = view;
  if (!cur) return;

  setBusy(cur, false);
  wallet.render({ bump: win > 0 });
  setMsg(cur.msg, msgState);
  if (win > 0) {
    const three = result[0] === result[1] && result[1] === result[2];
    cur.reels.forEach((r, i) => r.classList.toggle('win', three || result[i] === CHERRY));
    cur.band.classList.add('win');
    haptic('success');
  }
}

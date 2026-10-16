// Слоты: три барабана, линия выплат посередине.

import { randInt } from '../lib/random.js';
import { SYMBOLS, TWO_CHERRIES, multiplier, spin } from '../lib/slots.js';
import { chipPicker, fmt, haptic, jojo } from '../ui.js';
import { t } from '../i18n.js';

export const title = () => t('Слоты', 'Slots');

const randomSymbol = () => SYMBOLS[randInt(SYMBOLS.length)].s;

// Состояние живёт между заходами в игру.
let bet = 10;
let spinning = false;
const visible = [0, 1, 2].map(() => [randomSymbol(), randomSymbol(), randomSymbol()]);
let view = null;

export function mount(root, { wallet, noChips }) {
  root.innerHTML = `
    <section class="machine">
      <div class="marquee"><span>★</span> ${t('Три в ряд', 'Three in a row')} <span>★</span></div>
      <div class="reels">
        ${[0, 1, 2].map(() => '<div class="reel"><div class="strip"></div></div>').join('')}
        <div class="payline" aria-hidden="true"></div>
      </div>
      <p class="slot-msg" id="msg" aria-live="polite">${t('Собери три одинаковых на линии', 'Line up three of a kind')}</p>
    </section>
    <div class="bet-row"><span>${t('Ставка', 'Bet')}</span><div id="chips"></div></div>
    <button type="button" class="btn-primary press" id="spin">${t('Крутить', 'Spin')}</button>
    <details class="paytable">
      <summary>${t('Выплаты', 'Payouts')}</summary>
      <div class="pay-grid">
        ${[...SYMBOLS].reverse().map((x) => `<span>${x.s}${x.s}${x.s}</span><b>×${x.three}</b>`).join('')}
        <span>🍒🍒 ${t('где угодно', 'anywhere')}</span><b>×${TWO_CHERRIES}</b>
      </div>
    </details>`;

  const reels = [...root.querySelectorAll('.reel')];
  const msg = root.querySelector('#msg');
  const btn = root.querySelector('#spin');
  const picker = chipPicker({ get: () => bet, set: (v) => { bet = v; }, wallet });
  root.querySelector('#chips').replaceWith(picker.el);

  reels.forEach((reel, i) => {
    reel.firstElementChild.innerHTML = visible[i].map((s) => `<div class="sym">${s}</div>`).join('');
  });
  btn.disabled = spinning;
  view = { reels, msg, btn, picker, wallet };

  btn.addEventListener('click', () => play(wallet, noChips));
  return () => {
    view = null;
  };
}

function animateReel(reel, i, symbol) {
  const strip = reel.firstElementChild;
  const filler = Array.from({ length: 16 + i * 6 }, randomSymbol);
  const above = randomSymbol();
  const below = randomSymbol();
  const items = [...visible[i], ...filler, above, symbol, below];
  visible[i] = [above, symbol, below];

  strip.innerHTML = items.map((s) => `<div class="sym">${s}</div>`).join('');
  strip.style.transition = 'none';
  strip.style.transform = 'translateY(0)';
  const h = strip.firstElementChild.getBoundingClientRect().height;
  void strip.offsetHeight;
  const seconds = 1.1 + i * 0.45;
  strip.style.transition = `transform ${seconds}s cubic-bezier(.15,.8,.25,1.04)`;
  strip.style.transform = `translateY(${-(items.length - 3) * h}px)`;
  return new Promise((resolve) => {
    setTimeout(() => {
      haptic('light');
      resolve();
    }, seconds * 1000);
  });
}

async function play(wallet, noChips) {
  if (spinning || !view) return;
  if (!wallet.take(bet)) return noChips();
  spinning = true;
  const v = view;
  v.btn.disabled = true;
  v.picker.disable(true);
  v.msg.textContent = t('Крутим…', 'Spinning…');
  v.msg.className = 'slot-msg';
  for (const r of v.reels) r.classList.remove('win');
  haptic('medium');

  const result = spin();
  const win = bet * multiplier(result);
  wallet.give(win); // начисляем сразу: если уйти с экрана, выигрыш не пропадёт

  await Promise.all(v.reels.map((reel, i) => animateReel(reel, i, result[i])));
  spinning = false;
  if (view !== v) return;

  v.btn.disabled = false;
  v.picker.disable(false);
  v.picker.update();
  wallet.render({ bump: win > 0 });
  if (win > 0) {
    v.msg.innerHTML = `${win >= bet * 20 ? t('Джекпот! ', 'Jackpot! ') : t('Выигрыш ', 'Win ')}<b>+${fmt(win)}</b>`;
    v.msg.className = `slot-msg won${win >= bet * 20 ? ' big' : ''}`;
    v.reels.forEach((r, i) => r.classList.toggle('win', result[0] === result[2] || result[i] === '🍒'));
    haptic('success');
    jojo(win >= bet * 20 ? 'big' : 'win');
  } else {
    v.msg.textContent = t('Мимо. Ещё разок?', 'No luck. One more?');
  }
}

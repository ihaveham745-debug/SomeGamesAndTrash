// Видеопокер «Jacks or Better»: раздали 5 карт → отметь, какие оставить → замена → выплата.

import { newDeck } from '../lib/cards.js';
import { PAYTABLE, evaluate } from '../lib/poker.js';
import { cardEl, chipPicker, fmt, haptic, jojo, setFace, sleep } from '../ui.js';

export const title = 'Покер';

let bet = 10;
let deck = newDeck();
// phase: 'bet' — до раздачи, 'hold' — выбираем карты, 'done' — итог
let st = { phase: 'bet', hand: deck.slice(0, 5), held: [false, false, false, false, false], bet: 0, win: null, message: 'Раздай карты и оставь лучшие' };
let view = null;
let ctxRef = null;
let busy = false;

export function mount(root, ctx) {
  ctxRef = ctx;
  root.innerHTML = `
    <section class="paytable-board" id="pays"></section>
    <section class="felt felt-poker">
      <div class="poker-hand" id="hand"></div>
      <p class="table-msg" id="msg" aria-live="polite"></p>
    </section>
    <div id="controls"></div>`;
  view = {
    pays: root.querySelector('#pays'),
    hand: root.querySelector('#hand'),
    msg: root.querySelector('#msg'),
    controls: root.querySelector('#controls'),
  };
  view.hand.innerHTML = st.hand.map((_, i) => `<button type="button" class="slot press" data-i="${i}"><span class="held-tag">Держу</span></button>`).join('');
  st.hand.forEach((c, i) => view.hand.children[i].prepend(cardEl(c, { down: st.phase === 'bet' })));
  view.hand.addEventListener('click', onCard);
  view.controls.addEventListener('click', onControl);
  render();
  return () => {
    view = null;
  };
}

function render() {
  if (!view) return;
  const shownBet = st.phase === 'bet' ? bet : st.bet;
  const current = st.phase === 'done' ? st.win : st.phase === 'hold' ? evaluate(st.hand) : null;
  view.pays.innerHTML = PAYTABLE.map((p) => `
    <div class="pay-row${current?.key === p.key ? ' hit' : ''}"><span>${p.name}</span><b>${fmt(p.mult * shownBet)}</b></div>`).join('');
  [...view.hand.children].forEach((slot, i) => {
    slot.classList.toggle('held', st.held[i]);
    slot.disabled = st.phase !== 'hold';
  });
  view.msg.innerHTML = st.message;
  view.msg.className = `table-msg ${st.phase === 'done' ? (st.win ? 'won' : 'lost') : ''}`;

  const c = view.controls;
  if (st.phase === 'hold') {
    c.className = 'controls';
    c.innerHTML = '<button type="button" class="btn-primary press" data-act="draw">Заменить</button>';
  } else {
    c.className = 'controls';
    c.innerHTML = `<div class="bet-row"><span>Ставка</span><div id="chips"></div></div><button type="button" class="btn-primary press" data-act="deal">${st.phase === 'done' ? 'Раздать снова' : 'Раздать'}</button>`;
    const picker = chipPicker({ get: () => bet, set: (v) => { bet = v; render(); }, wallet: ctxRef.wallet });
    c.querySelector('#chips').replaceWith(picker.el);
  }
}

function onCard(e) {
  const slot = e.target.closest('.slot');
  if (!slot || st.phase !== 'hold' || busy) return;
  const i = Number(slot.dataset.i);
  st.held[i] = !st.held[i];
  haptic('select');
  render();
}

async function onControl(e) {
  const act = e.target.closest('[data-act]')?.dataset.act;
  if (!act || busy) return;
  busy = true;
  try {
    if (act === 'deal') await deal();
    else if (act === 'draw') await drawCards();
  } finally {
    busy = false;
  }
}

/** Перевернуть карты с индексами idx рубашкой вверх, сменить и открыть по одной. */
async function flip(idx) {
  const v = view;
  const cards = v ? [...v.hand.children].map((s) => s.querySelector('.card')) : [];
  for (const i of idx) cards[i]?.classList.add('down');
  await sleep(260);
  for (const i of idx) {
    if (cards[i]) setFace(cards[i], st.hand[i]);
    cards[i]?.classList.remove('down');
    haptic('light');
    await sleep(110);
  }
}

async function deal() {
  if (!ctxRef.wallet.take(bet)) return ctxRef.noChips();
  haptic('medium');
  deck = newDeck();
  st = { phase: 'hold', hand: deck.splice(0, 5), held: [false, false, false, false, false], bet, win: null, message: '' };
  render();
  await flip([0, 1, 2, 3, 4]);
  const now = evaluate(st.hand);
  st.message = now ? `Уже есть: <b>${now.name}</b>. Отметь карты, которые оставить` : 'Нажми на карты, которые оставить';
  render();
}

async function drawCards() {
  const idx = [0, 1, 2, 3, 4].filter((i) => !st.held[i]);
  for (const i of idx) st.hand[i] = deck.pop();
  st.phase = 'done';
  st.win = evaluate(st.hand);
  const payout = st.win ? st.win.mult * st.bet : 0;
  ctxRef.wallet.give(payout);
  st.message = 'Меняем…';
  render();
  await flip(idx);
  st.message = st.win ? `${st.win.name}! <b>+${fmt(payout - st.bet)}</b>` : 'Ничего не собралось';
  if (st.win?.mult === 1) st.message = `${st.win.name} — ставка вернулась`;
  haptic(payout > st.bet ? 'success' : payout ? 'warning' : 'error');
  if (payout > st.bet) jojo(st.win.mult >= 9 ? 'big' : 'win');
  ctxRef.wallet.render({ bump: payout > st.bet });
  render();
}

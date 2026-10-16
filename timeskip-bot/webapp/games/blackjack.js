// Блэкджек против дилера.

import { dealerShouldHit, handValue, isBlackjack, isBust, settle } from '../lib/blackjack.js';
import { newDeck } from '../lib/cards.js';
import { cardEl, chipPicker, fmt, haptic, jojo, sleep } from '../ui.js';

export const title = 'Блэкджек';

const DECKS = 6;
let shoe = newDeck(DECKS);
let bet = 25;
// phase: 'bet' — ждём ставку, 'play' — ход игрока, 'dealer' — ход дилера, 'done' — итог
let st = { phase: 'bet', player: [], dealer: [], bet: 0, holeOpen: false, message: 'Делай ставку и раздавай', tone: '' };
let view = null;
let ctxRef = null;

function draw() {
  if (shoe.length < 60) shoe = newDeck(DECKS);
  return shoe.pop();
}

export function mount(root, ctx) {
  ctxRef = ctx;
  root.innerHTML = `
    <section class="felt">
      <div class="seat">
        <div class="seat-label">Дилер <span class="score" id="d-score"></span></div>
        <div class="hand" id="dealer"></div>
      </div>
      <p class="table-msg" id="msg" aria-live="polite"></p>
      <div class="seat">
        <div class="hand" id="player"></div>
        <div class="seat-label">Ты <span class="score" id="p-score"></span></div>
      </div>
      <p class="felt-rules">Блэкджек платит 3:2 · дилер берёт до 17</p>
    </section>
    <div id="controls"></div>`;
  view = {
    dealer: root.querySelector('#dealer'),
    player: root.querySelector('#player'),
    dScore: root.querySelector('#d-score'),
    pScore: root.querySelector('#p-score'),
    msg: root.querySelector('#msg'),
    controls: root.querySelector('#controls'),
  };
  view.controls.addEventListener('click', onControl);
  render(false);
  return () => {
    view = null;
  };
}

/** Перерисовать стол. animate — новые карты прилетают с анимацией. */
function render(animate = true) {
  if (!view) return;
  syncHand(view.player, st.player, animate, false);
  syncHand(view.dealer, st.dealer, animate, !st.holeOpen);
  const shown = st.holeOpen ? st.dealer : st.dealer.slice(0, 1);
  view.dScore.textContent = st.dealer.length ? handValue(shown).total : '';
  const p = handValue(st.player);
  view.pScore.textContent = st.player.length ? (p.soft && p.total < 21 ? `${p.total - 10}/${p.total}` : p.total) : '';
  view.msg.innerHTML = st.message;
  view.msg.className = `table-msg ${st.tone}`;
  renderControls();
}

function syncHand(container, cards, animate, hideHole) {
  if (container.children.length > cards.length) container.replaceChildren();
  cards.forEach((c, i) => {
    let el = container.children[i];
    if (!el) {
      el = cardEl(c, { down: hideHole && i === 1, deal: animate });
      container.append(el);
    }
    el.classList.toggle('down', hideHole && i === 1);
  });
}

function renderControls() {
  const c = view.controls;
  if (st.phase === 'bet' || st.phase === 'done') {
    c.className = 'controls';
    c.innerHTML = '<div class="bet-row"><span>Ставка</span><div id="chips"></div></div><button type="button" class="btn-primary press" data-act="deal">Раздать</button>';
    const picker = chipPicker({ get: () => bet, set: (v) => { bet = v; }, wallet: ctxRef.wallet });
    c.querySelector('#chips').replaceWith(picker.el);
  } else {
    const canDouble = st.phase === 'play' && st.player.length === 2 && ctxRef.wallet.balance >= st.bet;
    const off = st.phase !== 'play' ? 'disabled' : '';
    c.className = 'controls actions';
    c.innerHTML = `
      <button type="button" class="btn-glass press" data-act="hit" ${off}>Ещё</button>
      <button type="button" class="btn-glass press" data-act="double" ${canDouble ? '' : 'disabled'}>Удвоить</button>
      <button type="button" class="btn-primary press" data-act="stand" ${off}>Хватит</button>`;
  }
}

let busy = false;

async function onControl(e) {
  const act = e.target.closest('[data-act]')?.dataset.act;
  if (!act || busy) return;
  busy = true;
  try {
    if (act === 'deal') await deal();
    else if (act === 'hit') await hit();
    else if (act === 'stand') await stand();
    else if (act === 'double') await double();
  } finally {
    busy = false;
  }
}

async function deal() {
  if (!ctxRef.wallet.take(bet)) return ctxRef.noChips();
  haptic('medium');
  st = { phase: 'dealer', player: [], dealer: [], bet, holeOpen: false, message: '', tone: '' };
  render();
  for (const who of ['player', 'dealer', 'player', 'dealer']) {
    st[who].push(draw());
    render();
    haptic('light');
    await sleep(260);
  }
  if (isBlackjack(st.player) || isBlackjack(st.dealer)) return finish();
  st.phase = 'play';
  st.message = 'Ещё карту или хватит?';
  render();
}

async function hit() {
  st.player.push(draw());
  haptic('light');
  if (isBust(st.player)) return finish();
  if (handValue(st.player).total === 21) {
    render();
    await sleep(300);
    return stand();
  }
  render();
}

async function double() {
  if (!ctxRef.wallet.take(st.bet)) return ctxRef.noChips();
  st.bet *= 2;
  st.player.push(draw());
  haptic('medium');
  render();
  await sleep(350);
  if (isBust(st.player)) return finish();
  return stand();
}

async function stand() {
  st.phase = 'dealer';
  st.holeOpen = true;
  st.message = 'Ход дилера…';
  render();
  await sleep(500);
  while (dealerShouldHit(st.dealer)) {
    st.dealer.push(draw());
    haptic('light');
    render();
    await sleep(550);
  }
  return finish();
}

function finish() {
  st.holeOpen = true;
  const { result, payout } = settle(st.player, st.dealer, st.bet);
  ctxRef.wallet.give(payout);
  const profit = payout - st.bet;
  const texts = {
    blackjack: [`Блэкджек! <b>+${fmt(profit)}</b>`, 'won big'],
    win: [`${isBust(st.dealer) ? 'У дилера перебор. ' : ''}Победа! <b>+${fmt(profit)}</b>`, 'won'],
    push: ['Ничья — ставка вернулась', ''],
    lose: [isBlackjack(st.dealer) ? 'У дилера блэкджек' : 'Дилер выиграл', 'lost'],
    bust: ['Перебор 💥', 'lost'],
  };
  [st.message, st.tone] = texts[result];
  st.phase = 'done';
  haptic(profit > 0 ? 'success' : profit < 0 ? 'error' : 'warning');
  if (profit > 0) jojo(result === 'blackjack' ? 'big' : 'win');
  else if (profit === 0) jojo('draw');
  ctxRef.wallet.render({ bump: profit > 0 });
  render();
}

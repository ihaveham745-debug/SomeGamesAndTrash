// Блэкджек против дилера.

import { ICON } from '../icons.js';
import { dealerShouldHit, handValue, isBlackjack, isBust, settle } from '../lib/blackjack.js';
import { newDeck } from '../lib/cards.js';
import { betPanel, cardEl, fmt, haptic, setMsg, sleep } from '../ui.js';

export const title = 'Блэкджек';

const DECKS = 6;
// Шанс перебора у дилера по его открытой карте (симуляция lib, 3 млн раздач; без блэкджека у дилера — игра его проверяет).
const DEALER_BUST = { 2: 35, 3: 37, 4: 40, 5: 42, 6: 42, 7: 26, 8: 24, 9: 23, 10: 23, J: 23, Q: 23, K: 23, A: 17 };

let shoe = newDeck(DECKS);
let bet = 25;
// phase: 'bet' — ждём ставку, 'play' — ход игрока, 'dealer' — ход дилера, 'done' — итог
let st = { phase: 'bet', player: [], dealer: [], bet: 0, holeOpen: false, msg: { text: 'Делай ставку и раздавай' } };
let view = null;
let ctxRef = null;

function draw() {
  if (shoe.length < 60) shoe = newDeck(DECKS);
  return shoe.pop();
}

/** Шанс перебора, если взять ещё карту: по всем невидимым картам (вместе с закрытой картой дилера). */
function bustChance() {
  const unseen = st.holeOpen ? shoe : [...shoe, st.dealer[1]];
  const n = unseen.filter((c) => handValue([...st.player, c]).total > 21).length;
  return Math.round((100 * n) / unseen.length);
}

export function mount(root, ctx) {
  ctxRef = ctx;
  root.innerHTML = `
    <section class="stage bj">
      <div class="seat-label">Дилер <span class="score" id="d-score"></span></div>
      <div class="hand" id="dealer"></div>
      <hr class="divider">
      <div class="hand" id="player"></div>
      <div class="seat-label">Ты <span class="score" id="p-score"></span></div>
      <p class="stage-cap">Блэкджек 3:2 · дилер стоит на 17 · 6 колод</p>
    </section>
    <section class="trade"><p class="msg" id="msg" aria-live="polite"></p><div id="controls" class="controls"></div></section>
    <details class="rules">
      <summary>Правила ${ICON.down}</summary>
      <ul>
        <li>6 колод, перетасовка при остатке меньше 60 карт</li>
        <li>Дилер берёт до 16 и стоит на всех 17</li>
        <li>Блэкджек платит 3:2, обычная победа — 1:1</li>
        <li>Удвоение — только на первых двух картах</li>
        <li>Без сплита и страховки</li>
        <li>Возврат около 99% при базовой стратегии</li>
      </ul>
    </details>`;
  view = {
    dealer: root.querySelector('#dealer'),
    player: root.querySelector('#player'),
    dScore: root.querySelector('#d-score'),
    pScore: root.querySelector('#p-score'),
    msg: root.querySelector('#msg'),
    controls: root.querySelector('#controls'),
    ctlKey: null,
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
  const d = handValue(shown).total;
  view.dScore.textContent = st.dealer.length ? d : '';
  view.dScore.classList.toggle('bust', st.dealer.length > 0 && d > 21);
  view.dScore.classList.toggle('good', st.dealer.length > 0 && d === 21);
  const p = handValue(st.player);
  view.pScore.textContent = st.player.length ? (p.soft && p.total < 21 ? `${p.total - 10}/${p.total}` : p.total) : '';
  view.pScore.classList.toggle('bust', st.player.length > 0 && p.total > 21);
  view.pScore.classList.toggle('good', st.player.length > 0 && p.total === 21);
  setMsg(view.msg, st.msg);
  renderControls();
}

function syncHand(container, cards, animate, hideHole) {
  if (!cards.length) {
    if (!container.querySelector('.card-ph')) container.innerHTML = '<div class="card-ph"></div><div class="card-ph"></div>';
    return;
  }
  if (container.querySelector('.card-ph') || container.children.length > cards.length) container.replaceChildren();
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
  const betting = st.phase === 'bet' || st.phase === 'done';
  const key = betting ? st.phase : 'play';
  if (betting) {
    if (view.ctlKey !== key) {
      view.ctlKey = key;
      const panel = betPanel({
        get: () => bet,
        set: (v) => { bet = v; },
        wallet: ctxRef.wallet,
        act: 'deal',
        verb: st.phase === 'done' ? 'Раздать снова' : 'Раздать',
        toWin: (b) => ({ value: b * 2, upTo: false }),
        caption: (b) => `вместе со ставкой · блэкджек — ${fmt(b * 2.5)}`,
      });
      c.replaceChildren(panel.el);
    }
    return;
  }
  view.ctlKey = key;
  const playing = st.phase === 'play' && st.player.length >= 2 && st.dealer.length >= 2;
  const canDouble = playing && st.player.length === 2 && ctxRef.wallet.balance >= st.bet;
  const off = playing ? '' : 'disabled';
  let hitSub = 'ещё карту';
  if (playing) {
    const b = bustChance();
    hitSub = b === 0 ? 'без риска перебора' : `перебор ${b}%`;
  }
  const up = st.dealer[0]?.rank;
  const standSub = up ? `у дилера перебор ${DEALER_BUST[up]}%` : 'остановиться';
  c.innerHTML = `
    <div class="outcomes">
      <button type="button" class="outcome yes press" data-act="hit" ${off}><span>Ещё</span><small>${hitSub}</small></button>
      <button type="button" class="outcome no press" data-act="stand" ${off}><span>Хватит</span><small>${standSub}</small></button>
    </div>
    <button type="button" class="btn-glass press" data-act="double" ${canDouble ? '' : 'disabled'}>Удвоить · +${fmt(st.bet)}</button>`;
}

let busy = false;

async function onControl(e) {
  const btn = e.target.closest('[data-act]');
  const act = btn?.dataset.act;
  if (!act || busy || btn.disabled) return;
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
  st = { phase: 'dealer', player: [], dealer: [], bet, holeOpen: false, msg: { text: 'Раздаём…', tone: 'busy' } };
  render();
  for (const who of ['player', 'dealer', 'player', 'dealer']) {
    st[who].push(draw());
    render();
    haptic('light');
    await sleep(260);
  }
  if (isBlackjack(st.player) || isBlackjack(st.dealer)) return finish();
  st.phase = 'play';
  st.msg = { text: 'Ещё карту или хватит?' };
  render();
}

async function hit() {
  st.player.push(draw());
  haptic('light');
  if (isBust(st.player)) return finish();
  if (handValue(st.player).total === 21) {
    st.phase = 'dealer';
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
  st.phase = 'dealer';
  haptic('medium');
  render();
  await sleep(350);
  if (isBust(st.player)) return finish();
  return stand();
}

async function stand() {
  st.phase = 'dealer';
  st.holeOpen = true;
  st.msg = { text: 'Ход дилера…', tone: 'busy' };
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
  ctxRef.record?.(payout - st.bet);
  const profit = payout - st.bet;
  const p = handValue(st.player).total;
  const d = handValue(st.dealer).total;
  if (result === 'blackjack') st.msg = { text: 'Блэкджек · 3:2', tone: 'big', amount: profit };
  else if (result === 'win') st.msg = { text: isBust(st.dealer) ? 'У дилера перебор' : `Победа · ${p} против ${d}`, tone: 'won', amount: st.bet };
  else if (result === 'push') st.msg = { text: 'Ничья — ставка вернулась', tone: 'push', amount: 0 };
  else if (result === 'lose') st.msg = { text: isBlackjack(st.dealer) ? 'У дилера блэкджек' : `Дилер выиграл · ${p} против ${d}`, tone: 'lost', amount: -st.bet };
  else st.msg = { text: `Перебор · ${p}`, tone: 'lost', amount: -st.bet };
  st.phase = 'done';
  haptic(profit > 0 ? 'success' : profit < 0 ? 'error' : 'warning');
  ctxRef.wallet.render({ bump: profit > 0 });
  render();
}

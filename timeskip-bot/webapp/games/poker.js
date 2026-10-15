// Видеопокер «Jacks or Better»: раздали 5 карт, отметь, какие оставить, замена и выплата.

import { ICON } from '../icons.js';
import { newDeck } from '../lib/cards.js';
import { PAYTABLE, evaluate } from '../lib/poker.js';
import { betPanel, cardEl, fmt, haptic, plural, setFace, setMsg, sleep } from '../ui.js';

export const title = 'Покер';

// Шансы итоговой комбинации при лучшей игре (9/6 Jacks or Better), в порядке PAYTABLE.
const CHANCE = ['0,0025%', '0,011%', '0,24%', '1,15%', '1,10%', '1,12%', '7,45%', '12,9%', '21,5%'];

let bet = 10;
let deck = newDeck();
// phase: 'bet' — до раздачи, 'hold' — выбираем карты, 'done' — итог
let st = { phase: 'bet', hand: deck.slice(0, 5), held: [false, false, false, false, false], bet: 0, win: null, msg: { text: 'Раздай карты и оставь лучшие' } };
let view = null;
let ctxRef = null;
let busy = '';

function rulesHtml() {
  const rows = PAYTABLE.map((p, i) => `<tr><td>${p.name}</td><td>${CHANCE[i]}</td><td>×${p.mult}</td></tr>`).join('');
  return `
    <details class="rules">
      <summary>Шансы комбинаций ${ICON.down}</summary>
      <div class="rules-body">
        <table class="rules-table">
          <thead><tr><th>Комбинация</th><th>Шанс</th><th>Выплата</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <p class="rules-foot">Одна замена. Шансы — при лучшей игре, возврат 99,5%.</p>
      </div>
    </details>`;
}

export function mount(root, ctx) {
  ctxRef = ctx;
  root.innerHTML = `
    <section class="pays" id="pays"></section>
    <section class="stage"><div class="poker-hand" id="hand"></div></section>
    <section class="trade"><p class="msg" id="msg" aria-live="polite"></p><div id="controls" class="controls"></div></section>
    ${rulesHtml()}`;
  view = {
    pays: root.querySelector('#pays'),
    hand: root.querySelector('#hand'),
    msg: root.querySelector('#msg'),
    controls: root.querySelector('#controls'),
    ctlKey: null,
    panel: null,
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

function renderPays() {
  if (!view) return;
  const shownBet = st.phase === 'bet' ? bet : st.bet;
  const now = st.phase === 'hold' ? evaluate(st.hand) : null;
  const hit = st.phase === 'done' && !busy ? st.win : null;
  view.pays.innerHTML = `
    <div class="pays-head"><b>Выплаты</b><span>при ставке ${fmt(shownBet)}</span></div>
    <div class="pays-grid">
      ${PAYTABLE.map((p) => `<div class="pay-row${now?.key === p.key ? ' now' : ''}${hit?.key === p.key ? ' hit' : ''}"><span>${p.name}</span><b>${fmt(p.mult * shownBet)}</b></div>`).join('')}
    </div>`;
}

function drawLabel() {
  const n = st.held.filter((h) => !h).length;
  if (n === 0) return 'Оставить все';
  if (n === 5) return 'Заменить все';
  return `Заменить ${n} ${plural(n, 'карту', 'карты', 'карт')}`;
}

function render() {
  if (!view) return;
  renderPays();
  [...view.hand.children].forEach((slot, i) => {
    slot.classList.toggle('held', st.held[i]);
    slot.disabled = st.phase !== 'hold' || !!busy;
  });
  setMsg(view.msg, st.msg);

  const c = view.controls;
  const key = st.phase;
  if (view.ctlKey !== key) {
    view.ctlKey = key;
    view.panel = null;
    if (key === 'hold') {
      c.innerHTML = '<button type="button" class="btn-primary press" data-act="draw"></button>';
    } else {
      view.panel = betPanel({
        get: () => bet,
        set: (v) => { bet = v; renderPays(); },
        wallet: ctxRef.wallet,
        act: 'deal',
        verb: st.phase === 'done' ? 'Раздать снова' : 'Раздать',
        toWin: (b) => ({ value: b * 800, upTo: true }),
        caption: () => 'вместе со ставкой · пара валетов вернёт ставку',
      });
      c.replaceChildren(view.panel.el);
    }
  }
  const btn = c.querySelector('.btn-primary');
  if (busy) {
    btn.setAttribute('aria-busy', 'true');
    btn.disabled = true;
    btn.textContent = busy;
    view.panel?.disable(true);
  } else {
    btn.removeAttribute('aria-busy');
    btn.disabled = false;
    if (view.panel) {
      view.panel.disable(false);
      view.panel.update();
    } else {
      btn.textContent = drawLabel();
    }
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
  try {
    if (act === 'deal') await deal();
    else if (act === 'draw') await drawCards();
  } finally {
    busy = '';
    render();
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
  busy = 'Раздаём…';
  haptic('medium');
  deck = newDeck();
  st = { phase: 'hold', hand: deck.splice(0, 5), held: [false, false, false, false, false], bet, win: null, msg: { text: 'Раздаём…', tone: 'busy' } };
  render();
  await flip([0, 1, 2, 3, 4]);
  const now = evaluate(st.hand);
  st.msg = now ? { text: `Уже есть: ${now.name} — отметь, что оставить` } : { text: 'Нажми на карты, которые оставить' };
}

async function drawCards() {
  busy = 'Меняем…';
  const idx = [0, 1, 2, 3, 4].filter((i) => !st.held[i]);
  for (const i of idx) st.hand[i] = deck.pop();
  st.phase = 'done';
  st.win = evaluate(st.hand);
  const payout = st.win ? st.win.mult * st.bet : 0;
  ctxRef.wallet.give(payout);
  ctxRef.record?.(payout - st.bet);
  st.msg = { text: 'Меняем…', tone: 'busy' };
  render();
  await flip(idx);
  if (!st.win) st.msg = { text: 'Ничего не собралось', tone: 'lost', amount: -st.bet };
  else if (st.win.mult === 1) st.msg = { text: 'Пара от валетов — ставка вернулась', tone: 'push', amount: 0 };
  else st.msg = { text: `${st.win.name} · ×${st.win.mult}`, tone: st.win.mult >= 25 ? 'big' : 'won', amount: payout - st.bet };
  haptic(payout > st.bet ? 'success' : payout ? 'warning' : 'error');
  ctxRef.wallet.render({ bump: payout > st.bet });
}

// TimeSkip — мини-игры, чтобы убить время. Главная («рынки»), переходы между играми, лист «Взять фишки».

import * as blackjack from './games/blackjack.js';
import * as poker from './games/poker.js';
import * as roulette from './games/roulette.js';
import * as slots from './games/slots.js';
import { CHIP, ICON, LOGO, THUMB } from './icons.js';
import { MARKETS, ORDER } from './markets.js';
import { fmt, gauge, haptic, pct, plural, signed, toast, tg } from './ui.js';
import { MIN_BET, REFILL, createWallet } from './wallet.js';

const GAMES = { slots, blackjack, roulette, poker };

// Экран всегда открывается сверху (иначе после перезагрузки браузер возвращает старую прокрутку).
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

const screen = document.getElementById('screen');
const titleEl = document.getElementById('title');
const metaEl = document.getElementById('title-meta');
const iconEl = document.getElementById('title-icon');
const backEl = document.getElementById('back');
const getEl = document.getElementById('get');
const wallet = createWallet();

let cleanup = null;
let current = 'home';
let tab = 'all';

/** Не хватило на ставку: если фишек почти нет — предложить взять ещё. */
function noChips() {
  haptic('error');
  if (wallet.balance < MIN_BET) refillSheet();
  else toast('Не хватает фишек на такую ставку', 'error');
}

function refillSheet() {
  if (document.querySelector('.sheet')) return;
  const sheet = document.createElement('div');
  sheet.className = 'sheet';
  sheet.innerHTML = `
    <div class="sheet-card" role="dialog" aria-modal="true" aria-labelledby="sheet-title">
      <div class="grabber" aria-hidden="true"></div>
      <div class="sheet-icon">${CHIP}</div>
      <h2 id="sheet-title">Фишки закончились</h2>
      <p>Фишки игровые и бесплатные: их нельзя купить, продать или вывести. Бери ещё и продолжай.</p>
      <dl class="receipt">
        <div><dt>Начислим</dt><dd class="pos">+${fmt(REFILL)}</dd></div>
        <div><dt>Стоимость</dt><dd>Бесплатно</dd></div>
      </dl>
      <button type="button" class="btn-primary press" data-act="take">Взять ${fmt(REFILL)}</button>
      <button type="button" class="btn-ghost press" data-act="close">Не сейчас</button>
    </div>`;
  sheet.addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act ?? (e.target === sheet ? 'close' : null);
    if (act === 'take' && wallet.balance < MIN_BET) {
      wallet.give(REFILL);
      wallet.render({ bump: true });
      haptic('success');
      if (current === 'home') show('home');
    }
    if (act) {
      sheet.classList.add('closing');
      setTimeout(() => sheet.remove(), 200);
    }
  });
  document.body.append(sheet);
}

// Итог сессии: чистый результат каждого раунда (пополнения — не раунды). Только в памяти.
const rounds = [];
const ctx = { wallet, noChips, record: (net) => { rounds.push(net); } };

// --- Главная ---

const TABS = [
  { id: 'all', name: 'Все' },
  { id: 'cards', name: 'Карты' },
  { id: 'luck', name: 'Удача' },
  { id: 'best', name: 'Лучший возврат' },
];

function listFor(id) {
  if (id === 'cards' || id === 'luck') return ORDER.filter((g) => MARKETS[g].cat === id);
  if (id === 'best') return [...ORDER].sort((a, b) => MARKETS[b].rtp - MARKETS[a].rtp);
  return ORDER;
}

function marketCard(id) {
  const m = MARKETS[id];
  return `
    <button type="button" class="market press" data-game="${id}">
      <span class="m-head">
        <span class="thumb">${THUMB[id]}</span>
        <span class="m-title"><span class="m-name">${m.name}</span><span class="m-q">${m.q}</span></span>
        ${gauge(m.chance)}
      </span>
      <span class="m-rows">
        ${m.rows.map(([label, chance, pay]) => `<span class="m-row"><span>${label}</span><b>${pct(chance)}</b><i>${pay}</i></span>`).join('')}
      </span>
      <span class="m-foot"><span>${m.foot}</span><span class="m-cta">Играть ${ICON.next}</span></span>
    </button>`;
}

/** Спарклайн накопленного результата за последние 40 раундов. */
function sparkline() {
  const pts = [0];
  for (const n of rounds.slice(-40)) pts.push(pts.at(-1) + n);
  const lo = Math.min(0, ...pts);
  const hi = Math.max(0, ...pts);
  const x = (i) => (2 + (i * 108) / (pts.length - 1)).toFixed(1);
  const y = (v) => (hi === lo ? 18 : 34 - ((v - lo) / (hi - lo)) * 32).toFixed(1);
  const last = pts.at(-1);
  const color = last > 0 ? 'var(--green)' : last < 0 ? 'var(--red)' : 'var(--text-3)';
  const line = pts.map((v, i) => `${x(i)},${y(v)}`).join(' ');
  const area = `${x(0)},${y(0)} ${line} ${x(pts.length - 1)},${y(0)}`;
  return `
    <svg class="spark" viewBox="0 0 112 36" width="112" height="36" aria-hidden="true" style="color:${color}">
      <line x1="2" x2="110" y1="${y(0)}" y2="${y(0)}" stroke="var(--line-2)" stroke-width="1" stroke-dasharray="2 3" vector-effect="non-scaling-stroke"/>
      <polygon points="${area}" fill="currentColor" opacity=".12"/>
      <polyline points="${line}" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
      <circle cx="${x(pts.length - 1)}" cy="${y(last)}" r="2.5" fill="currentColor"/>
    </svg>`;
}

function sessionStrip() {
  if (!rounds.length) return '';
  const total = rounds.reduce((a, b) => a + b, 0);
  const n = rounds.length;
  return `
    <section class="pnl" aria-label="Итог сессии">
      <div>
        <span class="pnl-label">За сессию</span>
        <span class="pnl-line"><b class="strip-val ${total > 0 ? 'pos' : total < 0 ? 'neg' : ''}">${signed(total)}</b> · ${n} ${plural(n, 'раунд', 'раунда', 'раундов')}</span>
      </div>
      ${n > 1 ? sparkline() : ''}
    </section>`;
}

function renderHome() {
  const broke = wallet.balance < MIN_BET;
  screen.innerHTML = `
    ${broke ? `
    <button type="button" class="refill press" data-act="refill">
      <span class="refill-icon">${CHIP}</span>
      <span class="refill-text"><b>Фишки закончились</b><span>Возьми ${fmt(REFILL)} бесплатно и играй дальше</span></span>
      ${ICON.next}
    </button>` : ''}
    ${sessionStrip()}
    <div class="tabs" role="tablist" aria-label="Игры">
      ${TABS.map((t) => `<button type="button" role="tab" class="tab" data-tab="${t.id}" aria-selected="${t.id === tab}">${t.name}</button>`).join('')}
    </div>
    <div class="markets">${listFor(tab).map(marketCard).join('')}</div>
    <p class="note">${ICON.info}<span>Фишки игровые: их нельзя купить, продать или вывести. Играем просто так.</span></p>`;
}

screen.addEventListener('click', (e) => {
  if (current !== 'home') return;
  const tile = e.target.closest('[data-game]');
  const tabEl = e.target.closest('[role="tab"]');
  if (tile) {
    haptic('light');
    show(tile.dataset.game);
  } else if (tabEl) {
    if (tabEl.dataset.tab === tab) return;
    tab = tabEl.dataset.tab;
    haptic('select');
    renderHome();
  } else if (e.target.closest('[data-act="refill"]')) {
    haptic('light');
    refillSheet();
  }
});

getEl.addEventListener('click', () => {
  haptic('light');
  refillSheet();
});

// --- Навигация ---

function show(name) {
  cleanup?.();
  cleanup = null;
  current = name;
  const home = name === 'home';
  screen.className = `screen screen-${name}`;
  screen.replaceChildren();
  if (home) {
    renderHome();
    iconEl.innerHTML = LOGO;
    titleEl.textContent = 'TimeSkip';
    metaEl.hidden = true;
  } else {
    cleanup = GAMES[name].mount(screen, ctx) ?? null;
    iconEl.innerHTML = THUMB[name];
    titleEl.textContent = GAMES[name].title;
    metaEl.textContent = MARKETS[name].meta;
    metaEl.hidden = false;
  }
  document.body.classList.toggle('in-game', !home);
  // В Телеграме «Назад» — только родная кнопка в шапке клиента.
  backEl.hidden = home || !!tg?.isVersionAtLeast?.('6.1');
  if (tg?.isVersionAtLeast?.('6.1')) tg.BackButton[home ? 'hide' : 'show']();
  if (tg?.isVersionAtLeast?.('7.10')) {
    try {
      tg.setBottomBarColor(name === 'roulette' ? '#1A2533' : '#111A24');
    } catch {
      // старый клиент
    }
  }
  wallet.render();
  window.scrollTo(0, 0);
}

function goHome() {
  haptic('light');
  show('home');
}
backEl.addEventListener('click', goHome);
tg?.BackButton?.onClick(goHome);

// --- Telegram ---

if (tg) {
  tg.ready();
  tg.expand();
  const color = '#111A24';
  try {
    if (tg.isVersionAtLeast('6.1')) {
      tg.setHeaderColor(tg.isVersionAtLeast('6.9') ? color : 'bg_color');
      tg.setBackgroundColor(color);
    }
    if (tg.isVersionAtLeast('7.10')) tg.setBottomBarColor(color);
    // Свайп вниз по рулетке или слотам не должен закрывать приложение.
    if (tg.isVersionAtLeast('7.7')) tg.disableVerticalSwipes();
  } catch {
    // старый клиент
  }
}

show('home');
wallet.load().then(() => {
  wallet.render();
  if (current === 'home') show('home');
});

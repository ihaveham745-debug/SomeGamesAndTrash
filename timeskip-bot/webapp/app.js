// TimeSkip — мини-игры, чтобы убить время. Экран «Игры» и переходы между играми.

import * as blackjack from './games/blackjack.js';
import * as blocks from './games/blocks.js';
import * as chess from './games/chess.js';
import * as poker from './games/poker.js';
import * as roulette from './games/roulette.js';
import * as slots from './games/slots.js';
import { fmt, haptic, toast, tg } from './ui.js';
import { REFILL, createWallet } from './wallet.js';

const GAMES = { slots, blackjack, roulette, poker, blocks, chess };
const MIN_BET = 10;

const screen = document.getElementById('screen');
const titleEl = document.getElementById('title');
const backEl = document.getElementById('back');
const wallet = createWallet();

let cleanup = null;
let current = 'home';

/** Не хватило на ставку: если фишек почти нет — предложить взять ещё. */
function noChips() {
  haptic('error');
  if (wallet.balance < MIN_BET) refillSheet();
  else toast('Не хватает фишек на такую ставку');
}

function refillSheet() {
  if (document.querySelector('.sheet')) return;
  const sheet = document.createElement('div');
  sheet.className = 'sheet';
  sheet.innerHTML = `
    <div class="sheet-card" role="dialog" aria-modal="true" aria-labelledby="sheet-title">
      <div class="sheet-coin" aria-hidden="true"></div>
      <h2 id="sheet-title">Фишки закончились</h2>
      <p>Фишки тут игровые и бесплатные — бери ещё и продолжай.</p>
      <button type="button" class="btn-primary press" data-act="take">Взять ${fmt(REFILL)}</button>
      <button type="button" class="btn-ghost press" data-act="close">Не сейчас</button>
    </div>`;
  sheet.addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act ?? (e.target === sheet ? 'close' : null);
    if (act === 'take') {
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

const ctx = { wallet, noChips };

const TILES = [
  { id: 'slots', name: 'Слоты', sub: 'Три в ряд — до ×500', art: '<div class="art-reels"><span>7</span><span>7</span><span>7</span></div>' },
  { id: 'blackjack', name: 'Блэкджек', sub: 'Набери 21, но не больше', art: '<div class="art-cards"><i>A<b>♠</b></i><i class="r">K<b>♥</b></i></div>' },
  { id: 'roulette', name: 'Рулетка', sub: 'Красное или чёрное', art: '<div class="art-wheel"></div>' },
  { id: 'poker', name: 'Покер', sub: 'Видеопокер, валеты и выше', art: '<div class="art-suits"><b>♠</b><b class="r">♥</b><b class="r">♦</b><b>♣</b></div>' },
  { id: 'blocks', name: 'Блоки', sub: 'Как Block Blast: линии на рекорд', art: '<div class="art-blocks">' + 'c3,c3,,c6,c3,c3,c6,c6,c1,,c6,c4,c1,c1,c1,c4'.split(',').map((c) => `<i class="${c}"></i>`).join('') + '</div>' },
  { id: 'chess', name: 'Шахматы', sub: 'С ботом, вдвоём или с другом онлайн', art: '<div class="art-chess"><span>♞\uFE0E</span></div>' },
];

function renderHome() {
  screen.innerHTML = `
    <section class="hero">
      <h2>Убей время</h2>
      <p>Шесть игр, чтобы скоротать время. Выбирай.</p>
    </section>
    ${wallet.balance < MIN_BET ? `<button type="button" class="refill press" data-act="refill"><span class="coin"></span>Фишки закончились — взять ещё ${fmt(REFILL)}</button>` : ''}
    <div class="tiles">
      ${TILES.map((t) => `
        <button type="button" class="tile tile-${t.id} press" data-game="${t.id}">
          <div class="tile-art" aria-hidden="true">${t.art}</div>
          <div class="tile-caption"><b>${t.name}</b><span>${t.sub}</span></div>
        </button>`).join('')}
    </div>
    <p class="note">Фишки ненастоящие: их нельзя купить, продать или вывести. Играем просто так.</p>`;
}

screen.addEventListener('click', (e) => {
  if (current !== 'home') return;
  const tile = e.target.closest('[data-game]');
  if (tile) {
    haptic('light');
    show(tile.dataset.game);
  } else if (e.target.closest('[data-act="refill"]')) {
    refillSheet();
  }
});

function show(name, params = null) {
  cleanup?.();
  cleanup = null;
  current = name;
  screen.className = `screen screen-${name}`;
  screen.replaceChildren();
  if (name === 'home') {
    renderHome();
    titleEl.textContent = 'TimeSkip';
  } else {
    cleanup = GAMES[name].mount(screen, { ...ctx, params }) ?? null;
    titleEl.textContent = GAMES[name].title;
  }
  const home = name === 'home';
  backEl.hidden = home;
  if (tg?.isVersionAtLeast?.('6.1')) tg.BackButton[home ? 'hide' : 'show']();
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
  const color = '#04050a';
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

// Приглашение в шахматы: бот открывает приложение с ?chess=<код>.
const chessCode = new URLSearchParams(location.search).get('chess')
  ?? /^chess_([a-z0-9]+)$/i.exec(tg?.initDataUnsafe?.start_param ?? '')?.[1];
if (chessCode) show('chess', { chess: chessCode.toLowerCase() });
else show('home');
wallet.load().then(() => {
  wallet.render();
  if (current === 'home') show('home');
});

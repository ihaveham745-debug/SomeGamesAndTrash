// TimeSkip — мини-игры, чтобы убить время. Экран «Игры» и переходы между играми.

import * as blackjack from './games/blackjack.js';
import * as blocks from './games/blocks.js';
import * as chess from './games/chess.js';
import * as poker from './games/poker.js';
import * as roulette from './games/roulette.js';
import * as slots from './games/slots.js';
import { lang, setLang, t } from './i18n.js';
import { fmt, haptic, jojo, toast, tg } from './ui.js';
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
  if (wallet.balance < MIN_BET) {
    jojo('tbc');
    setTimeout(refillSheet, 1600);
    return;
  }
  toast(t('Не хватает фишек на такую ставку', 'Not enough chips for that bet'));
}

function refillSheet() {
  if (document.querySelector('.sheet')) return;
  const sheet = document.createElement('div');
  sheet.className = 'sheet';
  sheet.innerHTML = `
    <div class="sheet-card" role="dialog" aria-modal="true" aria-labelledby="sheet-title">
      <div class="sheet-coin" aria-hidden="true"></div>
      <h2 id="sheet-title">${t('Фишки закончились', 'Out of chips')}</h2>
      <p>${t('Фишки тут игровые и бесплатные — бери ещё и продолжай.', 'Chips here are free play money — grab more and keep going.')}</p>
      <button type="button" class="btn-primary press" data-act="take">${t('Взять', 'Take')} ${fmt(REFILL)}</button>
      <button type="button" class="btn-ghost press" data-act="close">${t('Не сейчас', 'Not now')}</button>
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

const TILES = () => [
  { id: 'slots', name: t('Слоты', 'Slots'), sub: t('Три в ряд — до ×500', 'Three in a row — up to ×500'), art: '<div class="art-reels"><span>7</span><span>7</span><span>7</span></div>' },
  { id: 'blackjack', name: t('Блэкджек', 'Blackjack'), sub: t('Набери 21, но не больше', 'Get to 21, not over'), art: '<div class="art-cards"><i>A<b>♠</b></i><i class="r">K<b>♥</b></i></div>' },
  { id: 'roulette', name: t('Рулетка', 'Roulette'), sub: t('Красное или чёрное', 'Red or black'), art: '<div class="art-wheel"></div>' },
  { id: 'poker', name: t('Покер', 'Poker'), sub: t('Видеопокер, валеты и выше', 'Video poker, Jacks or Better'), art: '<div class="art-suits"><b>♠</b><b class="r">♥</b><b class="r">♦</b><b>♣</b></div>' },
  { id: 'blocks', name: t('Блоки', 'Blocks'), sub: t('Как Block Blast: линии на рекорд', 'Like Block Blast: clear lines, beat your best'), art: '<div class="art-blocks">' + 'c3,c3,,c6,c3,c3,c6,c6,c1,,c6,c4,c1,c1,c1,c4'.split(',').map((c) => `<i class="${c}"></i>`).join('') + '</div>' },
  { id: 'chess', name: t('Шахматы', 'Chess'), sub: t('С ботом, вдвоём или с другом онлайн', 'Vs bot, pass-and-play or online with a friend'), art: '<div class="art-chess"><span>♞\uFE0E</span></div>' },
];

function renderHome() {
  screen.innerHTML = `
    <section class="hero">
      <div class="lang-switch" role="radiogroup" aria-label="${t('Язык', 'Language')}">
        <button type="button" class="press" role="radio" aria-checked="${lang === 'ru'}" data-lang="ru">RU</button>
        <button type="button" class="press" role="radio" aria-checked="${lang === 'en'}" data-lang="en">EN</button>
      </div>
      <h2>${t('Убей время', 'Kill some time')}</h2>
      <p>${t('Шесть игр, чтобы скоротать время. Выбирай.', 'Six games to pass the time. Pick one.')}</p>
    </section>
    ${wallet.balance < MIN_BET ? `<button type="button" class="refill press" data-act="refill"><span class="coin"></span>${t('Фишки закончились — взять ещё', 'Out of chips — take')} ${fmt(REFILL)}</button>` : ''}
    <div class="tiles">
      ${TILES().map((g) => `
        <button type="button" class="tile tile-${g.id} press" data-game="${g.id}">
          <div class="tile-art" aria-hidden="true">${g.art}</div>
          <div class="tile-caption"><b>${g.name}</b><span>${g.sub}</span></div>
        </button>`).join('')}
    </div>
    <p class="note">${t('Фишки ненастоящие: их нельзя купить, продать или вывести. Играем просто так.', 'Chips are not real: they can’t be bought, sold or cashed out. Just for fun.')}</p>`;
}

screen.addEventListener('click', (e) => {
  if (current !== 'home') return;
  const langBtn = e.target.closest('[data-lang]');
  if (langBtn) {
    setLang(langBtn.dataset.lang);
    applyStaticText();
    haptic('select');
    show('home');
    return;
  }
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
    titleEl.textContent = typeof GAMES[name].title === 'function' ? GAMES[name].title() : GAMES[name].title;
  }
  const home = name === 'home';
  backEl.hidden = home;
  if (tg?.isVersionAtLeast?.('6.1')) tg.BackButton[home ? 'hide' : 'show']();
  wallet.render();
  window.scrollTo(0, 0);
}

/** Тексты из index.html (подписи кнопок шапки). */
function applyStaticText() {
  backEl.setAttribute('aria-label', t('Назад', 'Back'));
  document.getElementById('balance').setAttribute('aria-label', t('Фишки', 'Chips'));
}
applyStaticText();

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
  const color = '#0d0418';
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

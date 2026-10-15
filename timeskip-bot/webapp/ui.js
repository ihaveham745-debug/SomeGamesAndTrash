// Общие мелочи интерфейса: формат чисел, вибро, всплывашки, баннер итога, шкала шанса,
// выбор ставки, панель ставки, карты.

import { ICON, LOGO_MARK, SUIT } from './icons.js';
import { isRed } from './lib/cards.js';

export const tg = window.Telegram?.WebApp;

export const fmt = (n) => Math.round(n).toLocaleString('ru-RU');
export const short = (n) => (n >= 1000 ? `${+(n / 1000).toFixed(1)}k` : String(n));
export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

/** +120 / −40 / ±0 (минус — настоящий, U+2212). */
export const signed = (n) => {
  const r = Math.round(n);
  return r > 0 ? `+${fmt(r)}` : r < 0 ? `−${fmt(-r)}` : '±0';
};
export const pct = (x) => (x < 1 ? '<1%' : `${x.toLocaleString('ru-RU', { maximumFractionDigits: 1 })}%`);
export const plural = (n, one, few, many) => {
  const a = n % 10;
  const b = n % 100;
  return a === 1 && b !== 11 ? one : a >= 2 && a <= 4 && (b < 12 || b > 14) ? few : many;
};

export function haptic(kind = 'light') {
  const h = tg?.HapticFeedback;
  if (!h || !tg.isVersionAtLeast?.('6.1')) return;
  try {
    if (kind === 'success' || kind === 'error' || kind === 'warning') h.notificationOccurred(kind);
    else if (kind === 'select') h.selectionChanged();
    else h.impactOccurred(kind);
  } catch {
    // старый клиент — без вибро
  }
}

/** Плавно досчитать число в el до to (ease-out, rAF). */
export function countUp(el, to, { from = 0, ms = 400, format = signed } = {}) {
  cancelAnimationFrame(el._raf);
  if (reduced || from === to) {
    el.textContent = format(to);
    return;
  }
  const t0 = performance.now();
  const step = (t) => {
    const k = Math.min(1, (t - t0) / ms);
    el.textContent = format(from + (to - from) * (1 - (1 - k) ** 3));
    if (k < 1) el._raf = requestAnimationFrame(step);
  };
  el._raf = requestAnimationFrame(step);
}

let toastTimer;
/** Всплывашка сверху. tone: 'info' | 'error'. */
export function toast(text, tone = 'info') {
  const el = document.getElementById('toast');
  const error = tone === 'error';
  el.innerHTML = `${error ? ICON.alert : ICON.info}<span></span>`;
  el.querySelector('span').textContent = text;
  el.classList.toggle('error', error);
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

/**
 * Баннер итога/подсказки. tone: '' | 'busy' | 'won' | 'big' | 'lost' | 'push'.
 * amount — чистое изменение баланса со знаком (или null — без суммы).
 */
export function setMsg(el, { text = '', html = '', tone = '', amount = null } = {}) {
  const key = `${tone}|${text}|${html}|${amount}`;
  if (el._key === key) return; // игры часто перерисовываются — не перезапускаем анимации
  el._key = key;
  el.className = `msg${tone ? ` ${tone}` : ''}${amount !== null ? ' has-amt' : ''}`;
  el.replaceChildren();
  if (tone === 'busy') el.insertAdjacentHTML('beforeend', '<i class="spinner" aria-hidden="true"></i>');
  const label = document.createElement('span');
  label.className = 'msg-label';
  if (html) label.innerHTML = html; // только наша собственная разметка
  else label.textContent = text;
  el.append(label);
  if (amount !== null) {
    const b = document.createElement('b');
    b.className = 'msg-amt';
    el.append(b);
    if (tone === 'won' || tone === 'big') countUp(b, amount);
    else b.textContent = signed(amount);
  }
  el.classList.remove('in');
  void el.offsetWidth;
  el.classList.add('in');
}

/** Полукруглая шкала шанса, как у Polymarket. */
export function gauge(chance, size = 56) {
  const v = Math.round(chance);
  const c = v >= 45 ? 'var(--green)' : v >= 25 ? 'var(--amber)' : 'var(--red)';
  return `<span class="gauge" style="--c:${c};width:${size}px" role="img" aria-label="Шанс ${v}%"><svg viewBox="0 0 56 34" aria-hidden="true"><path class="g-track" d="M5 30a23 23 0 0 1 46 0" pathLength="100"/><path class="g-val" d="M5 30a23 23 0 0 1 46 0" pathLength="100" stroke-dasharray="${v} 100"/><text x="28" y="30">${v}%</text></svg><small>шанс</small></span>`;
}

export const CHIP_VALUES = [10, 25, 100, 500];

/**
 * Ряд «пилюль» для выбора ставки. get/set — текущее значение;
 * суммы дороже баланса гаснут (update() пересчитывает).
 */
export function chipPicker({ get, set, wallet, values = CHIP_VALUES, label = 'Ставка' }) {
  const row = document.createElement('div');
  row.className = 'chips';
  row.setAttribute('role', 'radiogroup');
  row.setAttribute('aria-label', label);
  row.innerHTML = values.map((v) => `<button type="button" class="chip press" role="radio" data-v="${v}"><span>${short(v)}</span></button>`).join('');
  const update = () => {
    for (const b of row.children) {
      const v = Number(b.dataset.v);
      b.setAttribute('aria-checked', String(v === get()));
      b.classList.toggle('poor', v > wallet.balance);
    }
  };
  row.addEventListener('click', (e) => {
    const b = e.target.closest('.chip');
    if (!b || b.disabled) return;
    set(Number(b.dataset.v));
    haptic('select');
    update();
  });
  update();
  const onWallet = () => (row.isConnected ? update() : window.removeEventListener('wallet', onWallet));
  window.addEventListener('wallet', onWallet);
  return { el: row, update, disable: (off) => row.querySelectorAll('.chip').forEach((b) => { b.disabled = off; }) };
}

/**
 * Панель ставки: сумма, пилюли, «Можно выиграть», большая синяя кнопка.
 * toWin(bet) возвращает { value, upTo }; caption(bet) — строка под суммой выигрыша.
 */
export function betPanel({ get, set, wallet, verb, act = '', id = '', toWin, caption }) {
  const el = document.createElement('div');
  el.className = 'bet';
  el.innerHTML = `
    <div class="amount"><span class="amount-l"><b>Ставка</b><small></small></span><b class="amount-v"></b></div>
    <div class="towin"><span>Можно выиграть</span><b></b></div>
    <p class="towin-cap"></p>
    <button type="button" class="btn-primary press"${id ? ` id="${id}"` : ''}${act ? ` data-act="${act}"` : ''}></button>`;
  const picker = chipPicker({ get, set: (v) => { set(v); update(); }, wallet });
  el.querySelector('.amount').after(picker.el);
  const button = el.querySelector('.btn-primary');
  function update() {
    const bet = get();
    const lack = bet > wallet.balance;
    const w = toWin(bet);
    el.querySelector('.amount').classList.toggle('short', lack);
    el.querySelector('.amount-l small').textContent = lack ? `Не хватает · баланс ${fmt(wallet.balance)}` : `Баланс ${fmt(wallet.balance)}`;
    el.querySelector('.amount-v').textContent = fmt(bet);
    el.querySelector('.towin b').textContent = `${w.upTo ? 'до ' : ''}${fmt(w.value)}`;
    el.querySelector('.towin-cap').textContent = caption(bet);
    if (!button.hasAttribute('aria-busy')) button.textContent = `${verb} · ${fmt(bet)}`;
    picker.update();
  }
  update();
  // Баланс поменялся (ставка, выигрыш, «Взять 1 000») — пересчитать подписи.
  const onWallet = () => (el.isConnected ? update() : window.removeEventListener('wallet', onWallet));
  window.addEventListener('wallet', onWallet);
  return {
    el,
    update,
    button,
    disable(off) {
      picker.disable(off);
      button.disabled = off;
    },
  };
}

/** Карта. down — рубашкой вверх; deal — с анимацией раздачи. */
export function cardEl(card, { down = false, deal = false, delay = 0 } = {}) {
  const el = document.createElement('div');
  el.className = `card${down ? ' down' : ''}${deal ? ' deal' : ''}`;
  if (delay) el.style.animationDelay = `${delay}ms`;
  el.innerHTML = `<div class="card-inner"><div class="face"></div><div class="card-back">${LOGO_MARK}</div></div>`;
  setFace(el, card);
  return el;
}

export function setFace(el, card) {
  el.classList.toggle('red', isRed(card));
  el.setAttribute('aria-label', `${card.rank}${card.suit}`);
  const s = SUIT[card.suit];
  const face = ['J', 'Q', 'K'].includes(card.rank);
  el.querySelector('.face').innerHTML =
    `<span class="c-idx"><b>${card.rank}</b><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${s}</svg></span>` +
    (face
      ? `<b class="c-face">${card.rank}</b>`
      : `<svg class="c-pip${card.rank === 'A' ? ' ace' : ''}" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${s}</svg>`);
}

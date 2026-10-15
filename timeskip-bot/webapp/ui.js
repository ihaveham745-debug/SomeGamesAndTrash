// Общие мелочи интерфейса: формат чисел, вибро, всплывашки, фишки ставок, карты.

import { isRed } from './lib/cards.js';

export const tg = window.Telegram?.WebApp;

export const fmt = (n) => Math.round(n).toLocaleString('ru-RU');
export const short = (n) => (n >= 1000 ? `${+(n / 1000).toFixed(1)}k` : String(n));
export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

let toastTimer;
export function toast(text) {
  const el = document.getElementById('toast');
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

export const CHIP_VALUES = [10, 25, 100, 500];

/**
 * Ряд фишек для выбора ставки. get/set — текущее значение;
 * фишки дороже баланса гаснут (update() пересчитывает).
 */
export function chipPicker({ get, set, wallet, values = CHIP_VALUES }) {
  const row = document.createElement('div');
  row.className = 'chips';
  row.setAttribute('role', 'radiogroup');
  row.innerHTML = values.map((v) => `<button type="button" class="chip chip-${v} press" role="radio" data-v="${v}"><span>${short(v)}</span></button>`).join('');
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
  return { el: row, update, disable: (off) => row.querySelectorAll('.chip').forEach((b) => { b.disabled = off; }) };
}

/** Карта. down — рубашкой вверх; deal — с анимацией раздачи. */
export function cardEl(card, { down = false, deal = false, delay = 0 } = {}) {
  const el = document.createElement('div');
  el.className = `card${down ? ' down' : ''}${deal ? ' deal' : ''}`;
  if (delay) el.style.animationDelay = `${delay}ms`;
  el.innerHTML = '<div class="card-inner"><div class="face"></div><div class="card-back"></div></div>';
  setFace(el, card);
  return el;
}

export function setFace(el, card) {
  el.classList.toggle('red', isRed(card));
  el.setAttribute('aria-label', `${card.rank}${card.suit}`);
  el.querySelector('.face').innerHTML = `<span class="c-corner"><b>${card.rank}</b>${card.suit}</span><span class="c-pip">${card.suit}</span>`;
}

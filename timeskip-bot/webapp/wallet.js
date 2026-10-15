// Кошелёк фишек. Фишки игровые: их нельзя купить или вывести.
// Храним в CloudStorage Телеграма (тот же баланс на всех устройствах) и в localStorage.

import { countUp, fmt, tg } from './ui.js';

const KEY = 'balance';
export const START = 1000;
export const REFILL = 1000;
export const MIN_BET = 10;

function readLocal() {
  try {
    const raw = localStorage.getItem(`timeskip.${KEY}`);
    const v = Number(raw);
    return raw !== null && Number.isFinite(v) && v >= 0 ? v : null;
  } catch {
    return null;
  }
}

const cloud = tg?.isVersionAtLeast?.('6.9') ? tg.CloudStorage : null;

export function createWallet() {
  let balance = readLocal() ?? START;
  let shown = balance;
  let dirty = false;
  let saveTimer;
  const valueEl = document.getElementById('balance-value');
  const pill = document.getElementById('balance');

  function save() {
    dirty = true;
    try {
      localStorage.setItem(`timeskip.${KEY}`, String(balance));
    } catch {
      // приватный режим — живём без сохранения
    }
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => cloud?.setItem(KEY, String(balance), () => {}), 600);
  }

  const wallet = {
    get balance() {
      return balance;
    },
    /** Снять ставку. false — не хватает. Баланс на экране меняется сразу. */
    take(n) {
      if (n > balance) return false;
      balance -= n;
      save();
      wallet.render();
      return true;
    },
    /** Начислить. На экране — только после render(), чтобы выигрыш не «спойлерил» анимацию. */
    give(n) {
      if (n <= 0) return;
      balance += n;
      save();
    },
    render({ bump = false } = {}) {
      valueEl.classList.remove('skel');
      document.documentElement.classList.toggle('broke', balance < MIN_BET);
      if (bump && balance > shown) {
        countUp(valueEl, balance, { from: shown, format: fmt });
        pill.classList.remove('bump');
        void pill.offsetWidth;
        pill.classList.add('bump');
      } else {
        cancelAnimationFrame(valueEl._raf);
        valueEl.textContent = fmt(balance);
      }
      shown = balance;
      window.dispatchEvent(new Event('wallet'));
    },
    /** Подтянуть баланс из облака (до первой ставки, чтобы не затереть её). */
    load() {
      return new Promise((resolve) => {
        if (!cloud) return resolve();
        const timer = setTimeout(resolve, 1500);
        cloud.getItem(KEY, (err, value) => {
          clearTimeout(timer);
          const v = Number(value);
          if (!err && value && Number.isFinite(v) && v >= 0 && !dirty) balance = v;
          resolve();
        });
      });
    },
  };
  return wallet;
}

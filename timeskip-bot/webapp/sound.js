// Короткие звуки на Web Audio — без файлов. Выключатель хранится в localStorage.

const KEY = 'timeskip.sound';
let ctx = null;
let enabled = true;
try {
  enabled = localStorage.getItem(KEY) !== 'off';
} catch {
  // без хранилища — звук включён
}

export const soundOn = () => enabled;

export function setSound(on) {
  enabled = on;
  try {
    localStorage.setItem(KEY, on ? 'on' : 'off');
  } catch {
    // ничего
  }
}

function audio() {
  if (!enabled) return null;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx ??= new AC();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

/** Нота: частота, начало (с), длительность, тип волны, громкость. */
function tone(freq, at = 0, dur = 0.12, type = 'sine', vol = 0.18, slide = 0) {
  const a = audio();
  if (!a) return;
  const t = a.currentTime + at;
  const osc = a.createOscillator();
  const gain = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slide) osc.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(vol, t + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(gain).connect(a.destination);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

const semis = (base, n) => base * 2 ** (n / 12);

export const sfx = {
  /** Звук браузер разрешает только после касания — «будим» его на первом же. */
  unlock: () => audio(),
  pick: () => tone(660, 0, 0.05, 'triangle', 0.08),
  place: () => {
    tone(196, 0, 0.09, 'triangle', 0.22, 0.6);
    tone(392, 0, 0.05, 'sine', 0.06);
  },
  miss: () => tone(160, 0, 0.12, 'sine', 0.1, 0.7),
  /** Чем длиннее серия, тем выше аккорд. */
  clear: (lines, combo) => {
    const base = semis(523.25, Math.min(combo - 1, 12) * 2);
    const steps = [0, 4, 7, 12, 16, 19].slice(0, 2 + Math.min(lines, 4));
    steps.forEach((s, i) => tone(semis(base, s), i * 0.055, 0.22, 'triangle', 0.14));
  },
  big: () => [0, 7, 12, 19, 24].forEach((s, i) => tone(semis(392, s), i * 0.07, 0.3, 'sine', 0.12)),
  over: () => [0, -3, -7, -12].forEach((s, i) => tone(semis(330, s), i * 0.16, 0.3, 'triangle', 0.13)),
};

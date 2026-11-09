// Mini App «Шпион» — игра с одного телефона: телефон передают по кругу, каждый смотрит свою роль.
// Правила и слова — те же модули, что у бота (tgcloud/lib/game.js, words.js; при сборке копируются в dist/lib/).

import { MIN_PLAYERS, MAX_PLAYERS, maxSpies, newLobby, startGame } from './lib/game.js';
import { ANY, CATEGORIES, CATEGORY_KEYS, categoryName } from './lib/words.js';

const tg = window.Telegram?.WebApp;
const inTelegram = Boolean(tg) && tg.platform !== 'unknown';
const app = document.getElementById('app');
const SETTINGS_KEY = 'spy.settings';

function load() {
  try {
    return { players: 5, spies: 1, category: ANY, hint: true, mode: 'word', minutes: 8, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') };
  } catch {
    return { players: 5, spies: 1, category: ANY, hint: true, mode: 'word', minutes: 8 };
  }
}

const settings = load();
let game = null; // состояние из lib/game.js
let turn = 0; // чья очередь смотреть роль
let shown = false;
let timer = null;

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const nameOf = (i) => `игрок ${i + 1}`;

function haptic(kind = 'light') {
  try {
    if (tg?.isVersionAtLeast?.('6.1')) tg.HapticFeedback.impactOccurred(kind);
  } catch { /* вне Telegram */ }
}

function save() {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* приватный режим */ }
}

// --- Экран 1: настройки ---

function setupScreen() {
  settings.spies = Math.min(settings.spies, maxSpies(settings.players));
  const chips = [ANY, ...CATEGORY_KEYS].map((k) => `<button class="chip${settings.category === k ? ' on' : ''}" data-cat="${k}">${esc(categoryName(k))}</button>`).join('');
  app.innerHTML = `
    <h1>🕵️ Шпион</h1>
    <p class="muted">у всех одно общее слово, у шпиона — другое той же темы. телефон передаёте по кругу, каждый смотрит свою роль.</p>
    <section class="card">
      <div class="label">игроков</div>
      <div class="stepper"><button data-step="players:-1" ${settings.players <= MIN_PLAYERS ? 'disabled' : ''}>−</button>
        <span class="value">${settings.players}</span>
        <button data-step="players:1" ${settings.players >= MAX_PLAYERS ? 'disabled' : ''}>+</button></div>
    </section>
    <section class="card">
      <div class="label">шпионов</div>
      <div class="stepper"><button data-step="spies:-1" ${settings.spies <= 1 ? 'disabled' : ''}>−</button>
        <span class="value">${settings.spies}</span>
        <button data-step="spies:1" ${settings.spies >= maxSpies(settings.players) ? 'disabled' : ''}>+</button></div>
    </section>
    <section class="card">
      <div class="label">категория</div>
      <div class="chips">${chips}</div>
    </section>
    <section class="card">
      <div class="label">режим</div>
      <div class="chips">
        <button class="chip${settings.mode !== 'classic' ? ' on' : ''}" data-mode="word">другое слово</button>
        <button class="chip${settings.mode === 'classic' ? ' on' : ''}" data-mode="classic">шпион без слова</button>
      </div>
      <p class="muted">${settings.mode === 'classic'
        ? 'шпион знает, что он шпион, но слова не знает'
        : 'у шпиона другое слово той же темы — и он сам не знает, что он шпион'}</p>
      ${settings.mode === 'classic' ? `<label class="switch"><span><b>подсказка шпиону</b><br><span class="muted">шпион узнает тему слова</span></span>
        <input type="checkbox" data-hint ${settings.hint ? 'checked' : ''}></label>` : ''}
    </section>
    <section class="card">
      <div class="label">таймер обсуждения, минут</div>
      <div class="stepper"><button data-step="minutes:-1" ${settings.minutes <= 2 ? 'disabled' : ''}>−</button>
        <span class="value">${settings.minutes}</span>
        <button data-step="minutes:1" ${settings.minutes >= 20 ? 'disabled' : ''}>+</button></div>
    </section>
    <div class="spacer"></div>
    <button class="big" data-go>раздать роли</button>`;
}

// --- Экран 2: каждый смотрит свою роль ---

function deal() {
  let state = newLobby({ id: 0, name: nameOf(0) });
  state = { ...state, players: Array.from({ length: settings.players }, (_, i) => ({ id: i, name: nameOf(i) })), category: settings.category, spyCount: settings.spies, hint: settings.hint, mode: settings.mode === 'classic' ? 'classic' : 'word' };
  game = startGame(state).state;
  turn = 0;
  shown = false;
  roleScreen();
}

function roleScreen() {
  const last = turn === game.players.length - 1;
  if (!shown) {
    app.innerHTML = `
      <h2>${esc(nameOf(turn))}, возьми телефон</h2>
      <p class="muted">убедись, что никто не подглядывает 👀</p>
      <button class="role hidden" data-show><div><div class="emoji">🂠</div><p>нажми, чтобы увидеть роль</p></div></button>
      <div class="spacer"></div>
      <p class="muted">${turn + 1} из ${game.players.length}</p>`;
    return;
  }
  // в режиме «другое слово» шпион видит обычную карточку со своим словом — и не знает, что он шпион
  const spy = game.spyIds.includes(turn) && !game.spyWord;
  const word = game.spyIds.includes(turn) && game.spyWord ? game.spyWord : game.word;
  const cat = CATEGORIES[game.wordCategory].name;
  const others = game.spyIds.filter((s) => s !== turn).map(nameOf);
  app.innerHTML = `
    <h2>${esc(nameOf(turn))}</h2>
    <div class="role${spy ? ' spy' : ''}"><div>
      ${spy
        ? `<div class="emoji">🕵️</div><div class="word">ты шпион!</div>
           <p>${game.hint ? `категория: <b>${esc(cat)}</b><br>` : ''}слова ты не знаешь — притворяйся${others.length ? `<br>ещё шпион: ${esc(others.join(', '))}` : ''}</p>`
        : `<div class="emoji">🗝️</div><p class="muted">слово</p><div class="word">${esc(word)}</div><p class="muted">тема: ${esc(cat)}</p>`}
    </div></div>
    <div class="spacer"></div>
    <button class="big" data-next>${last ? 'скрыть — все посмотрели' : `скрыть — дальше ${esc(nameOf(turn + 1))}`}</button>`;
}

// --- Экран 3: обсуждение с таймером ---

function playScreen() {
  const first = nameOf(game.firstId);
  let left = settings.minutes * 60;
  app.innerHTML = `
    <h2>все посмотрели!</h2>
    <p>первым спрашивает <b>${esc(first)}</b>. задавайте вопросы по кругу, не называя слово.</p>
    <section class="card"><div class="timer" data-timer></div>
      <div class="row"><button class="big ghost" data-pause>пауза</button><button class="big ghost" data-add-min>+1 минута</button></div></section>
    <div class="spacer"></div>
    <p class="muted">голосуйте вслух, кто шпион. потом открывайте ответ:</p>
    <button class="big" data-reveal>показать шпиона и слово</button>`;
  const el = app.querySelector('[data-timer]');
  let paused = false;
  const draw = () => {
    const m = Math.floor(Math.max(left, 0) / 60);
    const s = String(Math.max(left, 0) % 60).padStart(2, '0');
    el.textContent = left > 0 ? `${m}:${s}` : 'время!';
    el.classList.toggle('done', left <= 0);
  };
  draw();
  clearInterval(timer);
  timer = setInterval(() => {
    if (paused) return;
    left -= 1;
    draw();
    if (left === 0) {
      try { tg?.HapticFeedback?.notificationOccurred('warning'); } catch { /* вне Telegram */ }
    }
  }, 1000);
  app.querySelector('[data-pause]').onclick = (e) => {
    paused = !paused;
    e.currentTarget.textContent = paused ? 'дальше' : 'пауза';
  };
  app.querySelector('[data-add-min]').onclick = () => {
    left = Math.max(left, 0) + 60;
    draw();
  };
}

function revealScreen() {
  clearInterval(timer);
  const spies = game.spyIds.map(nameOf).join(', ');
  app.innerHTML = `
    <h2>🏁 ответ</h2>
    <div class="role spy"><div>
      <div class="emoji">🕵️</div>
      <p class="muted">${game.spyIds.length > 1 ? 'шпионы' : 'шпион'}</p><div class="word">${esc(spies)}</div>
      ${game.spyWord ? `<p class="muted">у шпиона было слово</p><div class="word">${esc(game.spyWord)}</div>` : ''}
      <p class="muted">${game.spyWord ? 'у всех остальных' : 'слово было'}</p><div class="word">${esc(game.word)}</div>
    </div></div>
    <div class="spacer"></div>
    <div class="row"><button class="big ghost" data-setup>настройки</button><button class="big" data-go>ещё раз</button></div>`;
}

// --- События ---

app.addEventListener('click', async (e) => {
  const el = e.target.closest('button');
  if (!el) return;
  haptic();
  if (el.dataset.step) {
    const [key, d] = el.dataset.step.split(':');
    settings[key] += Number(d);
    save();
    return setupScreen();
  }
  if (el.dataset.mode) {
    settings.mode = el.dataset.mode;
    save();
    return setupScreen();
  }
  if (el.dataset.cat) {
    settings.category = el.dataset.cat;
    save();
    return setupScreen();
  }
  if (el.dataset.go !== undefined) return deal();
  if (el.dataset.setup !== undefined) return setupScreen();
  if (el.dataset.show !== undefined) {
    shown = true;
    return roleScreen();
  }
  if (el.dataset.next !== undefined) {
    shown = false;
    turn += 1;
    return turn < game.players.length ? roleScreen() : playScreen();
  }
  if (el.dataset.reveal !== undefined) {
    const ok = await new Promise((resolve) => {
      if (tg?.showConfirm && inTelegram) tg.showConfirm('показать шпиона всем?', resolve);
      else resolve(window.confirm('показать шпиона всем?'));
    });
    if (ok) revealScreen();
  }
});

app.addEventListener('change', (e) => {
  if (e.target.matches('[data-hint]')) {
    settings.hint = e.target.checked;
    save();
  }
});

if (inTelegram) {
  tg.ready();
  tg.expand();
  try {
    tg.setHeaderColor('#0b0d14');
    tg.setBackgroundColor('#0b0d14');
  } catch { /* старый клиент */ }
}

setupScreen();


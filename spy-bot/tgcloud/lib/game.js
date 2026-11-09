// lib/game — правила «Шпиона» без Telegram и базы: чистые функции над состоянием игры.
// Работает и в боте (игра в группе), и в Mini App (один телефон по кругу), и в тестах.
//
// У всех, кроме шпиона, одно общее слово. Два режима (mode):
//   'word'    — у шпиона ДРУГОЕ, но похожее слово (торт ↔ пирожное), и он сам не знает, что он шпион (по умолчанию);
//   'classic' — шпион знает, что он шпион, слова не знает (с подсказкой — знает тему) и может угадать слово.
// Игроки задают друг другу вопросы, потом голосуют, кто шпион.
//
// Состояние: { status, hostId, players: [{ id, name }], category, spyCount, hint, mode,
//              word, spyWord, wordCategory, spyIds, firstId, votes: { voterId: targetId }, options, winner, reason }
// status: 'lobby' → 'play' → 'guess' (шпион угадывает) → 'over'.

import { ANY, CATEGORIES, CATEGORY_KEYS, similarWords } from './words.js';

export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 20;
export const GUESS_OPTIONS = 8;

/** Сколько шпионов можно при таком числе игроков: всегда меньше половины. */
export const maxSpies = (n) => Math.max(1, Math.min(3, Math.floor((n - 1) / 2)));

const pick = (list, rnd) => list[Math.floor(rnd() * list.length)];

function shuffle(list, rnd) {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function newLobby(host) {
  return {
    status: 'lobby', hostId: host.id, players: [{ id: host.id, name: host.name }],
    category: ANY, spyCount: 1, hint: true, mode: 'word', votes: {},
  };
}

/** Войти или выйти из лобби. → { state } или { error }. Ведущий выйти не может — только отменить игру. */
export function toggleJoin(state, user) {
  if (state.status !== 'lobby') return { error: 'игра уже идёт' };
  const inGame = state.players.some((p) => p.id === user.id);
  if (inGame) {
    if (user.id === state.hostId) return { error: 'ты ведущий — можно только отменить игру' };
    const players = state.players.filter((p) => p.id !== user.id);
    return { state: { ...state, players, spyCount: Math.min(state.spyCount, maxSpies(players.length)) }, left: true };
  }
  if (state.players.length >= MAX_PLAYERS) return { error: `не больше ${MAX_PLAYERS} игроков` };
  return { state: { ...state, players: [...state.players, { id: user.id, name: user.name }] }, joined: true };
}

/** Настройки лобби (только ведущий): категория по кругу, число шпионов, подсказка шпиону. */
export function cycleCategory(state) {
  const all = [ANY, ...CATEGORY_KEYS];
  return { ...state, category: all[(all.indexOf(state.category) + 1) % all.length] };
}

export function cycleSpies(state) {
  const max = maxSpies(Math.max(state.players.length, MIN_PLAYERS));
  return { ...state, spyCount: state.spyCount >= max ? 1 : state.spyCount + 1 };
}

export const toggleHint = (state) => ({ ...state, hint: !state.hint });
export const toggleMode = (state) => ({ ...state, mode: state.mode === 'classic' ? 'word' : 'classic' });

/** Раздать роли. → { state } или { error }. */
export function startGame(state, rnd = Math.random) {
  if (state.status !== 'lobby') return { error: 'игра уже идёт' };
  if (state.players.length < MIN_PLAYERS) return { error: `нужно хотя бы ${MIN_PLAYERS} игрока` };
  const wordCategory = state.category === ANY ? pick(CATEGORY_KEYS, rnd) : state.category;
  const word = pick(CATEGORIES[wordCategory].words, rnd);
  // режим «другое слово»: шпиону — похожее слово из той же группы (торт ↔ пирожное)
  const spyWord = state.mode === 'classic' ? null : pick(similarWords(wordCategory, word), rnd);
  const spyCount = Math.min(state.spyCount, maxSpies(state.players.length));
  const spyIds = shuffle(state.players.map((p) => p.id), rnd).slice(0, spyCount);
  const firstId = pick(state.players, rnd).id;
  return { state: { ...state, status: 'play', spyCount, word, spyWord, wordCategory, spyIds, firstId, votes: {}, options: [] } };
}

export const isPlayer = (state, id) => state.players.some((p) => p.id === id);
export const isSpy = (state, id) => (state.spyIds ?? []).includes(id);
export const playerName = (state, id) => state.players.find((p) => p.id === id)?.name ?? '?';

/** Что видит игрок, нажав «моя роль» (только он). */
export function roleText(state, id) {
  if (!isPlayer(state, id)) return 'ты не в этой игре — дождись следующей';
  if (state.status === 'lobby') return 'игра ещё не началась';
  const cat = CATEGORIES[state.wordCategory].name;
  // в режиме «другое слово» шпион видит то же, что все, только со своим словом — и не знает, что он шпион
  if (isSpy(state, id) && state.spyWord) return civilianText(state.spyWord, cat);
  if (isSpy(state, id)) {
    const others = state.spyIds.length > 1 ? `\nещё шпион: ${state.spyIds.filter((s) => s !== id).map((s) => playerName(state, s)).join(', ')}` : '';
    return `🕵️ ты ШПИОН!\n${state.hint ? `категория: ${cat}\n` : ''}слова ты не знаешь — притворяйся и вычисли его по вопросам${others}`;
  }
  return civilianText(state.word, cat);
}

const civilianText = (word, cat) => `слово: ${word.toUpperCase()}\nтема: ${cat}\n\nне называй слово прямо — ищи шпиона: у него слово другое`;

/** Голос: voterId считает шпионом targetId (можно передумать; за себя нельзя). → { state } или { error }. */
export function vote(state, voterId, targetId) {
  if (state.status !== 'play') return { error: 'сейчас не голосуем' };
  if (!isPlayer(state, voterId)) return { error: 'ты не в этой игре' };
  if (!isPlayer(state, targetId)) return { error: 'такого игрока нет' };
  if (voterId === targetId) return { error: 'за себя голосовать нельзя' };
  return { state: { ...state, votes: { ...state.votes, [voterId]: targetId } } };
}

export const allVoted = (state) => state.players.every((p) => state.votes[p.id] !== undefined);

/** Подсчёт: { counts: [{ id, votes }], suspect } — suspect: у кого больше всех голосов (ничья — никто). */
export function tally(state) {
  const counts = state.players.map((p) => ({ id: p.id, votes: Object.values(state.votes).filter((t) => t === p.id).length }))
    .sort((a, b) => b.votes - a.votes);
  const top = counts[0];
  const suspect = top && top.votes > 0 && counts.filter((c) => c.votes === top.votes).length === 1 ? top.id : null;
  return { counts, suspect };
}

/** Закончить голосование: шпиона поймали — победили мирные, нет (или ничья) — шпион. */
export function finishVote(state) {
  if (state.status !== 'play') return { error: 'сейчас не голосуем' };
  const { suspect } = tally(state);
  const caught = suspect !== null && isSpy(state, suspect);
  return {
    state: {
      ...state, status: 'over', suspect,
      winner: caught ? 'players' : 'spies',
      reason: suspect === null ? 'tie' : caught ? 'caught' : 'wrong',
    },
  };
}

/** Шпион раскрывается и угадывает слово: варианты — слово и ещё 7 из той же категории. */
export function openGuess(state, id, rnd = Math.random) {
  if (state.status !== 'play') return { error: 'сейчас нельзя' };
  if (state.spyWord) return { error: 'в этом режиме шпион не знает, что он шпион — угадывать нечего' };
  if (!isSpy(state, id)) return { error: 'угадывать слово может только шпион 🤫' };
  // среди вариантов — сначала похожие слова, чтобы угадать было не так просто
  const similar = similarWords(state.wordCategory, state.word);
  const others = shuffle(CATEGORIES[state.wordCategory].words.filter((w) => w !== state.word && !similar.includes(w)), rnd);
  const rest = [...similar, ...others].slice(0, GUESS_OPTIONS - 1);
  return { state: { ...state, status: 'guess', guesserId: id, options: shuffle([state.word, ...rest], rnd) } };
}

/** Шпион выбрал вариант. Угадал — победа шпионов, нет — мирных. */
export function guess(state, id, index) {
  if (state.status !== 'guess') return { error: 'сейчас нельзя' };
  if (id !== state.guesserId) return { error: 'угадывает шпион, который раскрылся' };
  const choice = state.options[index];
  if (choice === undefined) return { error: 'нет такого варианта' };
  const right = choice === state.word;
  return { state: { ...state, status: 'over', guessed: choice, winner: right ? 'spies' : 'players', reason: right ? 'guessed' : 'missed' } };
}

/** Ведущий завершает игру досрочно: просто показываем, кто был шпионом. */
export function stopGame(state) {
  return { ...state, status: 'over', winner: null, reason: 'stopped' };
}

/** Новая партия с теми же игроками и настройками. */
export function rematch(state) {
  return {
    status: 'lobby', hostId: state.hostId, players: state.players,
    category: state.category, spyCount: state.spyCount, hint: state.hint, mode: state.mode ?? 'word', votes: {},
  };
}

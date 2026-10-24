import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  finishVote, guess, maxSpies, newLobby, openGuess, roleText, startGame, tally, toggleJoin, vote,
} from '../tgcloud/lib/game.js';
import { press, render } from '../tgcloud/lib/bot.js';
import { CATEGORIES } from '../tgcloud/lib/words.js';

// предсказуемый «рандом»
function seq(...values) {
  let i = 0;
  return () => values[i++ % values.length];
}

const U = (id, first_name) => ({ id, first_name });
const ann = U(1, 'Аня');
const bob = U(2, 'Боря');
const vik = U(3, 'Вика');
const gena = U(4, 'Гена');

function lobbyWith(...users) {
  let state = newLobby({ id: users[0].id, name: users[0].first_name });
  for (const u of users.slice(1)) state = press(state, 'j', u).state;
  return state;
}

test('слова: в каждой категории хватает слов на угадывание, без повторов', () => {
  for (const [key, c] of Object.entries(CATEGORIES)) {
    assert.ok(c.words.length >= 20, key);
    assert.equal(new Set(c.words).size, c.words.length, `${key}: повтор`);
  }
  assert.deepEqual([3, 4, 5, 6, 7, 9].map(maxSpies), [1, 1, 2, 2, 3, 3]);
});

test('лобби: вход и выход, ведущий не выходит, старт от 3 игроков', () => {
  let s = lobbyWith(ann, bob);
  assert.deepEqual(s.players.map((p) => p.name), ['Аня', 'Боря']);
  assert.match(press(s, 's', ann).toast, /хотя бы 3/);
  assert.match(press(s, 's', bob).toast, /только ведущий — Аня/);
  assert.match(toggleJoin(s, { id: 1, name: 'Аня' }).error, /ведущий/);
  s = press(s, 'j', bob).state; // Боря вышел
  assert.equal(s.players.length, 1);
  s = lobbyWith(ann, bob, vik);
  assert.match(render(s).text, /1\. Аня 👑\n2\. Боря\n3\. Вика/);
  // настройки — только ведущий
  assert.equal(press(s, 'c', ann).state.category, 'places');
  assert.equal(press(s, 'c', bob).state, s);
});

test('игра: у всех одно слово, у шпиона — нет; роль видит только нажавший', () => {
  const s0 = lobbyWith(ann, bob, vik, gena);
  const { state } = startGame(s0, seq(0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7));
  assert.equal(state.status, 'play');
  assert.equal(state.spyIds.length, 1);
  const spy = state.spyIds[0];
  const word = state.word;
  assert.ok(CATEGORIES[state.wordCategory].words.includes(word));
  for (const p of state.players) {
    const text = roleText(state, p.id);
    if (p.id === spy) {
      assert.match(text, /ты ШПИОН/);
      assert.ok(!text.toLowerCase().includes(word));
      assert.match(text, /категория:/); // подсказка включена по умолчанию
    } else {
      assert.match(text, new RegExp(`слово: ${word.toUpperCase()}`));
    }
  }
  assert.match(roleText(state, 99), /не в этой игре/);
  // без подсказки шпион категорию не видит
  const noHint = startGame({ ...s0, hint: false }, seq(0.1, 0.2, 0.3)).state;
  assert.ok(!roleText(noHint, noHint.spyIds[0]).includes('категория'));
  // «моя роль» — всплывающее окно
  const r = press(state, 'r', U(spy, 'x'));
  assert.equal(r.state, state);
  assert.match(r.alert, /ШПИОН/);
});

test('голосование: поймали шпиона — мирные, не того — шпион, ничья — шпион', () => {
  const base = startGame(lobbyWith(ann, bob, vik, gena), seq(0.1, 0.2, 0.3, 0.4, 0.5)).state;
  const spy = base.spyIds[0];
  const others = base.players.map((p) => p.id).filter((id) => id !== spy);
  assert.match(vote(base, spy, spy).error, /за себя/);

  // все голосуют за шпиона (сам шпион — за кого-то другого) → игра заканчивается сама
  let s = base;
  for (const id of others) s = press(s, `v:${spy}`, U(id, 'x')).state;
  const last = press(s, `v:${others[0]}`, U(spy, 'x'));
  assert.equal(last.state.status, 'over');
  assert.equal(last.state.winner, 'players');
  assert.match(render(last.state).text, /это шпион! 🎯[\s\S]*победили мирные/);

  // большинство за мирного
  s = base;
  for (const id of base.players.map((p) => p.id)) s = vote(s, id, id === others[0] ? others[1] : others[0]).state;
  assert.equal(tally(s).suspect, others[0]);
  assert.equal(finishVote(s).state.winner, 'spies');

  // ничья
  s = vote(vote(base, others[0], others[1]).state, others[1], others[0]).state;
  assert.equal(tally(s).suspect, null);
  const tie = press(s, 'e', ann).state;
  assert.equal(tie.reason, 'tie');
  assert.match(render(tie).text, /голоса разделились[\s\S]*победа шпиона/);
});

test('шпион угадывает слово: только он, 8 вариантов, среди них верный', () => {
  const base = startGame(lobbyWith(ann, bob, vik), seq(0.3, 0.6, 0.9)).state;
  const spy = base.spyIds[0];
  const notSpy = base.players.find((p) => p.id !== spy).id;
  assert.match(press(base, 'g', U(notSpy, 'x')).toast, /только шпион/);
  const open = press(base, 'g', U(spy, 'x')).state;
  assert.equal(open.status, 'guess');
  assert.equal(open.options.length, 8);
  assert.ok(open.options.includes(base.word));
  assert.match(render(open).text, /раскрылся — это шпион/);
  assert.match(guess(open, notSpy, 0).error, /угадывает шпион/);
  const right = open.options.indexOf(base.word);
  assert.equal(press(open, `gi:${right}`, U(spy, 'x')).state.winner, 'spies');
  const wrong = right === 0 ? 1 : 0;
  const miss = press(open, `gi:${wrong}`, U(spy, 'x')).state;
  assert.equal(miss.winner, 'players');
  assert.match(render(miss).text, /мимо/);
  assert.equal(openGuess(miss, spy).error, 'сейчас нельзя');
});

test('ещё раз и отмена', () => {
  const over = finishVote(vote(startGame(lobbyWith(ann, bob, vik), seq(0.5)).state, 1, 2).state).state;
  const again = press(over, 'a', ann).state;
  assert.equal(again.status, 'lobby');
  assert.equal(again.players.length, 3);
  assert.equal(press(lobbyWith(ann, bob), 'x', ann).state.status, 'cancelled');
  assert.match(render({ status: 'cancelled' }).text, /отменили/);
});

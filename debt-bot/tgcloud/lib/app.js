// lib/app — что бот делает на сообщения и кнопки. Без 'sdk': всё внешнее приходит в deps,
// поэтому логику проверяют тесты (test/bot.test.js).
//
// deps = {
//   store,  — база (lib/store.js);
//   tg: { send(chatId, text, markup), edit(chatId, msgId, text, markup), answer(queryId, text, alert), setup() },
//   botUsername — для ссылок t.me/<бот>?start=…;
//   now() — unix-секунды; token() — случайная строка для ссылки другу.
// }
//
// Тетрадка у каждого своя: кто записывает — тот и дал в долг (owner). Друг в тетрадке — просто имя;
// если друг открыл свою ссылку, он «подключён»: видит свой долг, получает напоминания и может
// нажать «я вернул» — владелец подтверждает.

import { DAY, DEFAULT_TERMS, MAX_APR, MAX_GRACE_DAYS, debtOf, ratePercent, rateText } from './loans.js';
import { money, parseAmount, parseEntry, shortDate, untilToUnix } from './money.js';

export const BUTTONS = {
  list: '💰 Мне должны',
  mine: '🙈 Я должен',
  help: '❓ Как пользоваться',
};

export const COMMANDS = [
  { command: 'list', description: '💰 Кто мне должен' },
  { command: 'mine', description: '🙈 Кому должен я' },
  { command: 'terms', description: '⚙️ Условия: дней без процентов и % потом' },
  { command: 'help', description: '❓ Как пользоваться' },
];

export const DESCRIPTION = '💰 Тетрадка долгов: записываешь «Петя 500 пицца» — бот помнит, кто сколько должен, считает возвраты и напоминает друзьям.';
export const SHORT_DESCRIPTION = '💰 Кто сколько мне должен';

const KEYBOARD = {
  keyboard: [[{ text: BUTTONS.list }], [{ text: BUTTONS.mine }, { text: BUTTONS.help }]],
  resize_keyboard: true,
  is_persistent: true,
  input_field_placeholder: 'Петя 500 пицца',
};

export const HELP_TEXT = [
  '💰 <b>Как пользоваться</b>',
  '',
  'Дал в долг — просто напиши кому и сколько:',
  '<code>Петя 500</code> · <code>Петя 1500 кино</code> · <code>Маша 2к</code>',
  '',
  'Вернули:',
  '<code>Петя вернул 200</code> или <code>Петя -200</code> — часть',
  '<code>Петя вернул</code> — всё (вместе с процентами)',
  '',
  '⏳ <b>Беспроцентный период — как у кредитки.</b> Вернул займ целиком до конца периода — процентов нет.',
  'Не вернул — проценты (годовые) за весь срок с первого дня, и дальше капают, пока не вернёт.',
  'Свои условия для всех новых займов — /terms. Для одного займа — прямо в записи:',
  '<code>Петя 500 на 14 дней</code> · <code>Петя 500 до 25.11</code> · <code>Петя 500 без процентов</code>',
  'Возврат гасит сначала проценты, потом сам долг — со старых займов.',
  '',
  `«${BUTTONS.list}» — список и итог. Нажми на друга: история, кнопки «вернул», «напомнить», «отменить».`,
  '',
  '🔗 У каждого друга есть ссылка: перешли её — друг увидит свой долг, получит напоминание',
  'и сможет нажать «я вернул» (ты подтвердишь).',
].join('\n');

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function userName(user) {
  return [user?.first_name, user?.last_name].filter(Boolean).join(' ').trim() || (user?.username ? `@${user.username}` : 'Кто-то');
}

export const nameKey = (name) => name.trim().toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ');
export const cleanName = (name) => name.trim().replace(/\s+/g, ' ').replace(/^./, (c) => c.toUpperCase());
export const friendLink = (deps, f) => `https://t.me/${deps.botUsername}?start=f_${f.token}`;

/** Долг друга сейчас (см. lib/loans.js). */
export const owed = async (deps, friendId) => debtOf(await deps.store.opsOf(friendId), deps.now());

export const userTerms = (me) => ({ graceDays: me?.graceDays ?? DEFAULT_TERMS.graceDays, apr: me?.apr ?? DEFAULT_TERMS.apr });

/** Условия нового займа: из записи («на 14 дней», «до 25.11», «без процентов») или общие. */
export function loanTerms(me, terms, now) {
  const base = userTerms(me);
  const apr = terms?.free ? 0 : base.apr;
  const until = terms?.until ? untilToUnix(terms.until, now) : null;
  const due = until ?? now + (terms?.days ?? base.graceDays) * DAY;
  return { due, apr };
}

/** «без процентов до 09.12; не вернёт всё к этому дню — 61,9% годовых за весь срок» */
const termsText = (due, apr) => (apr > 0
  ? `без процентов до ${shortDate(due - 1)}; не вернёт всё к этому дню — ${ratePercent(apr)} годовых за весь срок`
  : 'без процентов');

/** «61,9% годовых, 55 дн. без процентов» — условия новых займов. */
const userTermsText = (t) => (t.apr > 0 ? `до ${t.graceDays} дн. без процентов, потом ${ratePercent(t.apr)} годовых за весь срок` : 'без процентов');

/** «2 045 ₽ (в т.ч. проценты 45 ₽)» */
const totalText = (d) => `${money(d.total)}${d.interest > 0 ? ` (в т.ч. проценты ${money(d.interest)})` : ''}`;

/** Ближайший конец беспроцентного периода или «капает N ₽ в день». */
function statusLine(d, now) {
  if (d.perDay > 0) return `⚠️ беспроцентный период кончился — капает ${money(d.perDay)} в день`;
  const next = d.loans.filter((l) => (l.apr || l.rate) && l.left > 0 && l.due > now).sort((a, b) => a.due - b.due)[0];
  if (!next) return '';
  return `⏳ без процентов до ${shortDate(next.due - 1)}${next.risk ? ` — не вернёт всё к этому дню, набежит ${money(next.risk)} (${rateText(next)})` : `, потом ${rateText(next)}`}`;
}

// --- Сообщения ---

const COMMAND = /^\/([a-z_]+)(?:@\w+)?(?:\s+([\s\S]*))?$/i;

export async function handleMessage(message, deps) {
  const chat = message.chat;
  const user = message.from;
  if (chat?.type !== 'private' || !user || user.is_bot) return undefined; // тетрадка личная — только в личке
  const text = (message.text ?? '').trim();
  const m = COMMAND.exec(text);
  const cmd = m?.[1].toLowerCase();
  const args = m?.[2]?.trim() ?? '';
  await deps.store.putUser({ userId: user.id, name: userName(user), username: user.username ?? null });
  const me = await deps.store.getUser(user.id);

  if (cmd === 'start' && args.startsWith('f_')) return linkFriend(chat.id, user, args.slice(2), deps);
  if (cmd === 'start') {
    await deps.store.setPending(user.id, null);
    await deps.tg.setup?.();
    await deps.tg.send(chat.id, `👋 Привет! Я тетрадка долгов.\n\n${HELP_TEXT}`, KEYBOARD);
    return deps.miniAppUrl ? deps.tg.send(chat.id, '📱 Всё то же — удобнее — в приложении: кнопка «Тетрадка» слева от поля ввода или здесь 👇', {
      inline_keyboard: [[{ text: '📱 Открыть приложение', web_app: { url: deps.miniAppUrl } }]],
    }) : undefined;
  }
  if (cmd === 'help' || text === BUTTONS.help) return deps.tg.send(chat.id, HELP_TEXT, KEYBOARD);
  if (cmd === 'list' || text === BUTTONS.list) {
    await deps.store.setPending(user.id, null);
    return deps.tg.send(chat.id, ...await listView(user.id, deps));
  }
  if (cmd === 'mine' || text === BUTTONS.mine) return deps.tg.send(chat.id, ...await mineView(user.id, deps));
  if (cmd === 'terms') return termsCommand(chat.id, user.id, me, args, deps);
  if (cmd) return deps.tg.send(chat.id, HELP_TEXT, KEYBOARD);

  // Бот ждёт сумму (после кнопок «вернул часть» / «дал ещё»)
  const pending = me?.pending ? { ...me.pending } : null;
  if (pending?.friendId) {
    // «300» или «300 такси»
    const parsed = parseAmount(text) !== null ? { amount: parseAmount(text), note: '' } : parseEntry(`x ${text}`);
    const amount = parsed?.kind === 'return' ? null : parsed?.amount ?? null;
    const friend = await deps.store.friend(pending.friendId);
    if (amount !== null && friend?.ownerId === user.id) {
      await deps.store.setPending(user.id, null);
      const kind = pending.kind === 'part' ? 'return' : 'lend';
      return record(chat.id, user, friend, kind, amount, kind === 'lend' ? parsed.note : '', deps, kind === 'lend' ? loanTerms(me, parsed.terms, deps.now()) : null);
    }
    if (amount === null && /^[\d\s.,]+$/.test(text)) return deps.tg.send(chat.id, '🤔 Не понял сумму. Напиши числом, например <code>300</code>.');
    await deps.store.setPending(user.id, null); // написали что-то другое — забываем
  }

  const entry = parseEntry(text);
  if (!entry) {
    return deps.tg.send(chat.id, `🤔 Не понял. Напиши, например, <code>Петя 500</code> — дал Пете 500 ₽, или <code>Петя вернул 200</code>.\n\nПодробно — «${BUTTONS.help}».`, KEYBOARD);
  }
  const key = nameKey(entry.name);
  let friend = await deps.store.friendByName(user.id, key);
  if (!friend) {
    if (entry.kind === 'return') return deps.tg.send(chat.id, `🤔 В тетрадке нет «${esc(entry.name)}». Кто тебе должен — «${BUTTONS.list}».`);
    friend = await deps.store.addFriend({ ownerId: user.id, name: cleanName(entry.name), nameKey: key, token: deps.token() });
  }
  let amount = entry.amount;
  if (amount === null) {
    amount = (await owed(deps, friend.id)).total;
    if (amount <= 0) return deps.tg.send(chat.id, `✅ ${esc(friend.name)} тебе ничего не должен(а).`);
  }
  return record(chat.id, user, friend, entry.kind, amount, entry.note, deps, entry.kind === 'lend' ? loanTerms(me, entry.terms, deps.now()) : null);
}

async function termsCommand(chatId, userId, me, args, deps) {
  const cur = userTerms(me);
  const usage = [
    `⚙️ <b>Условия новых займов</b>: ${userTermsText(cur)}`,
    '',
    'Поменять: <code>/terms 55 61,9</code> — 55 дней без процентов, не вернул всё — 61,9% годовых за весь срок.',
    '<code>/terms 30 25</code> — 30 дней, 25% годовых · <code>/terms 0 0</code> — совсем без процентов.',
    '',
    'Старые займы остаются на своих условиях.',
  ].join('\n');
  if (!args) return deps.tg.send(chatId, usage);
  const m = /^(\d{1,3})\s+(\d{1,2}(?:[.,]\d{1,2})?)\s*%?$/.exec(args);
  const graceDays = m ? Number(m[1]) : NaN;
  const apr = m ? Math.round(Number(m[2].replace(',', '.')) * 100) : NaN;
  if (!m || graceDays > MAX_GRACE_DAYS || apr > MAX_APR) {
    return deps.tg.send(chatId, `🤔 Не понял. Дней — до ${MAX_GRACE_DAYS}, процент годовых — до ${ratePercent(MAX_APR)}.\n\n${usage}`);
  }
  await deps.store.setTerms(userId, { graceDays, apr });
  return deps.tg.send(chatId, `✅ Новые займы: ${userTermsText({ graceDays, apr })}.`);
}

/** Записать выдачу/возврат, ответить владельцу и сообщить подключённому другу. */
/** quiet — не писать владельцу в чат (запись из приложения). */
export async function record(chatId, owner, friend, kind, amount, note, deps, terms = null, quiet = false) {
  await deps.store.addOp({ ownerId: owner.id, friendId: friend.id, kind, amount, note: note || null, at: deps.now(), ...terms });
  const d = await owed(deps, friend.id);
  const balance = d.total;
  const loanTermsText = terms ? `\n⏳ ${termsText(terms.due, terms.apr)}` : '';
  const what = kind === 'lend'
    ? `➕ Записал: ${esc(friend.name)} — ${money(amount)}${note ? ` (${esc(note)})` : ''}${loanTermsText}`
    : `↩️ ${esc(friend.name)} вернул(а) ${money(amount)}`;
  const total = balance > 0 ? `Всего должен(а): <b>${totalText(d)}</b>` : balance < 0 ? `Переплата: ${money(-balance)} — теперь ты должен(а) ${esc(friend.name)}` : '🎉 Долг закрыт!';
  if (!quiet) {
    await deps.tg.send(chatId, `${what}\n${total}`, {
      inline_keyboard: [[{ text: `📒 ${friend.name}`, callback_data: `f:${friend.id}` }, { text: '↩️ Отменить', callback_data: `undo:${friend.id}` }]],
    });
  }
  if (friend.linkedUserId) {
    const ownerName = esc(userName(owner));
    const msg = kind === 'lend'
      ? `📒 ${ownerName} записал(а): ты взял(а) ${money(amount)}${note ? ` (${esc(note)})` : ''}.${loanTermsText}`
      : `📒 ${ownerName} отметил(а): ты вернул(а) ${money(amount)}.`;
    await deps.tg.send(friend.linkedUserId, `${msg}\n${balance > 0 ? `Ты должен(а): <b>${totalText(d)}</b>` : '🎉 Ты ничего не должен(а).'}`);
  }
  return undefined;
}

// --- Виды ---

/** Список «мне должны» → [text, markup]. */
export async function listView(ownerId, deps) {
  const [list, all] = await Promise.all([deps.store.friendsOf(ownerId), deps.store.opsOfOwner(ownerId)]);
  const rows = list.map((f) => {
    const d = debtOf(all.filter((o) => o.friendId === f.id), deps.now());
    return { f, d, balance: d.total };
  });
  const owing = rows.filter((r) => r.balance !== 0).sort((a, b) => b.balance - a.balance);
  const closed = rows.filter((r) => r.balance === 0);
  if (rows.length === 0) return [`📒 Тетрадка пустая.\n\nДал в долг — напиши, например, <code>Петя 500</code>.`, KEYBOARD];
  const total = owing.reduce((s, r) => s + Math.max(r.balance, 0), 0);
  const interest = owing.reduce((s, r) => s + r.d.interest, 0);
  const text = [
    owing.length ? `💰 <b>Тебе должны: ${money(total)}</b>${interest > 0 ? `\n<i>из них проценты: ${money(interest)}</i>` : ''}` : '🎉 <b>Тебе никто не должен</b>',
    '',
    ...owing.map((r) => (r.balance > 0
      ? `• ${esc(r.f.name)} — ${money(r.balance)}${r.d.perDay > 0 ? ` ⚠️ +${money(r.d.perDay)}/день` : ''}`
      : `• ${esc(r.f.name)} — ты должен(а) ${money(-r.balance)}`)),
    ...(closed.length ? ['', `<i>Вернули всё: ${closed.map((r) => esc(r.f.name)).join(', ')}</i>`] : []),
  ].join('\n');
  const buttons = [...owing, ...closed].map((r) => [{ text: `${r.f.name}${r.balance ? ` · ${money(r.balance)}` : ' ✓'}`, callback_data: `f:${r.f.id}` }]);
  buttons.push([{ text: '⚙️ Условия займов', callback_data: 'terms' }]);
  return [text, { inline_keyboard: buttons }];
}

/** Карточка друга → [text, markup]. */
export async function friendView(friend, deps) {
  const list = await deps.store.opsOf(friend.id);
  const now = deps.now();
  const d = debtOf(list, now);
  const balance = d.total;
  const history = list.slice(-12).map((o) => `${shortDate(o.at)} ${o.kind === 'lend' ? '➕' : '↩️'} ${money(o.amount)}${o.note ? ` · ${esc(o.note)}` : ''}`);
  const loans = balance > 0 ? d.loans.map((l) => `• ${money(l.left)} от ${shortDate(l.at)}${l.note ? ` (${esc(l.note)})` : ''} — ${loanState(l, now)}`) : [];
  const text = [
    `📒 <b>${esc(friend.name)}</b>`,
    balance > 0 ? `Должен(а): <b>${totalText(d)}</b>` : balance < 0 ? `Переплата: ${money(-balance)}` : '🎉 Ничего не должен(а)',
    balance > 0 ? statusLine(d, now) : '',
    friend.linkedUserId ? '🔗 подключён(а) — видит долг и получает напоминания' : '',
    ...(loans.length ? ['', '<i>займы:</i>', ...loans] : []),
    '',
    ...(history.length ? [list.length > 12 ? '<i>последние записи:</i>' : '<i>история:</i>', ...history] : ['<i>записей нет</i>']),
  ].filter((l, i) => l !== '' || i > 3).join('\n');
  const id = friend.id;
  const rows = [];
  if (balance > 0) rows.push([{ text: '✅ Вернул(а) всё', callback_data: `all:${id}` }, { text: '↩️ Вернул(а) часть', callback_data: `part:${id}` }]);
  rows.push([{ text: '➕ Дал(а) ещё', callback_data: `more:${id}` }, { text: '🔔 Напомнить', callback_data: `nudge:${id}` }]);
  rows.push([{ text: '🔗 Ссылка для друга', callback_data: `link:${id}` }, { text: '↩️ Отменить последнее', callback_data: `undo:${id}` }]);
  rows.push([{ text: '⬅️ Все', callback_data: 'home' }, { text: '🗑 Удалить', callback_data: `del:${id}` }]);
  return [text, { inline_keyboard: rows }];
}

/** Состояние займа: «без % до 09.12, иначе набежит 45 ₽» / «61,9% годовых, набежало 45 ₽». */
function loanState(l, now) {
  if (!l.apr && !l.rate) return 'без процентов';
  if (now < l.due) return `без % до ${shortDate(l.due - 1)}${l.risk ? `, иначе набежит ${money(l.risk)}` : ''}`;
  return `${rateText(l)}${l.interest > 0 ? `, набежало ${money(l.interest)}` : ''}`;
}

/** «Я должен» — долги, где я подключённый друг → [text, markup]. */
export async function mineView(userId, deps) {
  const links = await deps.store.linkedTo(userId);
  const rows = [];
  for (const f of links) {
    const d = await owed(deps, f.id);
    if (d.total <= 0) continue;
    const owner = await deps.store.getUser(f.ownerId);
    rows.push({ f, d, balance: d.total, ownerName: owner?.name ?? 'кто-то' });
  }
  if (rows.length === 0) return ['🙈 Ты никому не должен(а) — по крайней мере, в этом боте.', KEYBOARD];
  const now = deps.now();
  const text = ['🙈 <b>Ты должен(а)</b>', '', ...rows.map((r) => {
    const status = statusLine(r.d, now);
    return `• ${esc(r.ownerName)} — ${totalText(r.d)}${status ? `\n   ${status}` : ''}`;
  })].join('\n');
  return [text, { inline_keyboard: rows.map((r) => [{ text: `💸 Я вернул(а) ${r.ownerName} ${money(r.balance)}`, callback_data: `paid:${r.f.id}` }]) }];
}

// --- Друг открыл ссылку ---

async function linkFriend(chatId, user, token, deps) {
  const friend = await deps.store.friendByToken(token);
  if (!friend) return deps.tg.send(chatId, '🤔 Ссылка устарела. Попроси новую.', KEYBOARD);
  if (friend.ownerId === user.id) return deps.tg.send(chatId, '🙂 Это ссылка для друга — перешли её ему.', KEYBOARD);
  if (friend.linkedUserId && friend.linkedUserId !== user.id) return deps.tg.send(chatId, '🤔 По этой ссылке уже подключился другой человек.', KEYBOARD);
  const isNew = !friend.linkedUserId;
  await deps.store.linkFriend(friend.id, user.id);
  const owner = await deps.store.getUser(friend.ownerId);
  const balance = (await owed(deps, friend.id)).total;
  if (isNew) {
    await deps.tg.send(friend.ownerId, `🔗 ${esc(friend.name)} подключился(ась) — теперь видит свой долг и получает напоминания.`);
  }
  await deps.tg.send(chatId, `👋 Привет! Это тетрадка долгов ${esc(owner?.name ?? '')}.`, KEYBOARD);
  if (balance <= 0) return deps.tg.send(chatId, `🎉 Ты ничего не должен(а) ${esc(owner?.name ?? '')}.`);
  return deps.tg.send(chatId, ...await mineView(user.id, deps));
}

// --- Кнопки ---

export async function handleCallback(query, deps) {
  const user = query.from;
  const chatId = query.message?.chat?.id;
  const msgId = query.message?.message_id;
  const [action, arg = '', extra = ''] = String(query.data ?? '').split(':');
  const answer = (text = '', alert = false) => deps.tg.answer(query.id, text, alert);
  const edit = (text, markup) => deps.tg.edit(chatId, msgId, text, markup);

  if (action === 'home') {
    await answer();
    return edit(...await listView(user.id, deps));
  }
  if (action === 'terms') {
    await answer();
    return termsCommand(chatId, user.id, await deps.store.getUser(user.id), '', deps);
  }
  const friend = await deps.store.friend(Number(arg));
  if (!friend) {
    await answer('Этой записи уже нет', true);
    return undefined;
  }

  // Кнопки подключённого друга и ответ владельца на «я вернул»
  if (action === 'paid') return paidAction(friend, user, answer, edit, deps);
  if (action === 'ok' || action === 'nope') {
    if (friend.ownerId !== user.id) return answer('Это не твоя тетрадка', true);
    const amount = Number(extra);
    if (action === 'nope') {
      await answer();
      await edit(`❌ Не подтверждено: ${esc(friend.name)} — ${money(amount)}.`);
      if (friend.linkedUserId) await deps.tg.send(friend.linkedUserId, `❌ ${esc(userName(user))} не подтвердил(а) возврат ${money(amount)}. Напиши ему/ей лично.`);
      return undefined;
    }
    await answer('Записал');
    await edit(`✅ Подтверждено: ${esc(friend.name)} вернул(а) ${money(amount)}.`);
    return record(chatId, user, friend, 'return', amount, '', deps);
  }

  if (friend.ownerId !== user.id) return answer('Это не твоя тетрадка', true);
  const id = friend.id;

  if (action === 'f') {
    await deps.store.setPending(user.id, null);
    await answer();
    return edit(...await friendView(friend, deps));
  }
  if (action === 'all') {
    const balance = (await owed(deps, id)).total;
    if (balance <= 0) return answer('Долга уже нет');
    await answer('Записал');
    await record(chatId, user, friend, 'return', balance, '', deps);
    return edit(...await friendView(friend, deps));
  }
  if (action === 'part' || action === 'more') {
    await deps.store.setPending(user.id, { kind: action, friendId: id });
    await answer();
    return deps.tg.send(chatId, action === 'part'
      ? `↩️ Сколько вернул(а) ${esc(friend.name)}? Напиши сумму, например <code>300</code>.`
      : `➕ Сколько ещё дал(а) ${esc(friend.name)}? Напиши сумму — можно с пометкой: <code>300 такси</code>.`);
  }
  if (action === 'undo') {
    const last = await deps.store.undoOp(id);
    if (!last) return answer('Отменять нечего', true);
    await answer(`Отменил: ${last.kind === 'lend' ? '➕' : '↩️'} ${money(last.amount)}`);
    if (friend.linkedUserId) {
      await deps.tg.send(friend.linkedUserId, `📒 ${esc(userName(user))} отменил(а) запись ${last.kind === 'lend' ? '➕' : '↩️'} ${money(last.amount)}. Ты должен(а): <b>${money(Math.max((await owed(deps, id)).total, 0))}</b>`);
    }
    return edit(...await friendView(friend, deps));
  }
  if (action === 'link') {
    await answer();
    return deps.tg.send(chatId, `🔗 Ссылка для ${esc(friend.name)} — перешли её:\n${friendLink(deps, friend)}\n\nОткрыв её, ${esc(friend.name)} увидит свой долг, будет получать напоминания и сможет нажать «я вернул».`);
  }
  if (action === 'nudge') {
    const balance = (await owed(deps, id)).total;
    if (balance <= 0) return answer(`${friend.name} ничего не должен(а)`, true);
    if (!friend.linkedUserId) {
      await answer();
      return deps.tg.send(chatId, `🔔 ${esc(friend.name)} ещё не подключён(а) к боту — напомнить сам я не могу. Перешли ему/ей ссылку, и дальше напоминания будут приходить:\n${friendLink(deps, friend)}\n\nИли просто перешли это:\n<i>Привет! Напоминаю про долг ${money(balance)} 🙂</i>`);
    }
    await nudgeFriend(friend, user, deps);
    return answer(`Напомнил ${friend.name}`);
  }
  if (action === 'del') {
    await answer();
    return edit(`🗑 Удалить ${esc(friend.name)} и всю историю?`, {
      inline_keyboard: [[{ text: '🗑 Да, удалить', callback_data: `del!:${id}` }, { text: '↩️ Нет', callback_data: `f:${id}` }]],
    });
  }
  if (action === 'del!') {
    await deps.store.removeFriend(id);
    await answer(`${friend.name} удалён(а)`);
    return edit(...await listView(user.id, deps));
  }
  return answer();
}

/** Напоминание подключённому другу (с кнопкой «я вернул»). */
export async function nudgeFriend(friend, owner, deps) {
  const d = await owed(deps, friend.id);
  const status = statusLine(d, deps.now());
  await deps.tg.send(friend.linkedUserId, `🔔 ${esc(userName(owner))} напоминает: ты должен(а) <b>${totalText(d)}</b>.${status ? `\n${status}` : ''}`, {
    inline_keyboard: [[{ text: `💸 Я вернул(а) ${money(d.total)}`, callback_data: `paid:${friend.id}` }]],
  });
}

/** Друг говорит, что вернул всё → спрашиваем владельца. Возвращает сумму или 0, если долга нет. */
export async function askPaid(friend, deps) {
  const balance = (await owed(deps, friend.id)).total;
  if (balance <= 0) return 0;
  await deps.tg.send(friend.ownerId, `💸 ${esc(friend.name)} говорит, что вернул(а) <b>${money(balance)}</b>. Подтвердить?`, {
    inline_keyboard: [[
      { text: '✅ Да, вернул(а)', callback_data: `ok:${friend.id}:${balance}` },
      { text: '❌ Нет', callback_data: `nope:${friend.id}:${balance}` },
    ]],
  });
  return balance;
}

/** Друг нажал «я вернул» — спрашиваем владельца. */
async function paidAction(friend, user, answer, edit, deps) {
  if (friend.linkedUserId !== user.id) return answer('Это не твой долг', true);
  const balance = await askPaid(friend, deps);
  if (balance <= 0) return answer('Ты уже ничего не должен(а) 🎉', true);
  await answer('Спросил — как подтвердит, напишу');
  return edit(`⏳ Спросил, подтвердит ли возврат ${money(balance)}. Как ответит — напишу.`);
}

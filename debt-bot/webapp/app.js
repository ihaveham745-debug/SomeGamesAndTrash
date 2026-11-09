// Mini App «Тетрадка долгов». Данные — через эндпоинты (tgcloud/endpoints/*.js → lib/api.js),
// долг с процентами считаем тем же lib/loans.js, что и бот (при сборке копируется в dist/lib/).

import { DAY, debtOf, ratePercent, rateText } from './lib/loans.js';
import { money, parseAmount, shortDate } from './lib/money.js';

const tg = window.Telegram?.WebApp;
const app = document.getElementById('app');
const COLORS = ['#e17055', '#0984e3', '#00b894', '#6c5ce7', '#fdcb6e', '#e84393', '#00cec9', '#d35400'];

let data = null; // ответ state
let tab = 'owed';
let openFriendId = null;

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const nowSec = () => Math.floor(Date.now() / 1000);

function call(name, input = {}) {
  return new Promise((resolve, reject) => {
    if (!tg?.Serverless) return reject(new Error('Открой приложение из Telegram'));
    tg.Serverless.call(name, input, (err, result) => (err ? reject(err) : resolve(result)));
  });
}

function haptic(kind = 'light') {
  try { tg?.HapticFeedback?.impactOccurred(kind); } catch { /* вне Telegram */ }
}

function toast(text) {
  const el = document.getElementById('toast');
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove('show'), 2400);
}

function confirmBox(text) {
  return new Promise((resolve) => {
    if (tg?.showConfirm && tg.platform !== 'unknown') tg.showConfirm(text, resolve);
    else resolve(window.confirm(text));
  });
}

function avatar(name) {
  let h = 0;
  for (const c of name) h = (h * 31 + c.codePointAt(0)) >>> 0;
  return `<span class="avatar" style="background:${COLORS[h % COLORS.length]}">${esc(name.trim()[0]?.toUpperCase() ?? '?')}</span>`;
}

/** Ближайший конец беспроцентного периода → текст и «горит ли». */
function statusOf(d, now) {
  if (d.total <= 0) return { text: d.total < 0 ? `переплата ${money(-d.total)}` : 'вернул(а) всё', warn: false };
  if (d.perDay > 0) return { text: `капает ${money(d.perDay)} в день`, warn: true };
  const next = d.loans.filter((l) => (l.apr || l.rate) && l.left > 0 && l.due > now).sort((a, b) => a.due - b.due)[0];
  if (!next) return { text: 'без процентов', warn: false };
  const days = Math.ceil((next.due - now) / DAY);
  return { text: `без % ещё ${days} ${plural(days, 'день', 'дня', 'дней')} · до ${shortDate(next.due - 1)}`, warn: days <= 3 };
}

function plural(n, one, few, many) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

const friendsWithDebt = () => data.friends.map((f) => ({ ...f, d: debtOf(f.ops, nowSec()) }));

// --- Экраны ---

function render() {
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('on', t.dataset.tab === tab));
  if (!data) return;
  if (openFriendId && !data.friends.some((f) => f.id === openFriendId)) openFriendId = null;
  if (tab === 'owed' && openFriendId) friendScreen();
  else if (tab === 'owed') owedScreen();
  else mineScreen();
  if (tg?.BackButton) (openFriendId && tab === 'owed' ? tg.BackButton.show() : tg.BackButton.hide());
}

function owedScreen() {
  const now = nowSec();
  const all = friendsWithDebt();
  const owing = all.filter((f) => f.d.total !== 0).sort((a, b) => b.d.total - a.d.total);
  const closed = all.filter((f) => f.d.total === 0);
  const total = owing.reduce((s, f) => s + Math.max(f.d.total, 0), 0);
  const interest = owing.reduce((s, f) => s + f.d.interest, 0);
  const perDay = owing.reduce((s, f) => s + f.d.perDay, 0);

  const row = (f) => {
    const st = statusOf(f.d, now);
    return `<button class="row" type="button" data-friend="${f.id}">
      ${avatar(f.name)}
      <span class="main"><span class="name">${esc(f.name)}${f.linked ? ' 🔗' : ''}</span>
        <span class="status${st.warn ? ' warn' : ''}">${esc(st.text)}</span></span>
      <span class="amount${f.d.total === 0 ? ' done' : st.warn ? ' warn' : ''}">${f.d.total === 0 ? '✓' : money(f.d.total)}</span>
    </button>`;
  };

  const requests = data.requests.length ? `<div class="section-title">Заявки</div><div class="list">${data.requests.map((r) => `
      <div class="item request">
        <div class="line"><span>${avatar(r.name)} <b>${esc(r.name)}</b> просит</span><b>${money(r.amount)}</b></div>
        <div class="meta">${r.note ? `${esc(r.note)} · ` : ''}${esc(askTermsText(r.terms, data.terms))}${owesText(r)}</div>
        <div class="row-btns"><button class="btn secondary" type="button" data-decide="${r.id}" data-approve="0">Отказать</button>
          <button class="btn" type="button" data-decide="${r.id}" data-approve="1">Одобрить</button></div>
      </div>`).join('')}</div>` : '';
  const invite = '<button class="invite" type="button" data-action="invite">📨 Ссылка для заявок — пусть друзья просят сами</button>';

  app.innerHTML = all.length === 0
    ? `${requests}<div class="empty"><div class="big">📒</div><b>Тетрадка пустая</b>Нажми «Дать в долг» — или дай друзьям ссылку для заявок.</div>${invite}${bottomButton()}`
    : `${requests}<section class="summary">
        <div class="label">Тебе должны</div>
        <div class="total">${money(total)}</div>
        <div class="sub">${interest > 0 ? `из них проценты ${money(interest)}` : 'процентов пока нет'}${perDay > 0 ? ` · +${money(perDay)} в день` : ''}</div>
      </section>
      ${owing.length ? `<div class="list">${owing.map(row).join('')}</div>` : ''}
      ${closed.length ? `<div class="section-title">Вернули всё</div><div class="list">${closed.map(row).join('')}</div>` : ''}
      ${invite}
      ${bottomButton()}`;
}

/** Условия, которые попросил друг: «на 14 дн.» / «до 25.11» / обычные. */
function askTermsText(terms, base) {
  if (terms?.free) return 'просит без процентов';
  if (terms?.until) return `без % до ${terms.until}`;
  const days = terms?.days ?? base.graceDays;
  return base.apr > 0 ? `без % ${days} дн., потом ${ratePercent(base.apr)} годовых` : 'без процентов';
}

/** « · уже должен 300 ₽» — если друг подключён и должен. */
function owesText(r) {
  const f = r.friendId && data.friends.find((x) => x.id === r.friendId);
  const total = f ? debtOf(f.ops, nowSec()).total : 0;
  return total > 0 ? ` · уже должен ${money(total)}` : '';
}

const bottomButton = () => '<div class="bottom"><button class="btn" type="button" data-action="lend">＋ Дать в долг</button></div>';

function friendScreen() {
  const now = nowSec();
  const f = friendsWithDebt().find((x) => x.id === openFriendId);
  const d = f.d;
  const st = statusOf(d, now);
  const loans = d.total > 0 ? d.loans.map((l) => {
    const overdue = l.overdue;
    const meta = !l.apr && !l.rate ? 'без процентов'
      : overdue ? `${rateText(l)} с ${shortDate(l.apr != null ? l.at : l.due)}${l.interest ? ` · набежало ${money(l.interest)}` : ''}`
        : `без % до ${shortDate(l.due - 1)}${l.risk ? ` · не вернёт всё — набежит ${money(l.risk)}` : `, потом ${rateText(l)}`}`;
    return `<div class="item"><div class="line"><span>${money(l.left)}${l.left !== l.amount ? ` <span class="meta">из ${money(l.amount)}</span>` : ''}</span><span class="meta">от ${shortDate(l.at)}</span></div>
      <div class="meta${overdue ? ' warn' : ''}">${l.note ? `${esc(l.note)} · ` : ''}${esc(meta)}</div></div>`;
  }).join('') : '';
  const history = [...f.ops].reverse().map((o) => `<div class="item"><div class="line">
      <span class="${o.kind === 'lend' ? 'plus' : 'minus'}">${o.kind === 'lend' ? '＋' : '−'} ${money(o.amount)}</span>
      <span class="meta">${shortDate(o.at)}</span></div>${o.note ? `<div class="meta">${esc(o.note)}</div>` : ''}</div>`).join('');

  app.innerHTML = `
    <section class="friend-head">
      ${avatar(f.name)}
      <h2>${esc(f.name)}</h2>
      <div class="total">${d.total < 0 ? `−${money(-d.total)}` : money(d.total)}</div>
      ${d.interest > 0 ? `<div class="interest">в т.ч. проценты ${money(d.interest)}</div>` : ''}
      <span class="badge${st.warn ? ' warn' : d.total === 0 ? ' ok' : ''}">${esc(st.text)}</span>
    </section>
    <div class="actions">
      <button class="action" type="button" data-action="repay-all" ${d.total > 0 ? '' : 'disabled'}><span class="ic">✅</span>Вернул всё</button>
      <button class="action" type="button" data-action="repay" ${d.total > 0 ? '' : 'disabled'}><span class="ic">↩️</span>Вернул часть</button>
      <button class="action" type="button" data-action="lend-more"><span class="ic">➕</span>Дал ещё</button>
      <button class="action" type="button" data-action="nudge" ${d.total > 0 ? '' : 'disabled'}><span class="ic">🔔</span>Напомнить</button>
      <button class="action" type="button" data-action="share"><span class="ic">🔗</span>${f.linked ? 'Подключён' : 'Ссылка'}</button>
      <button class="action" type="button" data-action="undo" ${f.ops.length ? '' : 'disabled'}><span class="ic">↶</span>Отменить</button>
    </div>
    ${loans ? `<div class="section-title">Займы</div><div class="list">${loans}</div>` : ''}
    <div class="section-title">История</div>
    <div class="list">${history || '<div class="item meta">записей нет</div>'}</div>
    <button class="danger-link" type="button" data-action="remove">Удалить из тетрадки вместе с историей</button>`;
}

function mineScreen() {
  const now = nowSec();
  const rows = data.mine.map((m) => ({ ...m, d: debtOf(m.ops, now) }));
  const owing = rows.filter((m) => m.d.total > 0);
  const total = owing.reduce((s, m) => s + m.d.total, 0);
  const waiting = data.myRequests.length ? `<div class="section-title">Мои заявки</div><div class="list">${data.myRequests.map((r) => `
    <div class="item"><div class="line"><span>⏳ ${esc(r.ownerName)}</span><b>${money(r.amount)}</b></div>
      <div class="meta">${r.note ? `${esc(r.note)} · ` : ''}ждёт ответа</div></div>`).join('')}</div>` : '';
  const card = (m) => {
    const st = statusOf(m.d, now);
    const asked = data.myRequests.some((r) => r.ownerId === m.ownerId);
    return `<div class="row">
        ${avatar(m.ownerName)}
        <span class="main"><span class="name">${esc(m.ownerName)}</span>
          <span class="status${st.warn ? ' warn' : ''}">${m.d.total > 0 ? `${esc(st.text)}${m.d.interest ? ` · проценты ${money(m.d.interest)}` : ''}` : 'ничего не должен'}</span></span>
        <span class="amount${st.warn && m.d.total > 0 ? ' warn' : m.d.total > 0 ? '' : ' done'}">${m.d.total > 0 ? money(m.d.total) : '✓'}</span>
      </div>
      <div class="item row-btns">
        ${m.d.total > 0 ? `<button class="btn secondary" type="button" data-paid="${m.friendId}">💸 Я вернул</button>` : ''}
        ${asked ? '' : `<button class="btn secondary" type="button" data-ask="${m.ownerId}">🙋 Попросить</button>`}
      </div>`;
  };
  app.innerHTML = rows.length === 0 && !waiting
    ? `<div class="empty"><div class="big">🙈</div><b>Ты никому не должен</b>Чтобы попросить в долг, открой ссылку для заявок от друга, который ведёт здесь тетрадку.</div>`
    : `${owing.length ? `<section class="summary mine"><div class="label">Ты должен</div><div class="total">${money(total)}</div>
        <div class="sub">${owing.length} ${plural(owing.length, 'человеку', 'людям', 'людям')}</div></section>` : ''}
      ${waiting}
      ${rows.length ? `<div class="section-title">Тетрадки друзей</div><div class="list">${rows.map(card).join('')}</div>` : ''}`;
}

// --- Шторки ---

function sheet(html, onReady) {
  closeSheet();
  const root = document.createElement('div');
  root.className = 'backdrop';
  root.innerHTML = `<form class="sheet" autocomplete="off" novalidate><div class="grab"></div>${html}</form>`;
  document.body.append(root);
  root.addEventListener('click', (e) => {
    if (e.target === root || e.target.closest('[data-close]')) closeSheet();
  });
  onReady(root.querySelector('form'));
}

function closeSheet() {
  document.querySelector('.backdrop')?.remove();
}

async function submit(form, action) {
  const error = form.querySelector('.error');
  const btn = form.querySelector('[type="submit"]');
  error.textContent = '';
  btn.disabled = true;
  try {
    await action();
    closeSheet();
    try { tg?.HapticFeedback?.notificationOccurred('success'); } catch { /* вне Telegram */ }
  } catch (err) {
    error.textContent = err?.message || 'Не получилось — попробуй ещё раз';
    btn.disabled = false;
  }
}

/**
 * «Дать в долг»: имя (или друг из карточки), сумма, пометка, условия.
 * ask — «Попросить в долг» у владельца тетрадки (запись из data.mine): та же шторка, но уходит заявка.
 */
function lendSheet(friend = null, ask = null) {
  const t = ask ? ask.ownerTerms : data.terms;
  const known = data.friends.slice(0, 12);
  sheet(`
    <h3>${ask ? `Попросить у ${esc(ask.ownerName)}` : friend ? `Ещё в долг: ${esc(friend.name)}` : 'Дать в долг'}</h3>
    ${friend || ask ? '' : `<label class="field"><span>Кому</span><input class="input" name="name" maxlength="40" placeholder="Имя"></label>
      ${known.length ? `<div class="chips" style="margin:-4px 0 12px">${known.map((f) => `<button class="chip" type="button" data-name="${esc(f.name)}">${esc(f.name)}</button>`).join('')}</div>` : ''}`}
    <label class="field"><span>Сколько, ₽</span><input class="input amount" name="amount" inputmode="decimal" placeholder="0"></label>
    <label class="field"><span>За что (необязательно)</span><input class="input" name="note" maxlength="100" placeholder="пицца, такси…"></label>
    <div class="field"><span>Без процентов</span>
      <div class="chips" data-terms>
        <button class="chip on" type="button" data-days="">${t.graceDays} дн. (обычно)</button>
        ${[7, 14, 30].filter((n) => n !== t.graceDays).map((n) => `<button class="chip" type="button" data-days="${n}">${n} дн.</button>`).join('')}
        <button class="chip" type="button" data-until>до даты</button>
        ${ask ? '' : '<button class="chip" type="button" data-free>совсем без %</button>'}
      </div>
      <input class="input" type="date" name="until" style="display:none;margin-top:8px">
    </div>
    <div class="preview"></div>
    <div class="error" role="alert"></div>
    <button class="btn" type="submit">${ask ? 'Отправить заявку' : 'Записать'}</button>`, (form) => {
    let choice = { kind: 'default' };
    const preview = form.querySelector('.preview');
    const update = () => {
      const now = nowSec();
      let text;
      if (choice.kind === 'free' || t.apr === 0) text = 'без процентов';
      else {
        const due = choice.kind === 'until' && form.until.value
          ? Date.parse(`${form.until.value}T00:00:00+09:00`) / 1000 + DAY
          : now + (choice.kind === 'days' ? choice.days : t.graceDays) * DAY;
        text = `без процентов до ${shortDate(due - 1)}; не вернёт всё к этому дню — ${ratePercent(t.apr)} годовых за весь срок`;
      }
      preview.textContent = `⏳ ${text}`;
    };
    form.querySelector('[data-terms]').addEventListener('click', (e) => {
      const chip = e.target.closest('.chip');
      if (!chip) return;
      form.querySelectorAll('[data-terms] .chip').forEach((c) => c.classList.toggle('on', c === chip));
      if (chip.dataset.free !== undefined) choice = { kind: 'free' };
      else if (chip.dataset.until !== undefined) choice = { kind: 'until' };
      else choice = chip.dataset.days ? { kind: 'days', days: Number(chip.dataset.days) } : { kind: 'default' };
      form.until.style.display = choice.kind === 'until' ? 'block' : 'none';
      if (choice.kind === 'until') form.until.focus();
      update();
    });
    form.until.addEventListener('change', update);
    form.querySelectorAll('[data-name]').forEach((b) => b.addEventListener('click', () => { form.name.value = b.dataset.name; form.amount.focus(); }));
    update();
    (friend || ask ? form.amount : form.name).focus();
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const amount = parseAmount(form.amount.value);
      const error = form.querySelector('.error');
      if (!friend && !ask && !form.name.value.trim()) return void (error.textContent = 'Напиши, кому');
      if (!amount) return void (error.textContent = 'Напиши сумму, например 500');
      let terms = null;
      if (choice.kind === 'free') terms = { free: true };
      if (choice.kind === 'days') terms = { days: choice.days };
      if (choice.kind === 'until') {
        if (!form.until.value) return void (error.textContent = 'Выбери дату');
        const [, m, d] = form.until.value.split('-');
        terms = { until: `${d}.${m}` };
      }
      submit(form, async () => {
        if (ask) {
          data = await call('ask', { ownerId: ask.ownerId, amount, note: form.note.value, terms });
          toast(`📨 Заявка отправлена ${ask.ownerName}`);
        } else {
          data = await call('lend', { ...(friend ? { friendId: friend.id } : { name: form.name.value }), amount, note: form.note.value, terms });
          toast(`Записал: ${money(amount)}`);
        }
        render();
      });
    });
  });
}

function repaySheet(friend) {
  const d = debtOf(friend.ops, nowSec());
  sheet(`
    <h3>${esc(friend.name)} вернул(а)</h3>
    <label class="field"><span>Сколько, ₽ (из ${money(d.total)})</span><input class="input amount" name="amount" inputmode="decimal" placeholder="0"></label>
    <p class="hint-text" style="margin-top:-4px;margin-bottom:12px">Сначала гасятся проценты, потом сам долг — со старых займов.</p>
    <div class="error" role="alert"></div>
    <div class="row-btns"><button class="btn secondary" type="button" data-close>Отмена</button><button class="btn" type="submit">Записать</button></div>`, (form) => {
    form.amount.focus();
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const amount = parseAmount(form.amount.value);
      if (!amount) return void (form.querySelector('.error').textContent = 'Напиши сумму');
      submit(form, async () => {
        data = await call('repay', { friendId: friend.id, amount });
        toast(`Вернули ${money(amount)}`);
        render();
      });
    });
  });
}

function termsSheet() {
  const t = data.terms;
  sheet(`
    <h3>Условия займов</h3>
    <label class="field"><span>Дней без процентов</span><input class="input" name="days" inputmode="numeric" value="${t.graceDays}"></label>
    <label class="field"><span>Процентов годовых, если не вернул всё вовремя</span><input class="input" name="apr" inputmode="decimal" value="${String(t.apr / 100).replace('.', ',')}"></label>
    <div class="preview"></div>
    <div class="error" role="alert"></div>
    <button class="btn" type="submit">Сохранить</button>
    <p class="hint-text">Как у кредитки: вернул займ целиком до конца периода — 0%. Не вернул — проценты за весь срок с первого дня и дальше, пока не вернёт. Для новых займов; старые остаются на своих условиях. 0 — без процентов вообще.</p>`, (form) => {
    const preview = form.querySelector('.preview');
    const read = () => ({ graceDays: Number(form.days.value), apr: Math.round(Number(form.apr.value.replace(',', '.')) * 100) });
    const update = () => {
      const { graceDays, apr } = read();
      // пример: 1000 ₽ вернули через 10 дней после конца льготного периода — проценты за весь срок
      const days = graceDays + 10;
      preview.textContent = Number.isFinite(apr) && apr > 0 && Number.isInteger(graceDays)
        ? `1 000 ₽: вернул за ${graceDays} дн. — 1 000 ₽; через ${days} дн. — ${money(100000 + Math.round(100000 * apr / 10000 / 365 * days))}`
        : '';
    };
    form.addEventListener('input', update);
    update();
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      submit(form, async () => {
        data = await call('setTerms', read());
        toast('Сохранил');
        render();
      });
    });
  });
}

// --- Действия ---

async function act(action) {
  const friend = data.friends.find((f) => f.id === openFriendId);
  if (action === 'lend') return lendSheet();
  if (action === 'terms') return termsSheet();
  if (action === 'invite') return shareLink(data.inviteLink, 'Если нужно в долг — открой и напиши, сколько 🙂');
  if (!friend) return undefined;
  if (action === 'lend-more') return lendSheet(friend);
  if (action === 'repay') return repaySheet(friend);
  if (action === 'repay-all') {
    const total = debtOf(friend.ops, nowSec()).total;
    if (!(await confirmBox(`${friend.name} вернул(а) всё — ${money(total)}?`))) return undefined;
    data = await call('repay', { friendId: friend.id });
    toast('🎉 Долг закрыт');
    return render();
  }
  if (action === 'undo') {
    const last = friend.ops.at(-1);
    if (!(await confirmBox(`Отменить последнюю запись: ${last.kind === 'lend' ? '＋' : '−'} ${money(last.amount)}?`))) return undefined;
    data = await call('undo', { friendId: friend.id });
    toast('Отменил');
    return render();
  }
  if (action === 'remove') {
    if (!(await confirmBox(`Удалить ${friend.name} и всю историю?`))) return undefined;
    data = await call('removeFriend', { friendId: friend.id });
    openFriendId = null;
    return render();
  }
  if (action === 'nudge') {
    const res = await call('nudge', { friendId: friend.id });
    if (res.sent) return toast(`🔔 Напомнил ${friend.name}`);
    toast(`${friend.name} ещё не подключён — отправь ссылку`);
    return share(friend);
  }
  if (action === 'share') return share(friend);
  return undefined;
}

function share(friend) {
  shareLink(friend.link, 'Это моя тетрадка долгов — тут видно, сколько ты должен 🙂');
}

function shareLink(link, text) {
  const url = `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(text)}`;
  if (tg?.openTelegramLink && tg.platform !== 'unknown') tg.openTelegramLink(url);
  else window.open(url, '_blank');
}

app.addEventListener('click', async (e) => {
  const el = e.target.closest('button');
  if (!el || el.disabled) return;
  haptic();
  try {
    if (el.dataset.friend) {
      openFriendId = Number(el.dataset.friend);
      render();
      window.scrollTo(0, 0);
      return;
    }
    if (el.dataset.decide) {
      const approve = el.dataset.approve === '1';
      const r = data.requests.find((x) => x.id === Number(el.dataset.decide));
      if (!approve && !(await confirmBox(`Отказать ${r?.name ?? ''}?`))) return;
      el.disabled = true;
      data = await call('decide', { requestId: Number(el.dataset.decide), approve });
      toast(approve ? `✅ Одобрено — записал ${money(r?.amount ?? 0)}` : 'Отказано');
      render();
      return;
    }
    if (el.dataset.ask) {
      lendSheet(null, data.mine.find((m) => m.ownerId === Number(el.dataset.ask)));
      return;
    }
    if (el.dataset.paid) {
      const res = await call('paid', { friendId: Number(el.dataset.paid) });
      toast(`Спросил — подтвердит возврат ${money(res.asked)}`);
      return;
    }
    if (el.dataset.action) await act(el.dataset.action);
  } catch (err) {
    toast(err?.message || 'Не получилось');
  }
});

document.querySelector('.top').addEventListener('click', (e) => {
  const el = e.target.closest('button');
  if (!el) return;
  haptic();
  if (el.dataset.tab) {
    tab = el.dataset.tab;
    openFriendId = null;
    render();
  }
  if (el.dataset.action === 'terms' && data) termsSheet();
});

tg?.BackButton?.onClick(() => {
  if (document.querySelector('.backdrop')) return closeSheet();
  openFriendId = null;
  return render();
});

async function load() {
  try {
    data = await call('state');
    // открыли по ссылке друга или из «я должен» — сразу на нужную вкладку
    if (data.friends.length === 0 && data.mine.length > 0) tab = 'mine';
    render();
  } catch (err) {
    app.innerHTML = `<div class="empty"><div class="big">😕</div><b>Не загрузилось</b>${esc(err?.message || '')}</div>`;
  }
}

if (tg) {
  tg.ready();
  tg.expand();
}
load();
// вернулись в приложение — обновим (друг мог вернуть, проценты подросли)
document.addEventListener('visibilitychange', () => { if (!document.hidden && data) load(); });

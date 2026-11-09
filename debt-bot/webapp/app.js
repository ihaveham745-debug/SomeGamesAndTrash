// Mini App «Тетрадка долгов». Данные — через эндпоинты (tgcloud/endpoints/*.js → lib/api.js),
// долг с процентами считаем тем же lib/loans.js, что и бот (при сборке копируется в dist/lib/).

import { DAY, debtOf, ratePercent } from './lib/loans.js';
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
  const next = d.loans.filter((l) => l.rate > 0 && l.left > 0 && l.due > now).sort((a, b) => a.due - b.due)[0];
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

  app.innerHTML = all.length === 0
    ? `<div class="empty"><div class="big">📒</div><b>Тетрадка пустая</b>Нажми «Дать в долг» — или напиши боту «Петя 500».</div>${bottomButton()}`
    : `<section class="summary">
        <div class="label">Тебе должны</div>
        <div class="total">${money(total)}</div>
        <div class="sub">${interest > 0 ? `из них проценты ${money(interest)}` : 'процентов пока нет'}${perDay > 0 ? ` · +${money(perDay)} в день` : ''}</div>
      </section>
      ${owing.length ? `<div class="list">${owing.map(row).join('')}</div>` : ''}
      ${closed.length ? `<div class="section-title">Вернули всё</div><div class="list">${closed.map(row).join('')}</div>` : ''}
      ${bottomButton()}`;
}

const bottomButton = () => '<div class="bottom"><button class="btn" type="button" data-action="lend">＋ Дать в долг</button></div>';

function friendScreen() {
  const now = nowSec();
  const f = friendsWithDebt().find((x) => x.id === openFriendId);
  const d = f.d;
  const st = statusOf(d, now);
  const loans = d.total > 0 ? d.loans.map((l) => {
    const overdue = l.rate > 0 && now > l.due;
    const meta = l.rate === 0 ? 'без процентов'
      : overdue ? `${ratePercent(l.rate)} в день с ${shortDate(l.due)}${l.interest ? ` · набежало ${money(l.interest)}` : ''}`
        : `без % до ${shortDate(l.due - 1)}, потом ${ratePercent(l.rate)} в день`;
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
  const rows = data.mine.map((m) => ({ ...m, d: debtOf(m.ops, now) })).filter((m) => m.d.total > 0);
  const total = rows.reduce((s, m) => s + m.d.total, 0);
  app.innerHTML = rows.length === 0
    ? `<div class="empty"><div class="big">🙈</div><b>Ты никому не должен</b>Если друг ведёт здесь тетрадку и пришлёт тебе ссылку — твой долг появится тут.</div>`
    : `<section class="summary mine"><div class="label">Ты должен</div><div class="total">${money(total)}</div>
        <div class="sub">${rows.length} ${plural(rows.length, 'человеку', 'людям', 'людям')}</div></section>
      <div class="list">${rows.map((m) => {
        const st = statusOf(m.d, now);
        return `<div class="row">
          ${avatar(m.ownerName)}
          <span class="main"><span class="name">${esc(m.ownerName)}</span>
            <span class="status${st.warn ? ' warn' : ''}">${esc(st.text)}${m.d.interest ? ` · проценты ${money(m.d.interest)}` : ''}</span></span>
          <span class="amount${st.warn ? ' warn' : ''}">${money(m.d.total)}</span>
        </div>
        <div class="item"><button class="btn secondary" type="button" data-paid="${m.friendId}">💸 Я вернул ${money(m.d.total)}</button></div>`;
      }).join('')}</div>`;
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

/** «Дать в долг»: имя (или друг из карточки), сумма, пометка, условия. */
function lendSheet(friend = null) {
  const t = data.terms;
  const known = data.friends.slice(0, 12);
  sheet(`
    <h3>${friend ? `Ещё в долг: ${esc(friend.name)}` : 'Дать в долг'}</h3>
    ${friend ? '' : `<label class="field"><span>Кому</span><input class="input" name="name" maxlength="40" placeholder="Имя"></label>
      ${known.length ? `<div class="chips" style="margin:-4px 0 12px">${known.map((f) => `<button class="chip" type="button" data-name="${esc(f.name)}">${esc(f.name)}</button>`).join('')}</div>` : ''}`}
    <label class="field"><span>Сколько, ₽</span><input class="input amount" name="amount" inputmode="decimal" placeholder="0"></label>
    <label class="field"><span>За что (необязательно)</span><input class="input" name="note" maxlength="100" placeholder="пицца, такси…"></label>
    <div class="field"><span>Без процентов</span>
      <div class="chips" data-terms>
        <button class="chip on" type="button" data-days="">${t.graceDays} дн. (обычно)</button>
        ${[7, 14, 30].filter((n) => n !== t.graceDays).map((n) => `<button class="chip" type="button" data-days="${n}">${n} дн.</button>`).join('')}
        <button class="chip" type="button" data-until>до даты</button>
        <button class="chip" type="button" data-free>совсем без %</button>
      </div>
      <input class="input" type="date" name="until" style="display:none;margin-top:8px">
    </div>
    <div class="preview"></div>
    <div class="error" role="alert"></div>
    <button class="btn" type="submit">Записать</button>`, (form) => {
    let choice = { kind: 'default' };
    const preview = form.querySelector('.preview');
    const update = () => {
      const now = nowSec();
      let text;
      if (choice.kind === 'free' || t.rate === 0) text = 'без процентов';
      else {
        const due = choice.kind === 'until' && form.until.value
          ? Date.parse(`${form.until.value}T00:00:00+09:00`) / 1000 + DAY
          : now + (choice.kind === 'days' ? choice.days : t.graceDays) * DAY;
        text = `без процентов до ${shortDate(due - 1)}, потом ${ratePercent(t.rate)} в день от остатка`;
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
    (friend ? form.amount : form.name).focus();
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const amount = parseAmount(form.amount.value);
      const error = form.querySelector('.error');
      if (!friend && !form.name.value.trim()) return void (error.textContent = 'Напиши, кому');
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
        data = await call('lend', { ...(friend ? { friendId: friend.id } : { name: form.name.value }), amount, note: form.note.value, terms });
        toast(`Записал: ${money(amount)}`);
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
    <label class="field"><span>Потом процентов в день от остатка</span><input class="input" name="rate" inputmode="decimal" value="${String(t.rate / 100).replace('.', ',')}"></label>
    <div class="preview"></div>
    <div class="error" role="alert"></div>
    <button class="btn" type="submit">Сохранить</button>
    <p class="hint-text">Для новых займов. Старые остаются на своих условиях. 0 — без процентов вообще.</p>`, (form) => {
    const preview = form.querySelector('.preview');
    const read = () => ({ graceDays: Number(form.days.value), rate: Math.round(Number(form.rate.value.replace(',', '.')) * 100) });
    const update = () => {
      const { graceDays, rate } = read();
      preview.textContent = Number.isFinite(rate) && rate > 0 && Number.isInteger(graceDays)
        ? `1 000 ₽ на ${graceDays + 10} дн. → вернуть ${money(100000 + Math.round(100000 * rate / 10000 * 10))}`
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
  const text = `Это моя тетрадка долгов — тут видно, сколько ты должен 🙂`;
  const url = `https://t.me/share/url?url=${encodeURIComponent(friend.link)}&text=${encodeURIComponent(text)}`;
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

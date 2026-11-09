// lib/loans — расчёт долга с беспроцентным периодом, как у кредитной карты. Без 'sdk' — проверяется тестами.
//
// Каждая выдача (op.kind 'lend') — отдельный займ. До op.due (unix) — беспроцентный период:
//   • вернули займ целиком до op.due — процентов нет совсем;
//   • не вернули — проценты за весь срок с первого дня (на остаток по дням) и дальше, пока не вернут.
// Ставка — op.apr: сотые процента годовых (6190 = 61,9% годовых, в день — 1/365 от неё).
// Старые займы (до «как у кредитки») — op.rate: сотые процента в день и только после op.due, без «задним числом».
// Возврат (op.kind 'return') гасит сначала набежавшие проценты, потом сам долг — с самых старых займов.
// Лишнее сверх долга — переплата (credit), её зачитываем в следующие займы.

export const DAY = 86400;
export const DEFAULT_TERMS = { graceDays: 55, apr: 6190 }; // как у кредитки Т-Банка: до 55 дней, потом 61,9% годовых
export const MAX_GRACE_DAYS = 366;
export const MAX_APR = 100000; // 1000% годовых

/** 6190 → '61,9%'; 100 → '1%'. */
export const ratePercent = (hundredths) => `${String(hundredths / 100).replace('.', ',')}%`;

/** Ставка займа словами: '61,9% годовых' или (старые займы) '1% в день'. */
export const rateText = (l) => (l.apr != null ? `${ratePercent(l.apr)} годовых` : `${ratePercent(l.rate)} в день`);

/** Доля в день: apr — годовых, rate — в день. */
const perDayOf = (op) => (op.apr != null ? op.apr / 10000 / 365 : (op.rate ?? 0) / 10000);

/**
 * Долг друга на момент now → {
 *   principal, interest, total  — копейки (округлены), total = principal + interest − credit, может быть < 0 (переплата);
 *   perDay  — сколько процентов капает в день сейчас;
 *   loans: [{ id, at, amount, note, due, apr, rate, left, interest, overdue, risk }] — непогашенные займы;
 *          risk — для займа в льготном периоде: сколько процентов начислят задним числом,
 *          если к due не вернуть его целиком (при нынешнем остатке).
 * }
 */
export function debtOf(ops, now) {
  const loans = [];
  let credit = 0;
  let clock = null;

  // проценты по займу за отрезок from → to с постоянным остатком
  const piece = (l, from, to) => (to > from && l.left > 0 ? (l.left * l.perDay * (to - from)) / DAY : 0);

  // проценты по всем займам за время clock → t (между событиями остаток не меняется)
  const accrue = (t) => {
    if (clock !== null && t > clock) {
      for (const l of loans) {
        if (l.perDay <= 0) continue;
        if (l.retro) {
          // льготный период: копим «теневые» проценты; к due — либо списываем (вернули всё), либо начисляем
          l.shadow += piece(l, clock, Math.min(t, l.due));
          if (t >= l.due && !l.settled) {
            l.settled = true;
            if (l.left > 0) l.interest += l.shadow;
            l.shadow = 0;
          }
          l.interest += piece(l, Math.max(clock, l.due), t);
        } else {
          l.interest += piece(l, Math.max(clock, l.due), t);
        }
      }
    }
    clock = clock === null ? t : Math.max(clock, t);
  };

  const sorted = [...ops].sort((a, b) => a.at - b.at || a.id - b.id);
  for (const op of sorted) {
    accrue(op.at);
    if (op.kind === 'lend') {
      const loan = {
        id: op.id, at: op.at, amount: op.amount, note: op.note ?? '', due: op.due ?? op.at,
        apr: op.apr ?? null, rate: op.apr != null ? null : op.rate ?? 0,
        perDay: perDayOf(op), retro: op.apr != null, settled: false, shadow: 0, left: op.amount, interest: 0,
      };
      const used = Math.min(credit, loan.left); // переплата гасит новый займ
      loan.left -= used;
      credit -= used;
      loans.push(loan);
    } else {
      let pay = op.amount;
      // проценты копятся с долями копейки — к моменту возврата округляем, чтобы долг остался в целых копейках
      for (const l of loans) l.interest = Math.round(l.interest);
      for (const l of loans) { // сначала проценты
        const p = Math.min(pay, l.interest);
        l.interest -= p;
        pay -= p;
      }
      for (const l of loans) { // потом долг
        const p = Math.min(pay, l.left);
        l.left -= p;
        pay -= p;
      }
      credit += pay;
    }
  }
  accrue(Math.max(now, clock ?? now));

  const open = loans.filter((l) => l.left > 0 || l.interest >= 0.5).map((l) => ({
    id: l.id, at: l.at, amount: l.amount, note: l.note, due: l.due, apr: l.apr, rate: l.rate, left: l.left,
    interest: Math.round(l.interest),
    overdue: now >= l.due && l.perDay > 0,
    risk: l.retro && now < l.due && l.left > 0 ? Math.round(l.shadow + piece(l, now, l.due)) : 0,
  }));
  const principal = open.reduce((s, l) => s + l.left, 0);
  const interest = open.reduce((s, l) => s + l.interest, 0);
  const perDay = Math.round(loans.filter((l) => now >= l.due).reduce((s, l) => s + l.left * l.perDay, 0));
  return { principal, interest, total: principal + interest - Math.round(credit), perDay, loans: open };
}

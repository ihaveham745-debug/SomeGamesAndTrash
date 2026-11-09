// lib/loans — расчёт долга с беспроцентным периодом. Без 'sdk' — проверяется тестами.
//
// Каждая выдача (op.kind 'lend') — отдельный займ: до op.due (unix) процентов нет,
// после — op.rate сотых процента в день от непогашенного остатка этого займа (простые проценты).
// Возврат (op.kind 'return') гасит сначала набежавшие проценты, потом сам долг — с самых старых займов.
// Лишнее сверх долга — переплата (credit), её зачитываем в следующие займы.

export const DAY = 86400;
export const DEFAULT_TERMS = { graceDays: 30, rate: 100 }; // 30 дней, потом 1% в день
export const MAX_GRACE_DAYS = 366;
export const MAX_RATE = 1000; // 10% в день

/** rate (сотые процента в день) → '1%', '0,5%'. */
export const ratePercent = (rate) => `${String(rate / 100).replace('.', ',')}%`;

/**
 * Долг друга на момент now → {
 *   principal, interest, total  — копейки (округлены), total = principal + interest − credit, может быть < 0 (переплата);
 *   perDay      — сколько процентов капает в день сейчас;
 *   loans: [{ id, at, amount, note, due, rate, left, interest, overdue }] — непогашенные займы;
 * }
 */
export function debtOf(ops, now) {
  const loans = [];
  let credit = 0;
  let clock = null;

  // проценты по всем займам за время clock → t
  const accrue = (t) => {
    if (clock !== null) {
      for (const l of loans) {
        const from = Math.max(clock, l.due);
        if (t > from && l.left > 0 && l.rate > 0) l.interest += (l.left * l.rate * (t - from)) / (10000 * DAY);
      }
    }
    clock = clock === null ? t : Math.max(clock, t);
  };

  const sorted = [...ops].sort((a, b) => a.at - b.at || a.id - b.id);
  for (const op of sorted) {
    accrue(op.at);
    if (op.kind === 'lend') {
      const loan = { id: op.id, at: op.at, amount: op.amount, note: op.note ?? '', due: op.due ?? op.at, rate: op.rate ?? 0, left: op.amount, interest: 0 };
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

  const open = loans.filter((l) => l.left > 0 || l.interest >= 0.5)
    .map((l) => ({ ...l, interest: Math.round(l.interest), overdue: now > l.due && l.rate > 0 }));
  const principal = open.reduce((s, l) => s + l.left, 0);
  const interest = open.reduce((s, l) => s + l.interest, 0);
  const perDay = Math.round(open.filter((l) => now >= l.due).reduce((s, l) => s + (l.left * l.rate) / 10000, 0));
  return { principal, interest, total: principal + interest - Math.round(credit), perDay, loans: open };
}

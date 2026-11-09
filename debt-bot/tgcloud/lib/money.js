// lib/money — суммы, даты и разбор записей вида «Петя 500 пицца». Без 'sdk' — проверяется тестами.
// Суммы храним в копейках (целые числа), показываем в рублях.

export const UTC_OFFSET_HOURS = 9; // Якутск
export const MAX_AMOUNT = 100_000_000_00; // 100 млн ₽ — больше точно опечатка

/** '500' → 50000; '1 500,50' → 150050; '2к' → 200000; '1.5k' → 150000; не сумма — null. */
export function parseAmount(text) {
  const m = /^(\d[\d\s]*(?:[.,]\d{1,2})?)\s*(к|k|тыс\.?)?\s*(?:р\.?|руб\.?|рублей|рубля|рубль|₽)?$/i.exec(String(text ?? '').trim());
  if (!m) return null;
  const rub = Number(m[1].replace(/\s/g, '').replace(',', '.')) * (m[2] ? 1000 : 1);
  const kop = Math.round(rub * 100);
  return kop > 0 && kop <= MAX_AMOUNT ? kop : null;
}

/** 150050 → '1 500,50 ₽'; 50000 → '500 ₽'. */
export function money(kop) {
  const sign = kop < 0 ? '−' : '';
  const abs = Math.abs(kop);
  const rub = Math.floor(abs / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const k = abs % 100;
  return `${sign}${rub}${k ? `,${String(k).padStart(2, '0')}` : ''} ₽`;
}

/** unix-секунды → '09.11' (по якутскому времени). */
export function shortDate(unix) {
  const d = new Date((unix + UTC_OFFSET_HOURS * 3600) * 1000);
  return `${String(d.getUTCDate()).padStart(2, '0')}.${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

const RETURN_WORDS = /^(вернул|вернула|вернули|отдал|отдала|отдали|возврат)$/i;
const AMOUNT_WORD = /^\d[\d.,]*(к|k|тыс\.?)?(р\.?|руб\.?|₽)?$/i;

/**
 * Запись текстом:
 *   'Петя 500'              → { kind: 'lend', name: 'Петя', amount: 50000, note: '' }
 *   'Петя Иванов 1 500 кино' → { kind: 'lend', name: 'Петя Иванов', amount: 150000, note: 'кино' }
 *   'Петя -200' / 'Петя вернул 200' → { kind: 'return', name: 'Петя', amount: 20000 }
 *   'Петя вернул'           → { kind: 'return', name: 'Петя', amount: null } — всё
 * У займа можно указать свои условия (см. parseTerms): 'Петя 500 кино на 14 дней' → terms: { days: 14 }.
 * Не запись — null.
 */
export function parseEntry(text) {
  const words = String(text ?? '').trim().split(/\s+/).filter(Boolean);
  if (words.length < 2) return null;
  let i = words.findIndex((w, idx) => idx > 0 && (AMOUNT_WORD.test(w) || /^[-−+]\d/.test(w) || RETURN_WORDS.test(w)));
  if (i < 1) return null;
  const name = words.slice(0, i).join(' ').replace(/[:,]$/, '');
  let kind = 'lend';
  if (RETURN_WORDS.test(words[i])) {
    kind = 'return';
    i += 1;
  } else if (/^[-−]/.test(words[i])) {
    kind = 'return';
    words[i] = words[i].slice(1);
  } else if (words[i].startsWith('+')) {
    words[i] = words[i].slice(1);
  }
  // сумма: одно слово или «1 500» (группы по 3 цифры)
  let amountText = words[i] ?? '';
  let next = i + 1;
  while (/^\d+$/.test(amountText.replace(/\s/g, '')) && /^\d{3}([.,]\d{1,2})?(к|k)?(р|₽)?$/i.test(words[next] ?? '')) {
    amountText += ` ${words[next]}`;
    next += 1;
  }
  if (/^(₽|р\.?|руб\.?|рублей|рубля)$/i.test(words[next] ?? '')) next += 1;
  const amount = amountText ? parseAmount(amountText) : null;
  if (amountText && amount === null) return null;
  if (amount === null && kind === 'lend') return null;
  if (!name || name.length > 40) return null;
  const { terms, rest } = parseTerms(words.slice(next));
  return { kind, name, amount, note: rest.join(' ').slice(0, 100), ...(terms && kind === 'lend' && { terms }) };
}

const DAYS_UNIT = [
  [/^(дн(я|ей|ь)?|д\.?|сут(ок|ки)?)$/i, 1],
  [/^недел(я|ю|и|ь)$/i, 7],
  [/^месяц(а|ев)?$/i, 30],
];

/**
 * Условия займа в конце записи, остальное — пометка:
 *   'на 14 дней' / 'на неделю' / 'на 2 месяца' → { days: 14 | 7 | 60 };
 *   'до 25.11' → { until: '25.11' };
 *   'без процентов' / 'без %' → { free: true }.
 */
export function parseTerms(words) {
  const rest = [];
  let terms = null;
  const add = (t) => { terms = { ...terms, ...t }; };
  for (let i = 0; i < words.length; i++) {
    const w = words[i].toLowerCase();
    const n = words[i + 1]?.toLowerCase();
    if (w === 'на' && n) {
      const unit = DAYS_UNIT.find(([re]) => re.test(n));
      if (unit) { add({ days: unit[1] }); i += 1; continue; }
      const count = /^\d{1,3}$/.test(n) ? Number(n) : null;
      const unit2 = count && DAYS_UNIT.find(([re]) => re.test(words[i + 2] ?? ''));
      if (unit2) { add({ days: count * unit2[1] }); i += 2; continue; }
    }
    if (w === 'до' && /^\d{1,2}\.\d{1,2}$/.test(n ?? '')) { add({ until: n }); i += 1; continue; }
    if (w === 'без' && /^(процентов|%|процента)$/.test(n ?? '')) { add({ free: true }); i += 1; continue; }
    rest.push(words[i]);
  }
  return { terms, rest };
}

/** '25.11' → unix-секунды конца этого дня по якутскому времени (ближайшая такая дата, не в прошлом); null — не дата. */
export function untilToUnix(ddmm, now) {
  const m = /^(\d{1,2})\.(\d{1,2})$/.exec(ddmm ?? '');
  if (!m) return null;
  const local = new Date((now + UTC_OFFSET_HOURS * 3600) * 1000);
  for (const year of [local.getUTCFullYear(), local.getUTCFullYear() + 1]) {
    const endUtc = Date.UTC(year, Number(m[2]) - 1, Number(m[1]) + 1) / 1000 - UTC_OFFSET_HOURS * 3600;
    const check = new Date(Date.UTC(year, Number(m[2]) - 1, Number(m[1])));
    if (check.getUTCDate() !== Number(m[1]) || check.getUTCMonth() !== Number(m[2]) - 1) return null;
    if (endUtc > now) return endUtc;
  }
  return null;
}

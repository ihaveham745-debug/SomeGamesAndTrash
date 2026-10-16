// Язык интерфейса: русский или английский. Строки пишем парой прямо в коде: t('Ставка', 'Bet').
// По умолчанию — язык Телеграма (русский для ru/uk/be/kk, иначе английский); выбор запоминаем.

const KEY = 'timeskip.lang';

function initial() {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === 'ru' || saved === 'en') return saved;
  } catch {
    // без хранилища
  }
  const code = window.Telegram?.WebApp?.initDataUnsafe?.user?.language_code ?? navigator.language ?? 'ru';
  return /^(ru|uk|be|kk)/i.test(code) ? 'ru' : 'en';
}

export let lang = initial();
document.documentElement.lang = lang;

export function setLang(next) {
  lang = next === 'en' ? 'en' : 'ru';
  document.documentElement.lang = lang;
  try {
    localStorage.setItem(KEY, lang);
  } catch {
    // без хранилища
  }
}

/** Строка на текущем языке. */
export const t = (ru, en) => (lang === 'en' ? en : ru);

/** Формат чисел под язык: «1 000» или «1,000». */
export const locale = () => (lang === 'en' ? 'en-US' : 'ru-RU');

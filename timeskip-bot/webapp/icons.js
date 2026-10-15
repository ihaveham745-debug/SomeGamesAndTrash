// Иконки и картинки интерфейса — только SVG (в шрифте нет мастей и стрелок, эмодзи не используем).

// Логотип: «перемотка вперёд».
export const LOGO = '<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><rect width="24" height="24" rx="6" fill="#2D6BFF"/><path d="M4.7 7v10l6.3-5zM11 7v10l6.3-5z" fill="#fff"/><rect x="17.3" y="7" width="2" height="10" rx="1" fill="#fff"/></svg>';
export const LOGO_MARK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.7 7v10l6.3-5zM11 7v10l6.3-5z" fill="#fff"/><rect x="17.3" y="7" width="2" height="10" rx="1" fill="#fff"/></svg>';

// Фишка — знак «валюты».
export const CHIP = '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="8" cy="8" r="2.6" fill="currentColor"/></svg>';

const ui = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;

export const ICON = {
  back: ui('<path d="M15 18l-6-6 6-6"/>'),
  next: ui('<path d="M9 6l6 6-6 6"/>'),
  down: ui('<path d="M6 9l6 6 6-6"/>'),
  undo: ui('<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>'),
  trash: ui('<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/>'),
  info: ui('<circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><circle cx="12" cy="7.8" r="1.1" fill="currentColor" stroke="none"/>'),
  alert: ui('<circle cx="12" cy="12" r="9"/><path d="M12 7.5V13"/><circle cx="12" cy="16.5" r="1.1" fill="currentColor" stroke="none"/>'),
};

// Масти (viewBox 24, fill currentColor). Ключи — символы мастей из lib/cards.js.
export const SUIT = {
  '♠': '<path d="M12 2.2C9.6 5.4 4 9.4 4 13.6 4 16.2 6 18 8.4 18c1.3 0 2.5-.6 3.1-1.5-.2 2.2-1 3.9-2.5 5.3h6c-1.5-1.4-2.3-3.1-2.5-5.3.6.9 1.8 1.5 3.1 1.5 2.4 0 4.4-1.8 4.4-4.4C20 9.4 14.4 5.4 12 2.2Z"/>',
  '♥': '<path d="M12 21.2C9.4 18.6 3 14.4 3 9 3 6 5.3 3.6 8.2 3.6c1.7 0 3 .8 3.8 2.1.8-1.3 2.1-2.1 3.8-2.1C18.7 3.6 21 6 21 9c0 5.4-6.4 9.6-9 12.2Z"/>',
  '♦': '<path d="M12 2c2.3 3.6 4.9 6.9 8 10-3.1 3.1-5.7 6.4-8 10-2.3-3.6-4.9-6.9-8-10 3.1-3.1 5.7-6.4 8-10Z"/>',
  '♣': '<circle cx="12" cy="7.3" r="4.3"/><circle cx="7.1" cy="13.6" r="4.3"/><circle cx="16.9" cy="13.6" r="4.3"/><path d="M11 12h2c0 4.2.8 7.2 2.8 9.8H8.2C10.2 19.2 11 16.2 11 12Z"/>',
};

// Символы слотов — в том же порядке, что SYMBOLS в lib/slots.js.
export const SYM = [
  { name: 'Вишня', three: 'Три вишни', art: '<path d="M24 9c-3.5 4.5-7 9.5-9.5 15M24 9c2 5 5.5 10 9.5 16" fill="none" stroke="#2EBD72" stroke-width="2.4" stroke-linecap="round"/><path d="M24 9c3.5-3.6 9.5-4 13.5-.8-3.6 3.6-9.6 4-13.5.8Z" fill="#2EBD72"/><circle cx="14" cy="31" r="8.5" fill="#E5484D"/><circle cx="34" cy="33" r="8.5" fill="#E5484D"/><circle cx="11" cy="28" r="2.2" fill="#fff" opacity=".5"/><circle cx="31" cy="30" r="2.2" fill="#fff" opacity=".5"/>' },
  { name: 'Лимон', three: 'Три лимона', art: '<path d="M7 31c1-9 9-17 20-18.5 5-.6 9.5.6 13 3.5-1 9-9 17-20 18.5-5 .6-9.5-.6-13-3.5Z" fill="#F2C94C"/><circle cx="6.6" cy="31.6" r="2.4" fill="#F2C94C"/><circle cx="40.4" cy="16.4" r="2.4" fill="#F2C94C"/><path d="M15 26c3-5 8-8 14-8.6" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" opacity=".5"/>' },
  { name: 'Виноград', three: 'Три грозди', art: '<path d="M24 14V7" stroke="#2EBD72" stroke-width="2.4" stroke-linecap="round"/><path d="M24 10c3-4 9-4.6 13-1.6-3.4 3.4-9.4 4-13 1.6Z" fill="#2EBD72"/><g fill="#8B5CF6"><circle cx="14" cy="19" r="5.4"/><circle cx="24" cy="19" r="5.4"/><circle cx="34" cy="19" r="5.4"/><circle cx="19" cy="28.4" r="5.4"/><circle cx="29" cy="28.4" r="5.4"/><circle cx="24" cy="37.8" r="5.4"/></g><g fill="#fff" opacity=".4"><circle cx="12.4" cy="17.4" r="1.5"/><circle cx="22.4" cy="17.4" r="1.5"/><circle cx="32.4" cy="17.4" r="1.5"/><circle cx="17.4" cy="26.8" r="1.5"/><circle cx="27.4" cy="26.8" r="1.5"/><circle cx="22.4" cy="36.2" r="1.5"/></g>' },
  { name: 'Колокольчик', three: 'Три колокольчика', art: '<path d="M24 6.5a3 3 0 0 0-3 3v1C15.4 12 12 16.8 12 23v6.8L8.6 34v2.5h30.8V34L36 29.8V23c0-6.2-3.4-11-9-12.5v-1a3 3 0 0 0-3-3Z" fill="#F59E0B"/><circle cx="24" cy="39.6" r="3.6" fill="#F59E0B"/><path d="M17.2 24c0-3.6 1.6-6.4 4.4-8" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" opacity=".5"/>' },
  { name: 'Звезда', three: 'Три звезды', art: '<path d="M24 7.5L28.7 19L41.1 19.9L31.6 28L34.6 40.1L24 33.5L13.4 40.1L16.4 28L6.9 19.9L19.3 19Z" fill="#5B8CFF" stroke="#5B8CFF" stroke-width="3" stroke-linejoin="round"/>' },
  { name: 'Бриллиант', three: 'Три бриллианта', art: '<path d="M14 11h20l8 10-18 18L6 21Z" fill="#38BDF8"/><path d="M14 11h20l-5 10H19Z" fill="#BAE6FD"/><path d="M6 21l8-10 5 10Z" fill="#7DD3FC"/><path d="M42 21l-8-10-5 10Z" fill="#0EA5E9"/><path d="M19 21h10l-5 18Z" fill="#7DD3FC"/><path d="M29 21h13L24 39Z" fill="#0284C7"/>' },
  { name: 'Семёрка', three: 'Три семёрки', art: '<path d="M11 9.5h26v6.2L24.6 40h-8.4l11.6-23.3H11Z" fill="#E5484D"/>' },
];

export const symSvg = (i, size) => `<svg viewBox="0 0 48 48" width="${size}" height="${size}" role="img" aria-label="${SYM[i].name}">${SYM[i].art}</svg>`;

// Обложки игр — «картинка рынка» как у Polymarket.
const SEVEN = 'M11 9.5h26v6.2L24.6 40h-8.4l11.6-23.3H11Z';
const T = (inner) => `<svg viewBox="0 0 44 44" aria-hidden="true">${inner}</svg>`;
export const THUMB = {
  slots: T(`<rect width="44" height="44" rx="8" fill="#6E56CF"/><g fill="#fff"><rect x="8" y="11" width="8.4" height="22" rx="2.2"/><rect x="17.8" y="11" width="8.4" height="22" rx="2.2"/><rect x="27.6" y="11" width="8.4" height="22" rx="2.2"/></g><g fill="#6E56CF"><path transform="translate(6.44 16.06) scale(.24)" d="${SEVEN}"/><path transform="translate(16.24 16.06) scale(.24)" d="${SEVEN}"/><path transform="translate(26.04 16.06) scale(.24)" d="${SEVEN}"/></g>`),
  blackjack: T(`<rect width="44" height="44" rx="8" fill="#16A35F"/><rect x="9.5" y="11" width="15" height="21" rx="2.5" fill="none" stroke="#fff" stroke-width="2" transform="rotate(-10 17 21.5)"/><rect x="19" y="12" width="15" height="21" rx="2.5" fill="#fff" transform="rotate(8 26.5 22.5)"/><g transform="rotate(8 26.5 22.5) translate(21.5 17.5) scale(.42)" fill="#16A35F">${SUIT['♠']}</g>`),
  roulette: T('<rect width="44" height="44" rx="8" fill="#D9383E"/><circle cx="22" cy="22" r="13" fill="none" stroke="#fff" stroke-width="2"/><circle cx="22" cy="22" r="8.6" fill="none" stroke="#fff" stroke-width="4.4" stroke-dasharray="2.7 2.7"/><circle cx="22" cy="22" r="2.6" fill="#fff"/>'),
  poker: T(`<rect width="44" height="44" rx="8" fill="#3E63DD"/><g transform="translate(10 10)" fill="#fff">${SUIT['♠']}</g>`),
};

# TimeSkip — мини-игры в Telegram

Бот [@fish_and_chips_bloody_hell_Bot](https://t.me/fish_and_chips_bloody_hell_Bot) на Telegram Serverless
(`app8843830120`). Бот только зовёт в Mini App, всё остальное — в `webapp/`:

- 🎰 **Слоты** — 3 барабана, средний возврат ≈94%;
- 🃏 **Блэкджек** — 6 колод, дилер стоит на 17, блэкджек 3:2, удвоение;
- 🎡 **Рулетка** — европейская, ставки на числа, цвета, чёт/нечет, половины и дюжины;
- ♠️ **Видеопокер** — Jacks or Better;
- 🧱 **Блоки** — как Block Blast: поле 8×8, перетаскиваешь фигуры, целые ряды и столбцы сгорают. Без фишек, на очки и рекорд (партия сохраняется).

Фишки игровые: их нельзя купить или вывести; когда кончаются, приложение даёт ещё 1 000.
Баланс хранится в CloudStorage Телеграма (и в localStorage).

```
webapp/lib/      — правила игр без DOM (проверяются тестами)
webapp/games/    — экраны игр
webapp/app.js    — главный экран и переходы; ui.js, wallet.js — общее
tgcloud/handlers/message.js — /start и /play: кнопка «Играть»
```

## Команды

```
npm test         # правила игр
npm run deploy   # выложить (ключ из .tgcloud/credentials или TGCLOUD_TOKEN_TIMESKIP)
```

`npm run deploy` нарочно не берёт `TGCLOUD_TOKEN` из окружения: там может оказаться ключ
другого бота. Локально приложение можно открыть так: `cd webapp && python3 -m http.server`.

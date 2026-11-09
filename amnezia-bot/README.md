# amnezia-bot — ключи семейного VPN (Amnezia)

Telegram-бот на Telegram Serverless (`app9039462838`). Выдаёт родным ключи AmneziaWG
и пересоздаёт их одной кнопкой. Ключи бот делает через веб-панель
[amnezia-wg-easy](https://github.com/spcfox/amnezia-wg-easy) на вашем VPN-сервере.

## Как пользоваться

- **Владелец** — первый, кто нажал /start. Он подключает сервер (`/server http://АДРЕС пароль`)
  и пускает родных. Сообщение с паролем бот сразу удаляет из чата; пароль хранится только в базе бота.
- **Родные** открывают бота и жмут /start → владельцу приходит запрос «пустить / нет».
- **🔑 Мои ключи** — по ключу на устройство (телефон, компьютер, планшет, телевизор):
  получить (файл `.conf` или «📋 Текстом»), 🔄 пересоздать (старый ключ сразу перестаёт работать).
- **👨‍👩‍👧 Семья** (владелец) — кто пользуется и сколько ключей; «убрать» удаляет человека и все его ключи с сервера.
- **🖥 Сервер** (владелец) — работает ли панель, сколько на ней ключей.

Ключ открывается в приложении **AmneziaVPN** (или AmneziaWG): файл → «Открыть в AmneziaVPN»,
либо «+» → «Файл с настройками», либо вставить текст ключа.

## Сервер: панель amnezia-wg-easy

Облако Telegram ходит наружу **только на порты 80 и 443** — поэтому панель открываем на 80-м порту.
На сервере (Ubuntu/Debian с Docker):

```sh
docker run -d \
  --name=amnezia-wg-easy \
  -e LANGUAGE=ru \
  -e WG_HOST=<IP_СЕРВЕРА> \
  -e PASSWORD=<ПАРОЛЬ_ПАНЕЛИ> \
  -e PORT=51821 \
  -e WG_PORT=51820 \
  -v ~/.amnezia-wg-easy:/etc/wireguard \
  -p 51820:51820/udp \
  -p 80:51821/tcp \
  --cap-add=NET_ADMIN \
  --cap-add=SYS_MODULE \
  --sysctl="net.ipv4.conf.all.src_valid_mark=1" \
  --sysctl="net.ipv4.ip_forward=1" \
  --device=/dev/net/tun:/dev/net/tun \
  --restart unless-stopped \
  ghcr.io/spcfox/amnezia-wg-easy
```

Потом в боте: `/server http://<IP_СЕРВЕРА> <ПАРОЛЬ_ПАНЕЛИ>`.

Если сервер ставили через приложение AmneziaVPN — панель встаёт рядом (у неё свой UDP-порт 51820,
занят — поменяйте `WG_PORT` и `-p`). Старые ключи из приложения продолжат работать как были,
новые бот делает в панели. Подходит и форк [w0rng/amnezia-wg-easy](https://github.com/w0rng/amnezia-wg-easy)
(у него `PASSWORD_HASH` вместо `PASSWORD`) — API у них одинаковый.

## Код

```
tgcloud/
  schema.js             — settings (владелец, панель), members (семья), vpn_keys (ключи)
  lib/app.js            — вся логика: сообщения, кнопки, тексты (без sdk — проверяется тестами)
  lib/panel.js          — клиент API amnezia-wg-easy (вход по паролю → cookie, клиенты, конфиг)
  lib/store.js          — база
  lib/telegram.js       — связка с sdk: Telegram, база, fetch
  handlers/message.js, handlers/callback_query.js
test/bot.test.js        — сценарии на поддельной панели с тем же HTTP API
```

`npm test` — тесты, `npm run deploy` — выложить (ключ приложения в `.tgcloud/credentials`, не в git).

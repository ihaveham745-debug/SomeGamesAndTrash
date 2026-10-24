// npm run deploy — выложить бота «Шпион».
// Ключ берём из .tgcloud/credentials (или TGCLOUD_TOKEN_SPY), а не из TGCLOUD_TOKEN:
// в окружении может оказаться ключ другого бота, и tgcloud выложил бы код поверх него.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
const APP_ID = 'app8801791786';

const credentials = new URL('../.tgcloud/credentials', import.meta.url);
const token = process.env.TGCLOUD_TOKEN_SPY
  ?? (existsSync(credentials) ? JSON.parse(readFileSync(credentials, 'utf8')).token : null);

if (!token?.startsWith(`${APP_ID}:`)) {
  console.error(`Нужен ключ ${APP_ID}:… — в .tgcloud/credentials или TGCLOUD_TOKEN_SPY.`);
  process.exit(1);
}

const env = { ...process.env, TGCLOUD_TOKEN: token, TGCLOUD_NO_PAGER: '1' };
const run = (...args) => execFileSync('npx', ['tgcloud', ...args], { stdio: 'inherit', env });

if (!existsSync(new URL('../.tgcloud/state.json', import.meta.url))) run('fetch');
execFileSync('node', [new URL('./build.mjs', import.meta.url).pathname], { stdio: 'inherit' });
// tgcloud иногда падает уже после загрузки (пишет в свой снимок false вместо текста модуля).
// Тогда сверяемся с сервером: если загружать больше нечего — всё выложилось, идём дальше.
try {
  run('push');
} catch {
  console.warn('\npush упал — сверяю с сервером…');
  run('fetch');
  const status = execFileSync('npx', ['tgcloud', 'status'], { env, encoding: 'utf8' });
  if (!/Working directory clean/.test(status)) {
    console.error(status);
    process.exit(1);
  }
  console.warn('на сервере всё новое — продолжаю');
}
// Новые таблицы и столбцы; удаление данных (--safe) не применяем.
run('migrate', '--safe');

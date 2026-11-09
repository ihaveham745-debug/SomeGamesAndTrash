// npm run deploy — выложить бота «тетрадка долгов».
// Ключ берём из .tgcloud/credentials этого проекта (или TGCLOUD_TOKEN_DEBT), а не из TGCLOUD_TOKEN:
// в окружении может оказаться ключ другого бота, и tgcloud выложил бы код поверх него.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const credentials = new URL('../.tgcloud/credentials', import.meta.url);
const token = process.env.TGCLOUD_TOKEN_DEBT
  ?? (existsSync(credentials) ? JSON.parse(readFileSync(credentials, 'utf8')).token : null);

if (!/^app\d+:/.test(token ?? '')) {
  console.error('Нужен ключ app…:… — в .tgcloud/credentials или TGCLOUD_TOKEN_DEBT.');
  process.exit(1);
}

const env = { ...process.env, TGCLOUD_TOKEN: token, TGCLOUD_NO_PAGER: '1' };
const run = (...args) => execFileSync('npx', ['tgcloud', ...args], { stdio: 'inherit', env });

if (!existsSync(new URL('../.tgcloud/state.json', import.meta.url))) run('fetch');
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

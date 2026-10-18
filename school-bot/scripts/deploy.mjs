// npm run deploy — выложить бота расписания 10-х классов.
// Ключ берём из .tgcloud/credentials (или TGCLOUD_TOKEN_SCHOOL), а не из TGCLOUD_TOKEN:
// в окружении может оказаться ключ другого бота, и tgcloud выложил бы код поверх него.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { APP_ID } from '../tgcloud/lib/school.js';

const credentials = new URL('../.tgcloud/credentials', import.meta.url);
const token = process.env.TGCLOUD_TOKEN_SCHOOL
  ?? (existsSync(credentials) ? JSON.parse(readFileSync(credentials, 'utf8')).token : null);

if (!token?.startsWith(`${APP_ID}:`)) {
  console.error(`Нужен ключ ${APP_ID}:… — в .tgcloud/credentials или TGCLOUD_TOKEN_SCHOOL.`);
  process.exit(1);
}

const env = { ...process.env, TGCLOUD_TOKEN: token, TGCLOUD_NO_PAGER: '1' };
const run = (...args) => execFileSync('npx', ['tgcloud', ...args], { stdio: 'inherit', env });

if (!existsSync(new URL('../.tgcloud/state.json', import.meta.url))) run('fetch');
execFileSync('node', [new URL('./build.mjs', import.meta.url).pathname], { stdio: 'inherit' });
run('push');
// Новые таблицы и столбцы; удаление данных (--safe) не применяем.
run('migrate', '--safe');

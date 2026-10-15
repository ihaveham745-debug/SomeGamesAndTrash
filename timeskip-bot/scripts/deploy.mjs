// npm run deploy — выложить бота TimeSkip.
// Ключ берём из .tgcloud/credentials, а не из TGCLOUD_TOKEN: в окружении может
// оказаться ключ другого бота, и tgcloud выложил бы игры поверх расписания.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const APP_ID = 'app8843830120';
const credentials = new URL('../.tgcloud/credentials', import.meta.url);
const token = process.env.TGCLOUD_TOKEN_TIMESKIP
  ?? (existsSync(credentials) ? JSON.parse(readFileSync(credentials, 'utf8')).token : null);

if (!token?.startsWith(`${APP_ID}:`)) {
  console.error(`Нужен ключ ${APP_ID}:… — в .tgcloud/credentials или TGCLOUD_TOKEN_TIMESKIP.`);
  process.exit(1);
}

const env = { ...process.env, TGCLOUD_TOKEN: token };
const run = (...args) => execFileSync('npx', ['tgcloud', ...args], { stdio: 'inherit', env });

if (!existsSync(new URL('../.tgcloud/state.json', import.meta.url))) run('fetch');
run('push');

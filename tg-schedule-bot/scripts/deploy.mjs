// Деплой бота одной группы: npm run deploy -- <группа>   (группы — файлы в tgcloud/lib/groups/)
//
// У каждого бота своё состояние tgcloud (.tgcloud/), поэтому для группы собирается своя копия
// проекта в .deploy/<группа>/: тот же код, а lib/timetable.js указывает на расписание группы.
// Дальше там: сборка Mini App → tgcloud push → tgcloud migrate --safe.
//
// Ключ (Access token из @BotFather → Serverless → CLI Access) — по порядку:
//   переменная TGCLOUD_TOKEN_<ГРУППА> (например TGCLOUD_TOKEN_B_TMMS_26),
//   сохранённый ранее .deploy/<группа>/.tgcloud/credentials,
//   переменная TGCLOUD_TOKEN.
// Ключ обязан принадлежать боту группы (APP_ID в её файле) — иначе деплой не начнётся.

import { spawnSync } from 'node:child_process';
import { chmodSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const groupsDir = join(root, 'tgcloud', 'lib', 'groups');
const groups = readdirSync(groupsDir).filter((f) => f.endsWith('.js')).map((f) => f.slice(0, -3)).sort();
const group = process.argv[2];

if (!groups.includes(group)) {
  console.error(`Укажи группу: npm run deploy -- <группа>\nЕсть: ${groups.join(', ')}`);
  process.exit(1);
}

const { APP_ID, GROUP } = await import(pathToFileURL(join(groupsDir, `${group}.js`)).href);
const dir = join(root, '.deploy', group);
const credentials = join(dir, '.tgcloud', 'credentials');

// --- ключ ---
const envName = `TGCLOUD_TOKEN_${group.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`;
let token = process.env[envName];
let source = envName;
if (!token && existsSync(credentials)) {
  token = JSON.parse(readFileSync(credentials, 'utf8')).token;
  source = credentials;
}
if (!token) {
  token = process.env.TGCLOUD_TOKEN;
  source = 'TGCLOUD_TOKEN';
}
if (!token) {
  console.error(`Нет ключа для ${GROUP}. Запусти один раз так:\n  ${envName}=app… npm run deploy -- ${group}`);
  process.exit(1);
}
if (!token.startsWith(`${APP_ID}:`)) {
  console.error(`Ключ из ${source} — от другого бота (${token.split(':')[0]}), а ${GROUP} живёт в ${APP_ID}. Деплой отменён.`);
  process.exit(1);
}

// --- копия проекта для группы ---
mkdirSync(join(dir, '.tgcloud'), { recursive: true });
for (const item of ['tgcloud', 'webapp', 'scripts', 'tgcloud.jsonc', 'package.json']) {
  rmSync(join(dir, item), { recursive: true, force: true });
  cpSync(join(root, item), join(dir, item), { recursive: true });
}
if (!existsSync(join(dir, 'node_modules'))) symlinkSync(join(root, 'node_modules'), join(dir, 'node_modules'), 'dir');
writeFileSync(
  join(dir, 'tgcloud', 'lib', 'timetable.js'),
  `// lib/timetable — расписание группы ${GROUP} (собрано scripts/deploy.mjs).\nexport * from './groups/${group}.js';\n`,
);
writeFileSync(credentials, `${JSON.stringify({ token }, null, 2)}\n`, { mode: 0o600 });
chmodSync(credentials, 0o600);

// --- сборка и деплой ---
function run(cmd, args) {
  console.log(`\n$ ${[cmd, ...args].join(' ')}`);
  const res = spawnSync(cmd, args, {
    cwd: dir,
    stdio: 'inherit',
    env: { ...process.env, TGCLOUD_TOKEN: token, TGCLOUD_NO_PAGER: '1' },
  });
  if (res.status !== 0) process.exit(res.status ?? 1);
}

console.log(`Деплой ${GROUP} → ${APP_ID} (ключ: ${source})`);
if (!existsSync(join(dir, '.tgcloud', 'state.json'))) run('npx', ['tgcloud', 'fetch']);
run('node', ['scripts/build.mjs', dir]);
run('npx', ['tgcloud', 'push']);
run('npx', ['tgcloud', 'migrate', '--safe']);

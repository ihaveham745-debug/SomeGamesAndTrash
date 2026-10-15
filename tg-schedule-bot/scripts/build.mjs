// Сборка Mini App: webapp/ + модули расписания бота → dist/.
// Модули из tgcloud/lib/ не зависят от 'sdk', поэтому работают в браузере как есть —
// у бота и приложения одно расписание.
//
// node scripts/build.mjs [папка проекта] — по умолчанию эта; scripts/deploy.mjs собирает так копию для группы.

import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), '..'));
const out = join(root, 'dist');
const SHARED = ['schedule.js', 'timetable.js', 'homework.js', 'groups'];

rmSync(out, { recursive: true, force: true });
cpSync(join(root, 'webapp'), out, { recursive: true });
mkdirSync(join(out, 'lib'));
for (const item of SHARED) cpSync(join(root, 'tgcloud', 'lib', item), join(out, 'lib', item), { recursive: true });

console.log(`Mini App собран в ${out}`);

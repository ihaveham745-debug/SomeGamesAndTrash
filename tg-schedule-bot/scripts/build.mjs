// Сборка Mini App: webapp/ + модули расписания бота → dist/.
// Модули из tgcloud/lib/ не зависят от 'sdk', поэтому работают в браузере как есть —
// у бота и приложения одно расписание.

import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'dist');
const SHARED = ['schedule.js', 'timetable.js', 'homework.js'];

rmSync(out, { recursive: true, force: true });
cpSync(join(root, 'webapp'), out, { recursive: true });
mkdirSync(join(out, 'lib'));
for (const file of SHARED) cpSync(join(root, 'tgcloud', 'lib', file), join(out, 'lib', file));

console.log('Mini App собран в dist/');

// Сборка Mini App: webapp/ + модули расписания бота → dist/.
// Модули из tgcloud/lib/ ниже не зависят от 'sdk', поэтому работают в браузере как есть —
// у бота и приложения одно расписание.

import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const out = join(root, 'dist');
const SHARED = ['school.js', 'schedule.js', 'homework.js', 'consults.js'];

rmSync(out, { recursive: true, force: true });
cpSync(join(root, 'webapp'), out, { recursive: true });
mkdirSync(join(out, 'lib'));
for (const item of SHARED) cpSync(join(root, 'tgcloud', 'lib', item), join(out, 'lib', item));

console.log(`Mini App собран в ${out}`);

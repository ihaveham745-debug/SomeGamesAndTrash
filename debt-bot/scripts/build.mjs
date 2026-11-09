// Сборка Mini App: webapp/ + общие с ботом модули (суммы и расчёт процентов) → dist/.
// lib/money.js и lib/loans.js не зависят от 'sdk' — в браузере работают как есть,
// поэтому долг с процентами в приложении считается так же, как в боте.

import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const out = join(root, 'dist');
const SHARED = ['money.js', 'loans.js'];

rmSync(out, { recursive: true, force: true });
cpSync(join(root, 'webapp'), out, { recursive: true });
mkdirSync(join(out, 'lib'));
for (const item of SHARED) cpSync(join(root, 'tgcloud', 'lib', item), join(out, 'lib', item));

console.log(`Mini App собран в ${out}`);

// Сборка Mini App: webapp/ + правила игры и слова из tgcloud/lib/ → dist/.
// Эти модули не зависят от 'sdk', поэтому работают в браузере как есть.

import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const out = join(root, 'dist');
const SHARED = ['words.js', 'game.js'];

rmSync(out, { recursive: true, force: true });
cpSync(join(root, 'webapp'), out, { recursive: true });
mkdirSync(join(out, 'lib'));
for (const item of SHARED) cpSync(join(root, 'tgcloud', 'lib', item), join(out, 'lib', item));

console.log(`Mini App собран в ${out}`);

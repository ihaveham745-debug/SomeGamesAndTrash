// Копирует правила шахмат из webapp/lib в tgcloud/lib: сервер проверяет ходы тем же кодом,
// а модули в tgcloud/ не могут импортировать файлы снаружи.

import { copyFileSync } from 'node:fs';

for (const name of ['chess.js', 'checkers.js']) {
  copyFileSync(new URL(`../webapp/lib/${name}`, import.meta.url), new URL(`../tgcloud/lib/${name}`, import.meta.url));
}

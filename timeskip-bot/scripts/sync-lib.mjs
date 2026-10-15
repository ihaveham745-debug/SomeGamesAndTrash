// Копирует правила шахмат из webapp/lib в tgcloud/lib: сервер проверяет ходы тем же кодом,
// а модули в tgcloud/ не могут импортировать файлы снаружи.

import { copyFileSync } from 'node:fs';

copyFileSync(new URL('../webapp/lib/chess.js', import.meta.url), new URL('../tgcloud/lib/chess.js', import.meta.url));

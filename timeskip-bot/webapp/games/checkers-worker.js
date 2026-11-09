// Бот для шашек думает в отдельном потоке, чтобы приложение не подвисало.

import { moveId, replay } from '../lib/checkers.js';
import { bestMove } from '../lib/checkersai.js';

self.onmessage = ({ data }) => {
  const move = bestMove(replay(data.moves), data.level);
  self.postMessage({ id: data.id, move: move && moveId(move) });
};

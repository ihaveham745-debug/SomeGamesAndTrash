// Бот думает в отдельном потоке, чтобы приложение не подвисало.

import { replay, toUci } from '../lib/chess.js';
import { bestMove } from '../lib/chessai.js';

self.onmessage = ({ data }) => {
  const move = bestMove(replay(data.moves), data.level);
  self.postMessage({ id: data.id, uci: move && toUci(move) });
};

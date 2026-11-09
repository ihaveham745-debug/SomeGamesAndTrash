// POST /api/nudge — см. lib/api.js → apiCall('nudge').
import { run } from '../lib/endpoint.js';

export default (input, ctx) => run('nudge', input, ctx);

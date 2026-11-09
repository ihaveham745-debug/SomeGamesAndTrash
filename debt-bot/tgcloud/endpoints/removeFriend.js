// POST /api/removeFriend — см. lib/api.js → apiCall('removeFriend').
import { run } from '../lib/endpoint.js';

export default (input, ctx) => run('removeFriend', input, ctx);

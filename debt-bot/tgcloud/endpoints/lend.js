// POST /api/lend — см. lib/api.js → apiCall('lend').
import { run } from '../lib/endpoint.js';

export default (input, ctx) => run('lend', input, ctx);

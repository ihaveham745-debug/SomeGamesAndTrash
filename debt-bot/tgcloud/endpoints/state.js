// POST /api/state — см. lib/api.js → apiCall('state').
import { run } from '../lib/endpoint.js';

export default (input, ctx) => run('state', input, ctx);

// POST /api/paid — см. lib/api.js → apiCall('paid').
import { run } from '../lib/endpoint.js';

export default (input, ctx) => run('paid', input, ctx);

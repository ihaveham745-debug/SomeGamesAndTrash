// POST /api/decide — см. lib/api.js → apiCall('decide').
import { run } from '../lib/endpoint.js';

export default (input, ctx) => run('decide', input, ctx);

// POST /api/ask — см. lib/api.js → apiCall('ask').
import { run } from '../lib/endpoint.js';

export default (input, ctx) => run('ask', input, ctx);

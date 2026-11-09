// POST /api/undo — см. lib/api.js → apiCall('undo').
import { run } from '../lib/endpoint.js';

export default (input, ctx) => run('undo', input, ctx);

// POST /api/repay — см. lib/api.js → apiCall('repay').
import { run } from '../lib/endpoint.js';

export default (input, ctx) => run('repay', input, ctx);

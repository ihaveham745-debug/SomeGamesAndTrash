// POST /api/setTerms — см. lib/api.js → apiCall('setTerms').
import { run } from '../lib/endpoint.js';

export default (input, ctx) => run('setTerms', input, ctx);

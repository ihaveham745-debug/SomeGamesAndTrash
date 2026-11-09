// lib/endpoint — общая обёртка эндпоинтов Mini App: apiCall + понятные ошибки.

import { EndpointError } from 'sdk';
import { ApiError, apiCall } from './api.js';
import { makeDeps } from './telegram.js';

export async function run(name, input, ctx) {
  try {
    return await apiCall(name, input ?? {}, ctx.initData?.user, await makeDeps());
  } catch (err) {
    if (err instanceof ApiError) throw new EndpointError(err.message, { code: 'BAD_REQUEST' });
    throw err;
  }
}

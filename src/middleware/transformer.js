import { createChildLogger } from '../logger.js';

const logger = createChildLogger({ component: 'transformer' });

const HEADERS_TO_REMOVE = ['x-internal-*', 'x-debug-*'];

export function requestTransformer(proxyReqOpts, req) {
  proxyReqOpts.headers['x-request-id'] = req.id || crypto.randomUUID();
  proxyReqOpts.headers['x-forwarded-by'] = 'bff-gateway';

  if (req.clientId) {
    proxyReqOpts.headers['x-client-id'] = req.clientId;
  }

  proxyReqOpts.headers['x-backend-id'] = req.backendId?.toString() || 'unknown';

  return proxyReqOpts;
}

export function responseTransformer(proxyRes, req, res) {
  const removePatterns = HEADERS_TO_REMOVE;

  for (const header of Object.keys(proxyRes.headers)) {
    const shouldRemove = removePatterns.some((pattern) => {
      const regex = new RegExp('^' + pattern.replace('*', '.*') + '$');
      return regex.test(header);
    });

    if (shouldRemove) {
      res.removeHeader(header);
    }
  }

  res.setHeader('x-gateway-timestamp', new Date().toISOString());

  return proxyRes;
}

export function onProxyRes(proxyRes, req, res) {
  const latency = Date.now() - (req.startTime || Date.now());

  logger.info({
    method: req.method,
    path: req.path,
    statusCode: proxyRes.statusCode,
    latency,
    backendId: req.backendId,
    requestId: req.id,
  }, 'Request proxied');
}

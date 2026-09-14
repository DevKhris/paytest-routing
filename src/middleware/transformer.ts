import { createChildLogger } from '../logger.js';
import type { Request, Response } from 'express';
import type { ClientRequest } from 'http';
import type { IncomingMessage } from 'http';

const logger = createChildLogger({ component: 'transformer' });

const HEADERS_TO_REMOVE = ['x-internal-*', 'x-debug-*'];

export function requestTransformer(proxyReqOpts: ClientRequest & { headers: Record<string, string> }, req: Request): ClientRequest & { headers: Record<string, string> } {
  proxyReqOpts.headers['x-request-id'] = (req as any).id || crypto.randomUUID();
  proxyReqOpts.headers['x-forwarded-by'] = 'bff-gateway';

  if ((req as any).clientId) {
    proxyReqOpts.headers['x-client-id'] = (req as any).clientId;
  }

  proxyReqOpts.headers['x-backend-id'] = (req as any).backendId?.toString() || 'unknown';

  return proxyReqOpts;
}

export function responseTransformer(proxyRes: IncomingMessage, req: Request, res: Response): IncomingMessage {
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

export function onProxyRes(proxyRes: IncomingMessage, req: Request, _res: Response): void {
  const latency = Date.now() - ((req as any).startTime || Date.now());

  logger.info({
    method: req.method,
    path: req.path,
    statusCode: proxyRes.statusCode,
    latency,
    backendId: (req as any).backendId,
    requestId: (req as any).id,
  }, 'Request proxied');
}

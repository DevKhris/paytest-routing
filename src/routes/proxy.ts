import { Router } from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { config } from '../config.js';
import { createChildLogger } from '../logger.js';
import type { LoadBalancer, BackendStatus } from '../loadbalancer.js';
import type { Request, Response, NextFunction } from 'express';

const logger = createChildLogger({ component: 'proxy-routes' });

interface BffStatusResponse {
  status: string;
  timestamp: string;
  uptime: number;
  backends: BackendStatus[];
  circuitBreakers: Array<{
    backendId: number;
    state: string;
    failureCount: number;
  }>;
}

export function createProxyRouter(balancer: LoadBalancer): Router {
  const router = Router();

  router.use((req: Request, _res: Response, next: NextFunction) => {
    (req as any).startTime = Date.now();
    (req as any).id = (req.headers['x-request-id'] as string) || crypto.randomUUID();
    next();
  });

  router.get('/bff/status', (_req: Request, res: Response<BffStatusResponse>) => {
    res.json({
      status: 'running',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      backends: balancer.status,
      circuitBreakers: balancer.status.map((b) => ({
        backendId: b.id,
        state: b.breaker.state,
        failureCount: b.breaker.failureCount,
      })),
    });
  });

  router.all('/api/{*path}', async (req: Request, res: Response, next: NextFunction) => {
    let backendInfo;

    try {
      backendInfo = balancer.nextTarget;
    } catch (err) {
      logger.error({ error: (err as Error).message }, 'No backends available');
      return next(err);
    }

    const { target, backendId } = backendInfo;
    (req as any).backendId = backendId;

    const proxy = createProxyMiddleware({
      ...config.proxy,
      target,
      on: {
        proxyReq: (proxyReq) => {
          proxyReq.setHeader('X-Request-Id', (req as any).id);
          proxyReq.setHeader('X-Backend-Id', backendId.toString());
          proxyReq.setHeader('X-Forwarded-By', 'bff-gateway');

          if ((req as any).clientId) {
            proxyReq.setHeader('X-Client-Id', (req as any).clientId);
          }

          logger.info({
            method: req.method,
            path: req.path,
            target,
            backendId,
            requestId: (req as any).id,
          }, 'Proxying request');
        },
        proxyRes: (proxyRes) => {
          const latency = Date.now() - (req as any).startTime;
          balancer.recordSuccess(backendId, latency);

          logger.info({
            method: req.method,
            path: req.path,
            statusCode: proxyRes.statusCode,
            latency,
            backendId,
            requestId: (req as any).id,
          }, 'Request completed');
        },
        error: (err) => {
          const latency = Date.now() - (req as any).startTime;
          balancer.recordFailure(backendId);

          logger.error({
            method: req.method,
            path: req.path,
            error: err.message,
            latency,
            backendId,
            requestId: (req as any).id,
          }, 'Proxy error');
        },
      },
    });

    proxy(req, res, next);
  });

  return router;
}

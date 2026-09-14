import { Router } from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { config } from '../config.js';
import { createChildLogger } from '../logger.js';

const logger = createChildLogger({ component: 'proxy-routes' });

export function createProxyRouter(balancer) {
  const router = Router();

  router.use((req, res, next) => {
    req.startTime = Date.now();
    req.id = req.headers['x-request-id'] || crypto.randomUUID();
    next();
  });

  router.use('/bff/status', (req, res) => {
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

  router.all('/api/{*path}', async (req, res, next) => {
    let backendInfo;

    try {
      backendInfo = balancer.nextTarget;
    } catch (err) {
      logger.error({ error: err.message }, 'No backends available');
      return next(err);
    }

    const { target, backendId } = backendInfo;
    req.backendId = backendId;

    const proxy = createProxyMiddleware({
      ...config.proxy,
      target,
      on: {
        proxyReq: (proxyReq) => {
          proxyReq.setHeader('X-Request-Id', req.id);
          proxyReq.setHeader('X-Backend-Id', backendId.toString());
          proxyReq.setHeader('X-Forwarded-By', 'bff-gateway');

          if (req.clientId) {
            proxyReq.setHeader('X-Client-Id', req.clientId);
          }

          logger.info({
            method: req.method,
            path: req.path,
            target,
            backendId,
            requestId: req.id,
          }, 'Proxying request');
        },
        proxyRes: (proxyRes) => {
          const latency = Date.now() - req.startTime;
          balancer.recordSuccess(backendId, latency);

          logger.info({
            method: req.method,
            path: req.path,
            statusCode: proxyRes.statusCode,
            latency,
            backendId,
            requestId: req.id,
          }, 'Request completed');
        },
        error: (err) => {
          const latency = Date.now() - req.startTime;
          balancer.recordFailure(backendId);

          logger.error({
            method: req.method,
            path: req.path,
            error: err.message,
            latency,
            backendId,
            requestId: req.id,
          }, 'Proxy error');
        },
      },
    });

    proxy(req, res, next);
  });

  return router;
}

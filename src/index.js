import express from 'express';
import { config } from './config.js';
import { logger } from './logger.js';
import { LoadBalancer } from './loadbalancer.js';
import { HealthChecker } from './healthcheck.js';
import { errorHandler } from './errors.js';
import { rateLimiter } from './middleware/rateLimiter.js';
import { authenticator } from './middleware/authenticator.js';
import { validator } from './middleware/validator.js';
import { createProxyRouter } from './routes/proxy.js';

const app = express();

const balancer = new LoadBalancer(config.backends, config.circuitBreaker);
const healthChecker = new HealthChecker(balancer, config.healthCheck);

app.disable('x-powered-by');
app.set('trust proxy', 1);

app.use((req, res, next) => {
  req.id = req.headers['x-request-id'] || crypto.randomUUID();
  req.startTime = Date.now();
  res.setHeader('X-Request-Id', req.id);
  next();
});

app.use((req, res, next) => {
  res.on('finish', () => {
    const latency = Date.now() - req.startTime;
    logger.info({
      requestId: req.id,
      method: req.method,
      url: req.originalUrl,
      statusCode: res.statusCode,
      latency,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    }, 'Request handled');
  });
  next();
});

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use(rateLimiter);
app.use(authenticator);
app.use(validator);

app.get('/health', (req, res) => {
  const backends = balancer.status.map((b) => ({
    id: b.id,
    url: b.url,
    healthy: b.breaker.state !== 'OPEN',
    activeConnections: b.activeConnections,
    circuitBreaker: b.breaker.state,
  }));

  const allHealthy = backends.every((b) => b.healthy);
  const statusCode = allHealthy ? 200 : 503;

  res.status(statusCode).json({
    status: allHealthy ? 'ok' : 'degraded',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    backends,
  });
});

app.use(createProxyRouter(balancer));

app.use(errorHandler);

healthChecker.start();

const server = app.listen(config.port, () => {
  logger.info({
    port: config.port,
    env: config.env,
    backends: config.backends.length,
    authEnabled: config.auth.enabled,
  }, 'BFF Gateway started');
});

function gracefulShutdown(signal) {
  logger.info({ signal }, 'Received shutdown signal');

  healthChecker.stop();

  server.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });

  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'Uncaught exception');
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  logger.error({ reason }, 'Unhandled rejection');
});

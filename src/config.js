const env = process.env;

function parseBackends() {
  const raw = env.API_GATEWAY_BACKENDS || '';
  if (raw) {
    return raw.split(',').map((url, i) => ({
      id: i,
      url: url.trim(),
      weight: 1,
      maxConnections: parseInt(env.API_GATEWAY_MAX_CONN || '100', 10),
      timeout: parseInt(env.API_GATEWAY_BACKEND_TIMEOUT || '30000', 10),
    }));
  }

  return [
    { id: 0, url: env.BACKEND_1 || 'http://localhost:8001', weight: 1, maxConnections: 100, timeout: 30000 },
    { id: 1, url: env.BACKEND_2 || 'http://localhost:8002', weight: 1, maxConnections: 100, timeout: 30000 },
    { id: 2, url: env.BACKEND_3 || 'http://localhost:8003', weight: 1, maxConnections: 100, timeout: 30000 },
  ];
}

const rawConfig = {
  env: env.NODE_ENV || 'development',
  port: parseInt(env.API_GATEWAY_PORT || '3000', 10),
  logLevel: env.API_GATEWAY_LOG_LEVEL || 'info',

  backends: parseBackends(),

  rateLimit: {
    windowMs: parseInt(env.API_GATEWAY_RATE_WINDOW || '60000', 10),
    max: parseInt(env.API_GATEWAY_RATE_MAX || '100', 10),
    standardHeaders: true,
    legacyHeaders: false,
  },

  circuitBreaker: {
    failureThreshold: parseInt(env.API_GATEWAY_CB_THRESHOLD || '5', 10),
    recoveryTime: parseInt(env.API_GATEWAY_CB_RECOVERY || '30000', 10),
    halfOpenRequests: parseInt(env.API_GATEWAY_CB_HALFOPEN || '3', 10),
  },

  healthCheck: {
    interval: parseInt(env.API_GATEWAY_HC_INTERVAL || '30000', 10),
    timeout: parseInt(env.API_GATEWAY_HC_TIMEOUT || '5000', 10),
    path: env.API_GATEWAY_HC_PATH || '/health',
  },

  proxy: {
    changeOrigin: true,
    pathRewrite: { '^/api': '' },
    timeout: parseInt(env.API_GATEWAY_PROXY_TIMEOUT || '30000', 10),
    proxyTimeout: parseInt(env.API_GATEWAY_PROXY_TIMEOUT || '30000', 10),
  },

  auth: {
    enabled: env.API_GATEWAY_AUTH_ENABLED === 'true',
    header: env.API_GATEWAY_AUTH_HEADER || 'x-api-key',
    secrets: (env.API_GATEWAY_AUTH_SECRETS || '').split(',').filter(Boolean),
  },

  cache: {
    enabled: env.API_GATEWAY_CACHE_ENABLED === 'true',
    ttl: parseInt(env.API_GATEWAY_CACHE_TTL || '60000', 10),
  },
};

export const config = Object.freeze(rawConfig);

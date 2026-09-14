import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { config } from '../config.js';
import { RateLimitError } from '../errors.js';

export const rateLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.max,
  standardHeaders: config.rateLimit.standardHeaders,
  legacyHeaders: config.rateLimit.legacyHeaders,
  keyGenerator: (req) => {
    return ipKeyGenerator(req.ip || (req.headers['x-forwarded-for'] as string) || 'unknown');
  },
  handler: (req, _res, _next) => {
    throw new RateLimitError(`Rate limit exceeded for ${req.ip}`);
  },
  skip: (req) => req.path === '/bff/status',
});

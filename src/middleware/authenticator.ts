import { config } from '../config.js';
import { UnauthorizedError } from '../errors.js';
import { createChildLogger } from '../logger.js';
import type { Request, Response, NextFunction } from 'express';

const logger = createChildLogger({ component: 'auth' });

export function authenticator(req: Request, _res: Response, next: NextFunction): void {
  if (!config.auth.enabled) {
    return next();
  }

  if (req.path === '/bff/status') {
    return next();
  }

  const apiKey = req.headers[config.auth.header] as string | undefined;

  if (!apiKey) {
    logger.warn({ ip: req.ip }, 'Missing API key');
    throw new UnauthorizedError(`Missing ${config.auth.header} header`);
  }

  if (!config.auth.secrets.includes(apiKey)) {
    logger.warn({ ip: req.ip }, 'Invalid API key');
    throw new UnauthorizedError('Invalid API key');
  }

  (req as any).clientId = apiKey.slice(0, 8);
  return next();
}

import { BadRequestError } from '../errors.js';
import { createChildLogger } from '../logger.js';
import type { Request, Response, NextFunction } from 'express';

const logger = createChildLogger({ component: 'validator' });

const ALLOWED_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
const MAX_BODY_SIZE = 10 * 1024 * 1024;

export function validator(req: Request, _res: Response, next: NextFunction): void {
  if (!ALLOWED_METHODS.includes(req.method)) {
    logger.warn({ method: req.method }, 'Method not allowed');
    throw new BadRequestError(`Method ${req.method} not allowed`);
  }

  const contentLength = parseInt((req.headers['content-length'] as string) || '0', 10);
  if (contentLength > MAX_BODY_SIZE) {
    logger.warn({ contentLength }, 'Request body too large');
    throw new BadRequestError('Request body too large');
  }

  return next();
}

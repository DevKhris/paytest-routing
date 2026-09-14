import { BadRequestError } from '../errors.js';
import { createChildLogger } from '../logger.js';

const logger = createChildLogger({ component: 'validator' });

const ALLOWED_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
const MAX_BODY_SIZE = 10 * 1024 * 1024;

export function validator(req, res, next) {
  if (!ALLOWED_METHODS.includes(req.method)) {
    logger.warn({ method: req.method }, 'Method not allowed');
    throw new BadRequestError(`Method ${req.method} not allowed`);
  }

  const contentLength = parseInt(req.headers['content-length'] || '0', 10);
  if (contentLength > MAX_BODY_SIZE) {
    logger.warn({ contentLength }, 'Request body too large');
    throw new BadRequestError('Request body too large');
  }

  if (req.headers['content-type']?.includes('application/json')) {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > MAX_BODY_SIZE) {
        req.destroy();
        throw new BadRequestError('Request body too large');
      }
    });

    req.on('end', () => {
      if (body) {
        try {
          JSON.parse(body);
        } catch {
          throw new BadRequestError('Invalid JSON in request body');
        }
      }
      return next();
    });
    return;
  }

  return next();
}

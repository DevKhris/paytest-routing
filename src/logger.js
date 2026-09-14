import pino from 'pino';
import { config } from './config.js';

export const logger = pino({
  level: config.logLevel,
  formatters: {
    level: (label) => ({ level: label }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  serializers: {
    err: pino.stdSerializers.err,
    req: pino.stdSerializers.req,
    res: pino.stdSerializers.res,
  },
  redact: {
    paths: ['req.headers.authorization', 'req.headers["x-api-key"]', '*.password', '*.secret'],
    remove: true,
  },
});

export function createChildLogger(context) {
  return logger.child(context);
}

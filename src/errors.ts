export class AppError extends Error {
  statusCode: number;
  code: string;
  details: unknown;
  isOperational: boolean;

  constructor(message: string, statusCode: number, code: string, details: unknown = null) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class BadRequestError extends AppError {
  constructor(message = 'Bad Request', details: unknown = null) {
    super(message, 400, 'BAD_REQUEST', details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized', details: unknown = null) {
    super(message, 401, 'UNAUTHORIZED', details);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden', details: unknown = null) {
    super(message, 403, 'FORBIDDEN', details);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Not Found', details: unknown = null) {
    super(message, 404, 'NOT_FOUND', details);
  }
}

export class RateLimitError extends AppError {
  constructor(message = 'Too Many Requests', details: unknown = null) {
    super(message, 429, 'RATE_LIMIT_EXCEEDED', details);
  }
}

export class BadGatewayError extends AppError {
  constructor(message = 'Bad Gateway', details: unknown = null) {
    super(message, 502, 'BAD_GATEWAY', details);
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(message = 'Service Unavailable', details: unknown = null) {
    super(message, 503, 'SERVICE_UNAVAILABLE', details);
  }
}

export class CircuitOpenError extends AppError {
  constructor(backendId: number) {
    super(`Circuit open for backend ${backendId}`, 503, 'CIRCUIT_OPEN', { backendId });
  }
}

export function errorHandler(err: AppError, req: { id?: string }, res: { status: (code: number) => { json: (body: unknown) => unknown } }, _next: () => void) {
  if (err.isOperational) {
    return res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
        details: err.details,
        requestId: req.id,
      },
    });
  }

  return res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
      requestId: req.id,
    },
  });
}

export class HttpError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function notFound(message = 'Resource not found') {
  return new HttpError(404, 'NOT_FOUND', message);
}

export function badRequest(message = 'Bad request', details) {
  return new HttpError(400, 'BAD_REQUEST', message, details);
}

export function unauthorized(message = 'Unauthorized') {
  return new HttpError(401, 'UNAUTHORIZED', message);
}

export function forbidden(message = 'Forbidden') {
  return new HttpError(403, 'FORBIDDEN', message);
}

export function conflict(message = 'Conflict') {
  return new HttpError(409, 'CONFLICT', message);
}

export function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

export function errorMiddleware(error, req, res, next) {
  if (res.headersSent) {
    next(error);
    return;
  }

  if (error instanceof HttpError) {
    const payload = {
      code: error.code,
      message: error.message,
    };

    if (error.details) {
      payload.details = error.details;
    }

    res.status(error.status).json(payload);
    return;
  }

  if (error?.code === '23505') {
    res.status(409).json({ code: 'CONFLICT', message: 'Resource already exists' });
    return;
  }

  if (error?.code === '22P02') {
    res.status(400).json({ code: 'BAD_REQUEST', message: 'Invalid request format' });
    return;
  }

  console.error(error);
  res.status(500).json({ code: 'INTERNAL_ERROR', message: 'Internal server error' });
}

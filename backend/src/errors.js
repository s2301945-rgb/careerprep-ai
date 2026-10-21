export class ApiError extends Error {
  constructor(status, code, message, retryable = false, details) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.retryable = retryable;
    this.details = details;
  }
}

export function sendError(response, requestId, error, headers = {}) {
  const apiError = error instanceof ApiError
    ? error
    : new ApiError(500, "INTERNAL_ERROR", "The request could not be completed.", true);

  const body = {
    error: {
      code: apiError.code,
      message: apiError.message,
      retryable: apiError.retryable,
      request_id: requestId,
      ...(apiError.details ? { details: apiError.details } : {}),
    },
  };

  response.writeHead(apiError.status, {
    ...headers,
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Request-Id": requestId,
    "X-Content-Type-Options": "nosniff",
  });
  response.end(JSON.stringify(body));
}

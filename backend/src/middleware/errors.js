export function notFound(req, res) {
  res.status(404).json({
    error: 'not_found',
    message: `No route for ${req.method} ${req.originalUrl}`
  })
}

export function errorHandler(error, req, res, next) {
  if (res.headersSent) {
    return next(error)
  }

  const status = Number(error.status || error.statusCode || 500)
  if (status >= 500) {
    console.error('[api] unhandled error', {
      requestId: req.id,
      path: req.originalUrl,
      message: error.message,
      stack: error.stack
    })
  }

  res.status(status).json({
    error: error.code || 'internal_error',
    message: status >= 500 ? 'Unexpected server error.' : error.message,
    requestId: req.id
  })
}

import crypto from 'node:crypto'
import os from 'node:os'
import cors from 'cors'
import express from 'express'
import rateLimit from 'express-rate-limit'
import helmet from 'helmet'
import { config } from './config.js'
import { errorHandler, notFound } from './middleware/errors.js'
import authRoutes from './routes/auth.js'
import healthRoutes from './routes/health.js'
import syncRoutes from './routes/sync.js'

function isAllowedOrigin(origin) {
  if (!origin) return true
  if (config.corsOrigins.includes(origin)) return true

  // Development convenience only. Production must use an explicit allowlist.
  if (!config.isProduction) {
    try {
      const url = new URL(origin)
      return ['localhost', '127.0.0.1', '::1'].includes(url.hostname)
    } catch {
      return false
    }
  }

  return false
}

export function createApp() {
  const app = express()

  if (config.trustProxy !== 'false') {
    app.set('trust proxy', Number(config.trustProxy) || 1)
  }

  app.disable('x-powered-by')

  app.use((req, res, next) => {
    req.id = req.headers['x-request-id'] || crypto.randomUUID()
    res.set('X-Request-Id', req.id)
    res.set('X-Served-By', os.hostname())
    next()
  })

  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      contentSecurityPolicy: false
    })
  )

  app.use(
    cors({
      origin(origin, callback) {
        if (isAllowedOrigin(origin)) return callback(null, true)
        return callback(new Error(`Origin ${origin} is not allowed by CORS`))
      },
      methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: [
        'Authorization',
        'Content-Type',
        'X-Request-Id',
        'X-Supabase-Token',
        'X-Idempotency-Key'
      ],
      exposedHeaders: ['X-Request-Id', 'X-Served-By'],
      credentials: false,
      maxAge: 600
    })
  )

  app.use(express.json({ limit: '1mb' }))

  app.use(
    rateLimit({
      windowMs: 60 * 1000,
      limit: 300,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      message: {
        error: 'rate_limited',
        message: 'Too many requests. Slow down and try again.'
      }
    })
  )

  app.use(healthRoutes)
  app.use('/api/health', healthRoutes)
  app.use('/api/auth', authRoutes)
  app.use('/api/sync', syncRoutes)

  app.get('/api', (req, res) => {
    res.json({
      service: 'finance-suite-api',
      version: '1.0.0',
      docs: '/api/healthz',
      auth: ['/api/auth/token', '/api/auth/refresh', '/api/auth/logout', '/api/auth/me'],
      sync: ['/api/sync/mutations', '/api/sync/capabilities']
    })
  })

  app.use(notFound)
  app.use(errorHandler)

  return app
}

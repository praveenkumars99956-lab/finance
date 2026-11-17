import os from 'node:os'
import { Router } from 'express'
import { config } from '../config.js'

const router = Router()
const startedAt = Date.now()

function healthPayload() {
  return {
    status: 'ok',
    service: 'finance-suite-api',
    node: os.hostname(),
    pid: process.pid,
    uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
    environment: config.nodeEnv,
    stateless: true,
    timestamp: new Date().toISOString()
  }
}

router.get('/healthz', (req, res) => {
  res.set('Cache-Control', 'no-store')
  res.json(healthPayload())
})

router.get('/readyz', (req, res) => {
  const configured = Boolean(config.supabase.url && config.supabase.anonKey)
  res.status(configured ? 200 : 503).json({
    ...healthPayload(),
    status: configured ? 'ready' : 'not_ready',
    supabaseConfigured: configured,
    jwtConfigured: Boolean(config.jwt.accessSecret && config.jwt.refreshSecret)
  })
})

export default router

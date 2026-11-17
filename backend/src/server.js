import os from 'node:os'
import { createApp } from './app.js'
import { assertProductionSecrets, config } from './config.js'

assertProductionSecrets()

const app = createApp()

const server = app.listen(config.port, () => {
  console.log(
    `[api] finance-suite-api listening on :${config.port} node=${os.hostname()} env=${config.nodeEnv}`
  )
})

function shutdown(signal) {
  console.log(`[api] received ${signal}, shutting down`)
  server.close((error) => {
    if (error) {
      console.error('[api] shutdown failed', error)
      process.exit(1)
    }
    process.exit(0)
  })

  setTimeout(() => process.exit(1), 10_000).unref()
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))

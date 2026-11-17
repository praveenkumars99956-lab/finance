import { Router } from 'express'
import { config } from '../config.js'
import { readSupabaseToken, requireAuth } from '../middleware/auth.js'
import {
  readIdempotentResult,
  writeIdempotentResult
} from '../services/idempotency.js'
import {
  supabaseForUser,
  verifySupabaseToken
} from '../services/supabase.js'

const router = Router()

// Only business tables that the offline outbox is allowed to replay. The table
// is still protected by RLS, but an allowlist prevents the sync endpoint from
// becoming a generic "write anything" proxy.
const TABLE_ACTIONS = {
  customers: ['insert', 'update', 'delete'],
  collection_categories: ['insert', 'update', 'delete'],
  collection_evidence: ['insert'],
  finance_records: ['insert'],
  finance_payments: ['insert'],
  finance_principal_adjustments: ['insert'],
  app_settings: ['update']
}

const RPC_ALLOWLIST = new Set([
  'record_payment',
  'record_agent_payment',
  'record_interest_only_payment',
  'apply_interest_only_payment',
  'adjust_interest_only_principal',
  'schedule_interest_only_due_date',
  'create_daily_loan',
  'create_weekly_loan',
  'create_monthly_loan',
  'create_interest_only_loan',
  'claim_idempotency_key'
])

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export function validateMutation(mutation) {
  if (!isPlainObject(mutation)) {
    return 'Mutation must be an object.'
  }

  if (mutation.action === 'rpc') {
    if (!RPC_ALLOWLIST.has(String(mutation.rpc || ''))) {
      return `RPC "${mutation.rpc}" is not allowlisted for offline replay.`
    }
    if (!isPlainObject(mutation.args || {})) {
      return 'RPC args must be an object.'
    }
    return null
  }

  const actions = TABLE_ACTIONS[mutation.table]
  if (!actions) {
    return `Table "${mutation.table}" is not allowlisted for offline replay.`
  }
  if (!actions.includes(mutation.action)) {
    return `Action "${mutation.action}" is not allowed on ${mutation.table}.`
  }

  if (mutation.action === 'insert' && !isPlainObject(mutation.payload)) {
    return 'Insert payload must be an object.'
  }

  if (mutation.action === 'update') {
    if (!isPlainObject(mutation.payload) || Object.keys(mutation.payload).length === 0) {
      return 'Update payload must be a non-empty object.'
    }
    if (!isPlainObject(mutation.match) || Object.keys(mutation.match).length === 0) {
      return 'Update match must be a non-empty object.'
    }
  }

  if (mutation.action === 'delete') {
    if (!isPlainObject(mutation.match) || Object.keys(mutation.match).length === 0) {
      return 'Delete match must be a non-empty object.'
    }
  }

  return null
}

async function executeMutation(client, mutation) {
  if (mutation.action === 'rpc') {
    return client.rpc(mutation.rpc, mutation.args || {})
  }

  if (mutation.action === 'insert') {
    let query = client.from(mutation.table).insert(mutation.payload)
    if (mutation.returning === 'single') {
      query = query.select().single()
    }
    return query
  }

  if (mutation.action === 'update') {
    return client
      .from(mutation.table)
      .update(mutation.payload)
      .match(mutation.match)
  }

  return client.from(mutation.table).delete().match(mutation.match)
}

/**
 * Replay an offline outbox.
 *
 * The app JWT authenticates the caller to this API. The Supabase token
 * authenticates the same caller to Postgres, so a sync batch can never write
 * outside the user's workspace or role.
 */
router.post('/mutations', requireAuth, async (req, res, next) => {
  try {
    const supabaseToken = readSupabaseToken(req)
    if (!supabaseToken) {
      return res.status(400).json({
        error: 'missing_supabase_token',
        message: 'Offline replay requires the current Supabase access token.'
      })
    }

    const { user, error: verifyError } = await verifySupabaseToken(supabaseToken)
    if (verifyError || !user || user.id !== req.auth.userId) {
      return res.status(401).json({
        error: 'token_mismatch',
        message: 'The Supabase token does not belong to this API session.'
      })
    }

    const mutations = Array.isArray(req.body?.mutations) ? req.body.mutations : []
    if (mutations.length === 0) {
      return res.json({ processed: 0, succeeded: 0, failed: 0, results: [] })
    }
    if (mutations.length > config.sync.maxBatch) {
      return res.status(413).json({
        error: 'batch_too_large',
        message: `A batch may contain at most ${config.sync.maxBatch} mutations.`
      })
    }

    const client = supabaseForUser(supabaseToken)
    const results = []

    for (const mutation of mutations) {
      const id = mutation?.id || null
      const idempotencyKey = mutation?.idempotencyKey
        ? `${req.auth.userId}:${mutation.idempotencyKey}`
        : null

      const replay = readIdempotentResult('sync', idempotencyKey)
      if (replay) {
        results.push({ id, ok: true, replayed: true, data: replay })
        continue
      }

      const validationError = validateMutation(mutation)
      if (validationError) {
        results.push({ id, ok: false, error: validationError })
        continue
      }

      try {
        const { data, error } = await executeMutation(client, mutation)
        if (error) {
          results.push({
            id,
            ok: false,
            error: error.message,
            code: error.code || null
          })
          continue
        }

        const value = { data }
        writeIdempotentResult('sync', idempotencyKey, value)
        results.push({ id, ok: true, data })
      } catch (error) {
        results.push({ id, ok: false, error: error.message })
      }
    }

    const succeeded = results.filter((result) => result.ok).length
    const failed = results.length - succeeded

    return res.status(failed > 0 && succeeded === 0 ? 422 : 200).json({
      processed: results.length,
      succeeded,
      failed,
      results
    })
  } catch (error) {
    return next(error)
  }
})

router.get('/capabilities', requireAuth, (req, res) => {
  res.json({
    tables: TABLE_ACTIONS,
    rpcs: [...RPC_ALLOWLIST],
    maxBatch: config.sync.maxBatch
  })
})

export default router

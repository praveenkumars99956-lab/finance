# Finance Suite API

Stateless **JWT** API that sits beside Supabase. It adds three things the
browser cannot safely do on its own:

1. **Short-lived app tokens** — 15-minute access tokens and 30-day rotating
   refresh tokens. Any number of API nodes can verify them, so no session store
   or sticky session is required.
2. **Offline outbox replay** — queued browser writes are replayed through the
   caller's own Supabase token, so RLS, role bindings, and workspace isolation
   still apply.
3. **A CORS-controlled multi-server entry point** — an explicit origin
   allowlist, request IDs, rate limiting, and per-node health metadata.

## Quick start

```bash
cd backend
cp .env.example .env
npm install
npm run dev
```

Health: `GET http://localhost:4000/healthz`

## Token flow

```
browser ──(Supabase password login)──▶ Supabase Auth
   │                                        │
   │  Supabase access token                 │
   ▼                                        ▼
POST /api/auth/token ──verify token──▶ Supabase Auth
   │
   ├── load profile with the *caller's* token (RLS applies)
   └── issue app access + refresh JWT
```

The browser keeps using the Supabase client for normal data access. The app
token is only presented to this API. `POST /api/sync/mutations` requires both:

| Header | Purpose |
|---|---|
| `Authorization: Bearer <app-access-token>` | who is calling this API |
| `X-Supabase-Token: <supabase-access-token>` | what Postgres may do via RLS |

## Offline replay

```json
POST /api/sync/mutations
{
  "mutations": [
    {
      "id": "local-1",
      "table": "customers",
      "action": "insert",
      "payload": { "customer_id": "CUS...", "full_name": "Asha" },
      "idempotencyKey": "customer-CUS..."
    }
  ]
}
```

Only allowlisted tables/actions and RPCs are accepted (see
`src/routes/sync.js`). Results are returned per mutation, so one bad row does
not discard the rest of the batch.

## Production notes

- Set `CORS_ORIGINS` to the exact web origins. `*` is never used.
- Use two different 32+ character JWT secrets.
- Run at least two replicas behind the same gateway. Tokens are stateless; no
  replica affinity is needed.
- Keep `SUPABASE_SERVICE_ROLE_KEY` unset unless a background job truly needs it.
  The sync route never uses it.
- `npm test` runs the token and validation suites with `node --test`.

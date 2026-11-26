# Finance Suite — Architecture & Operations

This document describes how the application is deployed across multiple
servers, how roles are isolated, and how the data layer stays consistent under
concurrent financial writes. It reflects the code in `frontend/` and the
additive migrations in `supabase/migrations/`.

---

## 1. Topology

```
                    ┌─────────────────────────────┐
   browsers ───────▶│  HAProxy  :8080 / :8404     │
                    │  sticky cookie = SERVERID   │
                    └──────────┬──────────┬───────┘
                               │          │
                     ┌─────────▼──┐  ┌────▼───────┐
                     │  web1      │  │  web2      │   (static React SPA +
                     │  nginx     │  │  nginx     │    immutable assets)
                     └─────┬──────┘  └────┬───────┘
                           │              │
                    ┌──────▼──────────────▼───────┐
                    │  Redis (shared cache)       │
                    └──────────────┬──────────────┘
                                   │
                    ┌──────────────▼──────────────┐
                    │  PgBouncer (transaction)    │
                    └──────────────┬──────────────┘
                                   │
                    ┌──────────────▼──────────────┐
                    │  Postgres primary           │
                    │  synchronous_commit = on    │
                    │  + synchronous replica      │
                    └─────────────────────────────┘
```

Files:

| Concern | File |
|---|---|
| Web replicas, API replicas, Redis, PgBouncer | `deploy/docker-compose.yml` |
| Sticky web gateway + round-robin `/api` | `deploy/haproxy.cfg` |
| Static asset server + SPA fallback | `frontend/nginx.conf` |
| Stateless JWT + offline replay API | `backend/src/app.js`, `backend/src/routes/` |
| Browser JWT bridge / API client | `frontend/src/services/jwtSession.js`, `apiClient.js` |
| IndexedDB cache + outbox | `frontend/src/services/offlineDb.js`, `offlineSync.js` |
| Redux store / slices | `frontend/src/store/` |
| Multilingual dictation | `frontend/src/hooks/useVoiceInput.js`, `components/VoiceInputButton.jsx` |
| Postgres tuning / ACID settings | `deploy/postgresql.conf` |
| Cache policy | `deploy/redis.conf` |

---

## 2. Multi-server deployment and sticky sessions

### Why sticky sessions
Supabase issues stateless JWTs, so a request can be served by any node. We still
enable stickiness because it is defence-in-depth:

- node-local short-lived caches stay coherent with the browser that populated them;
- any future server-rendered middleware, signed cookie, or websocket keeps a
  stable home;
- in-flight auth refreshes do not race across nodes.

### How it is configured
`deploy/haproxy.cfg` pins each browser to a node for the lifetime of the
`SERVERID` cookie:

```
backend web_nodes
  balance roundrobin
  cookie SERVERID insert indirect nocache httponly samesite=lax
  server web1 web1:80 check cookie s1
  server web2 web2:80 check cookie s2
```

- `insert` — HAProxy adds the cookie.
- `indirect` — the cookie is stripped before reaching nginx.
- `nocache` — no intermediate caching of the cookie.
- `httponly` + `samesite=lax` — not readable by JS, safe for top-level navigation.

Because the session authority is the JWT (not node memory), losing stickiness
never logs a user out and never changes their role. The cookie only improves
locality.

### Scaling out
Add replicas to `docker-compose.yml` and the matching `server` line in
`haproxy.cfg`. Keep the same image digest across replicas. Every replica must
run the same build; environment values such as `VITE_ADMIN_EMAILS` are baked in
at build time.

### Cache in a multi-node world
Redis is a shared **read-through** cache. Coherence is anchored in Postgres by
`public.workspace_cache_versions` (migration
`20261113110000_concurrency_and_cache_coherence.sql`). Every write to a
business table bumps that workspace's version in the same transaction. A node
only serves a cached payload if its version matches the database version, so a
write on `web1` invalidates `web2` within one version check.

---

## 3. Role-based access control (email-bound, server-verified)

### Roles and route ownership

| Role | Home | Allowed routes |
|---|---|---|
| `admin` | `/admin` | every admin route, `/weekly`, `/monthly` |
| `agent` | `/agent` | `/agent/*` only |

The former `/client` portal is retired: the route is gone and the URL is denied
to every role. There is no crossover between `/agent/*` and the admin console. `AuthBoundary`
redirects a mismatched role to its own home instead of rendering the wrong
portal.

### Resolution order
1. `public.current_user_role()` — database function, authoritative.
2. Email binding from `public.role_bindings`.
3. `public.profiles.role`.
4. JWT metadata claim (only when the database is unreachable).
5. `client` (server-side least privilege only; the frontend denies it and signs out).

The frontend mirror of this order is `frontend/src/services/rbac.js`
(`resolveAccess`). The server result is loaded by
`frontend/src/services/access.js`; the RPC is optional and fails closed to the
profile role while the migration is pending.

### Email bindings

```sql
-- Bind an administrator
insert into public.role_bindings (email, role, note)
values ('owner@example.com', 'admin', 'Primary owner')
on conflict (email) do update set role = excluded.role, active = true;

-- Bind an agent
insert into public.role_bindings (email, role)
values ('agent.one@example.com', 'agent')
on conflict (email) do update set role = excluded.role, active = true;

-- Revoke access without deleting history
update public.role_bindings set active = false where email = 'agent.one@example.com';
```

The frontend can additionally enforce a build-time allowlist:

```
VITE_ADMIN_EMAILS=owner@example.com
VITE_AGENT_EMAILS=agent.one@example.com
VITE_ADMIN_EMAIL_DOMAINS=example.com
VITE_RBAC_STRICT=false
```

- A binding and a profile role that disagree are treated as a **conflict** and
  denied at login until corrected.
- `VITE_RBAC_STRICT=true` gives unbound accounts no frontend role and signs them
  out. Enable it only after `role_bindings` is populated.

### Isolation enforced at three layers
1. **SPA** — `AuthBoundary` consults the resolved role for every protected path.
2. **Database function** — `current_user_role()` is `SECURITY DEFINER` and
   reads the JWT email, so a forged client-side role has no effect.
3. **Database triggers / RLS**
   - `profiles_enforce_role_binding` rejects role drift.
   - `finance_records_enforce_insert_role` rejects loan creation by agents.
   - `role_bindings` is readable/writable only by admins (RLS).
   - The existing workspace isolation triggers remain untouched.

---

## 4. Concurrency and ACID guarantees

### Transaction policy

| Operation | Isolation | Extra guard |
|---|---|---|
| Payment insert / settlement | `SERIALIZABLE` | `finance_lock_workspace(workspace_id)` |
| Loan creation + schedule | one transaction | advisory lock + idempotency key |
| Profile / role change | `READ COMMITTED` | binding trigger |
| Read-only dashboards | `READ COMMITTED` | cache version check |

Use a single Postgres transaction for anything that moves money. Never split a
balance update and its ledger row across two API calls, and never perform the
second step in the browser.

### Advisory lock — serialised writes per workspace

```sql
select public.finance_lock_workspace(p_workspace_id);

-- ... read current balances, insert payment, update finance_records.pending ...
-- lock is released automatically at COMMIT/ROLLBACK
```

Because the lock key is derived from `workspace_id`, unrelated tenants (and
unrelated workspaces) still write in parallel. This gives a single serial
history per workspace across every app node.

### Idempotency — safe retries

```sql
select public.claim_idempotency_key(
  'record_payment',
  p_client_request_id,
  p_workspace_id,
  p_request_hash
);
-- false → the request already committed; return the stored response instead
```

The primary key `(workspace_id, scope, key)` makes duplicate submissions
impossible even when two nodes race.

### Durability
- `synchronous_commit = on` — a commit is acknowledged only after the WAL is
  flushed.
- With `synchronous_standby_names`, a commit also waits for a replica, closing
  the window where a primary failure loses an acknowledged payment.
- `statement_timeout`, `lock_timeout`, and
  `idle_in_transaction_session_timeout` prevent a stuck client from holding
  locks and stalling the queue.

### Connection pooling
PgBouncer runs in `transaction` mode with `DEFAULT_POOL_SIZE=50`:

- keeps backend count far below `max_connections = 400`;
- transaction pooling is compatible with the advisory **xact** lock and
  `SERIALIZABLE` transactions;
- avoid session-level features (`SET` without `LOCAL`, prepared statements
  outside the driver cache, session advisory locks) when adding new RPCs.

### Read scaling
Route analytical reads to a replica, never financial writes. A read replica may
lag; the API must perform read-your-writes checks on the primary after a
mutation, or wait for the replica LSN.

---

## 5. What "zero lag / real-time" means here

Absolute zero latency across arbitrary networks is not physically achievable.
The system targets and enforces the following:

| Property | Guarantee |
|---|---|
| Acknowledged write durability | WAL flushed before HTTP 200 (`synchronous_commit=on`) |
| Lost updates between concurrent payments | impossible per workspace (advisory lock / serializable) |
| Duplicate payment from a retry | impossible (`claim_idempotency_key`) |
| Stale cache after a write | bounded by one version read (single-digit ms in-region) |
| Role bleed between admin/agent | denied at SPA, RPC, and trigger layers |
| Cross-node state divergence | none for committed writes; single primary |

The UI should additionally refresh on window focus / visibility change so a
long-open dashboard reconciles with the primary without a socket.

---

## 6. Deployment runbook

1. **Back up first**
   ```bash
   supabase db dump --schema public -f backup-$(date +%Y%m%d).sql
   ```
2. **Apply additive migrations** (they create objects only; nothing is dropped)
   ```bash
   supabase db push
   ```
3. **Seed role bindings** for the first administrators (SQL in section 3).
4. **Build images** with the production environment:
   ```bash
   docker compose -f deploy/docker-compose.yml build
   ```
5. **Start the stack**
   ```bash
   docker compose -f deploy/docker-compose.yml up -d
   ```
6. **Verify**
   - `GET http://localhost:8080/healthz` → `ok`
   - `http://localhost:8404/stats` → both servers green
   - sign in as admin → `/admin`; as agent → `/agent`
   - attempt `/agent` as admin → redirected to `/admin`
   - attempt `/admin` as agent → redirected to `/agent`
7. **Roll forward** by rebuilding and recreating replicas one at a time; the
   gateway drains connections.

### Rollback
The migrations are additive. Rolling back the application image is safe. To
remove the new objects entirely (only if you also remove their features):

```sql
drop function if exists public.claim_idempotency_key(text, text, uuid, text);
drop function if exists public.finance_lock_workspace(uuid);
drop table if exists public.idempotency_keys;
drop table if exists public.workspace_cache_versions;
drop table if exists public.role_bindings;
```

Never roll back by restoring a dump that predates live payments without
reconciling those payments first.

---

## 7. Language support

`frontend/src/i18n/i18n.js` loads six locales:

| Code | Language | Coverage |
|---|---|---|
| `en` | English | complete (source) |
| `hi` | हिन्दी | complete |
| `ml` | മലയാളം | complete |
| `ta` | தமிழ் | complete |
| `te` | తెలుగు | complete |
| `kn` | ಕನ್ನಡ | complete |

The selected language is persisted in `localStorage` under
`finance-language`, applied to `<html lang>`, and available from the selector in
the top navigation on every page. Run `npm run i18n:check` to verify key and
placeholder parity before shipping.

---

## 8. Stateless API tier (Express + CORS)

`backend/` is an optional Express API that runs beside Supabase. It never
replaces the Supabase client: normal reads and writes still go directly to
PostgREST, and the API exists for two narrow jobs:

1. Issue short-lived **app JWTs** after verifying the caller's Supabase session.
2. Replay the browser's offline outbox with the caller's own Supabase token, so
   RLS, role bindings, and workspace isolation still apply.

### Token flow

```
browser ──(Supabase password login)──▶ Supabase Auth
   │                                        │
   │  Supabase access token                 │
   └────────────────────────────────────────┘
        │
        ▼
POST /api/auth/token ──verify──▶ Supabase Auth
        │
        ├─ load profile with the caller's token (RLS applies)
        └─ issue app access JWT (15m) + rotating refresh JWT (30d)
```

The access and refresh tokens are signed with two different secrets. Any API
replica can verify them, so there is no session table, no sticky requirement,
and no shared login state. Logging out rotates the refresh token and drops the
browser copy; rotating `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` invalidates
every app token without touching Supabase sessions.

### Required headers

| Header | Purpose |
|---|---|
| `Authorization: Bearer <app-access-token>` | identifies the caller to this API |
| `X-Supabase-Token: <supabase-access-token>` | what Postgres may do via RLS |

`POST /api/sync/mutations` requires both. The API never uses a service-role key
for replay, and the route only accepts allowlisted tables, actions, and RPCs
(`backend/src/routes/sync.js`).

### CORS and hardening

- `CORS_ORIGINS` is an explicit comma-separated allowlist. Wildcards are not
  used with credentials; development adds loopback origins only when
  `NODE_ENV !== production`.
- Helmet, request IDs (`X-Request-Id`), `X-Served-By`, rate limiting, and a
  1 MB JSON body limit are applied globally.
- `/healthz` and `/readyz` are unauthenticated liveness/readiness probes.

### Supabase-only mode

`VITE_API_URL` is the switch. When it is empty:

- the JWT bridge does not run;
- the `/api` proxy and API containers are unused;
- offline writes replay through the Supabase client itself;
- every existing Supabase auth and data flow behaves exactly as before.

### Multiple API replicas

`deploy/haproxy.cfg` sends `/api/*` to `api_nodes` with round-robin balancing
and no cookie affinity. `deploy/docker-compose.yml` starts `api1` and `api2`
from the same image. Add replicas by copying the service and adding one
`server` line. Health checks use `GET /healthz` on port 4000.

---

## 9. Offline-first data path

The browser owns durability for data entry until the network returns.

| Store | Contents | Lifetime |
|---|---|---|
| `cache` | read-through copies of server rows | TTL per query (default 5 min) |
| `outbox` | pending inserts/updates/deletes | until acknowledged by server |
| `meta` | last sync time, schema version | persistent |

`frontend/src/services/offlineDb.js` uses IndexedDB with an in-memory fallback
for private mode, SSR, and tests. `offlineSync.js` provides:

- `cacheQuery(key, loader, { ttlMs })` — online read refreshes the cache; an
  offline or failed read returns the newest cached copy with `fromCache: true`.
- `enqueueMutation(...)` — writes a durable row and schedules a drain.
- `flushOutbox()` — sends at most 50 ready rows; each row is acknowledged or
  backed off individually, so one bad mutation cannot discard the batch.

### Replay guarantees

- Every mutation carries an `idempotencyKey`. The API and the database RPCs use
  it to make retries harmless.
- The API forwards the Supabase token; replay cannot exceed the caller's RLS
  permissions or cross a workspace boundary.
- Rows that fail are retried with exponential backoff (`30s`, then doubling, up
  to 30 minutes) and remain visible in the sync badge.
- Without `VITE_API_URL`, replay uses the Supabase client directly with the
  same allowlist and the same RLS enforcement.

### What is queued, and what is not

Queued offline writes currently cover customer records and settings — the
non-financial rows where a delayed write cannot corrupt a balance.

Collection and payment **posting** is deliberately online-only:

- The posting RPC (`record_daily_payment`, weekly/monthly equivalents) derives
  `balance_before`/`balance_after` from the current row. Replaying it later
  against newer data would double-count or misstate a balance.
- `collection_evidence` is only meaningful next to a proof file that must first
  be uploaded to storage and a GPS fix taken at the moment of collection.
  Neither can be replayed faithfully from a queue.
- Rejecting the entry immediately, while the agent is still with the customer,
  keeps the audit trail trustworthy.

Reads stay available offline: `Collections` and `Payments` render the newest
cached copy with an "offline cached data" banner instead of an empty screen.

### Service worker

`frontend/public/sw.js` caches the app shell and handles a `sync` event that
wakes the page with `FINANCE_FLUSH_OUTBOX`. It never caches API responses that
contain credentials and never stores Supabase or app-JWT tokens. Registration
is skipped when the browser does not support service workers, so the app still
runs over plain HTTP on a LAN.

---

## 10. Redux application state

`frontend/src/store/index.js` configures Redux Toolkit with three slices:

| Slice | Owns | Does not own |
|---|---|---|
| `auth` | resolved role, workspace, email, access status | passwords or raw tokens |
| `sync` | online flag, outbox count, sync status, last error | queued payload contents |
| `ui` | theme, language, layout preferences | server data |

Tokens stay in Supabase's storage and the JWT bridge's own `localStorage`
entry. Redux is a view of state, not a credential store. `AuthBoundary` reads
the role from Redux and caches the access context for 60 seconds; a role change
is picked up on the next auth event or reload. Components subscribe to `sync`
to show the offline badge and to trigger a manual flush.

Server data is intentionally **not** copied into Redux. `Customers`, `Payments`,
and `Collections` use `cacheQuery`, and IndexedDB remains the offline source of
truth, which avoids a second stale cache and keeps memory bounded on long
shifts.

---

## 11. Multilingual voice input

`frontend/src/hooks/useVoiceInput.js` wraps the browser Web Speech API
(`SpeechRecognition` / `webkitSpeechRecognition`):

- `VoiceLanguageSelector` offers a catalogue of BCP-47 locales plus an
  auto-detect option.
- `VoiceInputButton` starts/stops dictation and appends the recognized text to
  the field, so a user can mix typed and spoken input.
- `FloatingVoiceButton` is the screen-level version, fixed bottom-right on every
  route. It resolves the recognition language from the app's language settings
  (`ui.voiceLanguage` when set explicitly, otherwise the current i18n locale
  mapped to one BCP-47 code), so a tap starts exactly one recogniser with no
  auto-detect pass. It remembers the last focused text field, requests the
  microphone directly from the click gesture, and writes the transcript at the
  caret via `src/utils/dictation.js`. Listening shows animated rings, a rose
  recording dot, and a live transcript pill above the button; Escape or a
  second tap stops it.
- Recognition is on-device or browser-vendor-hosted depending on the browser;
  audio is never sent to this application's API.
- Microphone permission is requested only when the button is pressed. The
  nginx production config allows it with `Permissions-Policy:
  microphone=(self)`.
- If the API is unavailable (Firefox, unsupported browser, denied permission),
  the button hides or reports a normal error and typing continues to work.

Voice is additive: no field requires it, and dictation never submits a form.


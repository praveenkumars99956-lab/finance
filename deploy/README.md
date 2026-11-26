# Deployment quick start

Full rationale: [`../docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md).

## 1. Environment

Create `deploy/.env`:

```dotenv
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key

# Public origin the browser uses for the API. In this compose stack HAProxy
# routes /api to the api1/api2 replicas, so the gateway origin is correct.
VITE_API_URL=http://localhost:8080
CORS_ORIGINS=http://localhost:8080

# JWT signing material for the stateless API. Use two different 32+ character
# random strings. Rotating them signs every user out of the API layer only.
JWT_ACCESS_SECRET=replace-with-at-least-32-random-characters
JWT_REFRESH_SECRET=replace-with-a-different-32-character-secret
JWT_ISSUER=finance-suite
JWT_AUDIENCE=finance-suite-web
JWT_ACCESS_TTL=15m
JWT_REFRESH_TTL=30d
SYNC_MAX_BATCH=100

# Email-bound RBAC
VITE_ADMIN_EMAILS=owner@example.com
VITE_AGENT_EMAILS=agent.one@example.com
VITE_ADMIN_EMAIL_DOMAINS=
VITE_RBAC_STRICT=false

# Database (PgBouncer target)
DB_HOST=db.example.com
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=change-me

# Redis
REDIS_PASSWORD=change-me
```

Set `VITE_API_URL` to an empty string to run in Supabase-only mode. The SPA,
Supabase auth, and all existing data flows keep working; the JWT exchange and
the `/api` proxy are simply unused.

## 2. Database

```bash
supabase db push          # applies the additive RBAC + concurrency migrations
```

Then bind the first administrators (see docs, section 3).

## 3. Run

```bash
docker compose -f deploy/docker-compose.yml up -d --build
```

- App: <http://localhost:8080>
- API health: <http://localhost:8080/api/healthz> (routed to api replicas)
- HAProxy stats: <http://localhost:8404/stats>

The API replicas are stateless. `deploy/haproxy.cfg` round-robins `/api`
without sticky cookies, while the web tier keeps `SERVERID` stickiness. The
API forwards the caller's Supabase token on offline replay, so RLS, role
bindings, and workspace isolation still decide what may be written.

## 4. Offline, voice, and state

- **Offline:** the browser caches read queries in IndexedDB and queues writes
  in a durable outbox. When online, writes replay through `/api/sync/mutations`.
  With `VITE_API_URL` empty, they replay through the Supabase client instead, so
  offline data entry still works in Supabase-only deployments.
- **Service worker:** `public/sw.js` caches the app shell and wakes the page for
  background sync. It never stores Supabase or app-JWT credentials.
- **Voice:** dictation uses the browser Web Speech API. The UI lets the user pick
  a recognition language or auto-detect, and nginx allows microphone access
  with `Permissions-Policy: microphone=(self)`.
- **Redux:** `auth`, `sync`, and `ui` slices hold session context, outbox/sync
  status, and theme/language state. Server data stays in Supabase/IndexedDB.

## 4. Verify isolation

| Sign in as | Should land on | `/admin` | `/agent` |
|---|---|---|---|
| admin | `/admin` | allowed | redirect to `/admin` |
| agent | `/agent` | redirect to `/agent` | allowed |

The retired `/client` URL redirects to the signed-in role's home.

## 5. Tuning

Apply `deploy/postgresql.conf` to the primary (adjust memory to the instance),
and `deploy/redis.conf` to the cache. Replicas are added in
`deploy/docker-compose.yml` plus one `server` line in `deploy/haproxy.cfg`.

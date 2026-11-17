# Finance App — Codebase Analysis

**Analysed:** 11 Nov 2026 · `e:/Finance-app`
**Stack:** React 19.1 + Vite 7.3 + react-router-dom 7.18 (JSX, no TypeScript) · Supabase (Postgres + Auth + Storage + Edge Functions/Deno)
**Build status:** `npm run build` passes — 421 modules, 4.25 s, `dist/` emitted cleanly. No type-check, lint, or test step exists to run.

---

## 1. What the application actually is

A multi-tenant **loan / daily-collection management system** for a small lending business (Indian market: ₹ currency, `en-IN` number formatting, Tamil/Hindi/Malayalam UI).

Three roles, enforced in three separate places:

| Role | Lands on | Scope |
|---|---|---|
| `admin` | `/admin` | Full CRUD: customers, loans, categories, agents, settlements, reports, settings, audit |
| `agent` | `/agent` | Read-only view of *assigned* customers + record collections with GPS/photo proof |
| `client` | `/client` | Self-service view of own weekly/monthly loan |

**Four loan products**, each with its own creation page, schedule generator, and payment path:

- **Daily** — `finance_type='daily'`, `generate_daily_schedule()`
- **Weekly** — `finance_type='weekly'`, `generate_weekly_schedule()`
- **Monthly** — `finance_type='monthly'`, `generate_monthly_schedule()`
- **Interest-Only** — `finance_type='interest_only'`; principal is *held*, only interest is collected (`apply_interest_only_payment`), with principal adjustments and a full ledger-replay engine for backdating.

### Financial model (as the code actually computes it)

- **Daily/Weekly/Monthly:** interest is a flat informational figure `principal × rate / 100`. `amount` and `pending` are both set to the *principal* (not principal + interest). "Already Paid" is stored but deliberately does not reduce `pending`. Payments amortise `repayment_schedule` rows in `installment_number` order and decrement `pending`/`principal_outstanding` 1:1.
- **Interest-Only:** daily accrual `principal × rate × days / 3000` (i.e. a 30-day, 100%-of-principal basis). Interest accrues to `interest_due`; `pending = principal_outstanding + interest_due`. Payments may *only* clear interest — paying principal is rejected. Principal moves only via `adjust_interest_only_principal` with a mandatory reason and before/after snapshot.

### Data layer

13 tables under workspace isolation: `profiles, customers, finance_records, finance_payments, repayment_schedule, app_settings, agents, category_agent_assignments, collection_categories, collection_evidence, agent_settlements, finance_principal_adjustments, security_audit_logs` + `workspaces`.

Multi-tenancy is added *retroactively* and is genuinely well-built at the DB layer:
- Every table gets `workspace_id`, a `finance_workspace_10_scope_guard` trigger that **forces** `workspace_id` on insert and blocks cross-workspace writes, and a `finance_workspace_20_relationship_guard` trigger that verifies every FK target lives in the same workspace.
- A **restrictive** RLS policy (`finance_workspace_isolation_guard`) is ANDed with all existing policies, and an `anon` deny-all policy is added.
- Legacy rows use the sentinel workspace `00000000-0000-4000-8000-000000000001`, handled via `coalesce(workspace_id, LEGACY)` in indexes and policies.
- Login identity is namespaced per tenant by email alias: `local+<workspacehex>@domain` (`tenantAuthEmail.ts`), so the same human email can hold separate logins in separate workspaces.
- User-facing payment RPCs were renamed to `finance_unscoped_*` and re-wrapped with `finance_assert_record_workspace()` — a clean, correct pattern.

---

## 2. Findings, ordered by severity

### 🔴 P0 — The base database schema is not in the repository

`supabase/migrations/` contains 34 migrations. Only **three** create tables:

```
security_audit_logs, finance_principal_adjustments, workspaces
```

Everything else is an *alteration* of objects that already exist in someone's live database:

- `profiles, customers, finance_records, finance_payments, repayment_schedule, app_settings, agents, category_agent_assignments, collection_categories, collection_evidence, agent_settlements` — **never created**
- `generate_daily_schedule()`, `generate_weekly_schedule()`, `generate_monthly_schedule()` — **never defined**, yet `admin/Daily.jsx`, `client/Weekly.jsx` and `client/Monthly.jsx` call them and the loan creation flow hard-fails without them
- the `collection-proofs` storage bucket and its `storage.objects` policies — created out-of-band. The migration itself says so:

  > *"its storage.objects RLS policies are installed separately via the Supabase SQL Editor because the migration role does not own Supabase's managed storage.objects table."*

- Base permissive RLS policies for every table — **never defined**. Only the later restrictive policies and a handful of targeted `drop policy`/`create policy` pairs are in version control.

**Consequences:**
1. `supabase db reset` / `db start` cannot reconstruct the app. A new environment is impossible to stand up from this repo.
2. `20261101100000_add_admin_workspaces.sql` is a 400-line guard-railed migration that will `raise exception` if anything is off — it is *only* re-runnable on a database that already matches an undocumented shape.
3. You cannot audit who can read/write `finance_records` today. That is the most security-sensitive question in the app and it is unanswerable from source.

**Fix:** run `supabase db dump --schema public -f supabase/migrations/00000000000000_baseline.sql` against production (or the oldest reachable environment) and commit it as the baseline every other migration sits on top of. Do the same for the `collection-proofs` bucket policies into a `supabase/policies/` SQL file.

---

### 🔴 P0 — Loan creation is a client-side multi-step write with no transaction

`client/Weekly.jsx:416` and the parallel Monthly page do this, in sequence, from the browser:

1. `supabase.from('finance_records').insert({...30 columns...})`
2. `supabase.rpc('generate_weekly_schedule', { p_finance_record_id })`
3. show success, navigate

If step 2 fails the user sees *"Weekly Finance was created, but schedule generation failed"* — leaving a **loan record with no repayment schedule** in the database and no way to repair it from the UI. There is no cleanup, no idempotent retry, no server-side compensation.

The interest-only path was already given exactly the right treatment (`schedule_interest_only_due_date` RPC). Daily/weekly/monthly were not.

**Fix:** one `create_<type>_loan(...)` RPC that inserts the record *and* generates the schedule inside a single Postgres transaction, mirroring the pattern already used for interest-only.

### 🔴 P0 — A `client`-role page creates loans for arbitrary customers

`/weekly` and `/monthly` are routed inside `isClientPath` in `AuthBoundary` (App.jsx), so a `client` user reaches them. But `client/Weekly.jsx` is not a client-facing view — it is the **admin loan-creation form**: it inserts into `finance_records`, calls `generate_weekly_schedule`, and calls `ensureWeeklyLoanCategory()`, which *creates a collection category*.

It reads `customerId` from `location.state`, so the customer is caller-supplied. Whether a `client` can actually exploit this depends entirely on base RLS policies that **are not in this repo** (see P0 above). The trigger guards protect *workspace* boundaries, not *role* boundaries.

**Fix (two independent layers, both needed):**
1. `AuthBoundary`: move `/weekly` and `/monthly` out of `isClientPath`; give the client portal its own read-only loan pages.
2. Add a `security definer` RPC that asserts `role = 'admin'` before any loan creation, and a matching restrictive RLS policy `with check` on `finance_records`/`collection_categories` requiring admin. Never rely on the SPA for authorization.

---

### 🟠 P1 — Interest-only semantics contradict themselves across migrations

Three overlapping implementations of interest-only payment exist:

| Migration | Rule |
|---|---|
| `20260927100000` | payment may clear interest **and then principal**: `principal_payment := least(principal_balance, amount - interest_payment)` |
| `20260927120000` | replaced it — principal is **held**: `if p_payment_amount > interest_balance then raise exception` |
| `20260927140000`, `150000`, `160000` | further rewrites; `160000` fixes ledger replay and forces the new payment to `interest_payment = amount, principal_payment = 0` |

The final state (`160000`) is coherent — principal held, principal moved only by explicit adjustment. But it took **five migrations dated the same day** to converge, and the intermediate states were live. Any historical `finance_payments` row written under `101000` semantics may carry a non-zero `principal_payment` that the current code will never produce — and `rebuild_interest_only_ledger` will happily replay it (it only throws if `interest_payment + principal_payment <> payment_amount`).

Additionally, `frontend/src/services/interestOnly.js` re-implements the ledger in JavaScript for previews and **encodes the superseded `101000` behaviour**:

```js
interestPayment = Math.min(paymentAmount, interestDue)
principalPayment = paymentAmount - interestPayment   // allocates to principal
```

It matches the DB only because it prefers the *stored* allocation when present. If that fallback ever fires (payment rows with both allocations zero), the preview will disagree with the server.

**Fix:** verify no `finance_payments` row for an interest-only loan has `principal_payment > 0`. If any do, reconcile them. Then delete the JS fallback and make the preview a call to a `preview_interest_only_payment(...)` SQL function so there is exactly one implementation of the money math.

---

### 🟠 P1 — Nothing is tested; nothing is linted or type-checked

`package.json` has three scripts: `dev`, `build`, `preview`. There is no linter, no test runner, no `tsc`. In an app that computes interest, amortises schedules, and moves principal, **there is not one automated assertion** that `principal × rate ÷ 100` or the `/3000` daily accrual is correct.

`services/interestOnly.js` is pure, dependency-free, deterministic code — it is the single easiest thing in this codebase to unit-test and it is untested.

**Fix:** add `vitest` + `@testing-library/react`, and write tests for `getInterestOnlyStateAtDate`, `getAssignedFinanceTypes`, `filterAssignedFinance`, `generateCustomerId`. Add `eslint` with `react-hooks` — 90 `useEffect`s across 59 files with hand-rolled `let active = false` cancellation is exactly where stale-closure bugs live.

---

### 🟠 P1 — `pending` means different things for different loan types

For daily/weekly/monthly, `pending` = remaining principal (interest excluded). For interest-only, `pending` = `principal_outstanding + interest_due`.

Every dashboard, report and query uses `pending` uniformly:

```js
supabase.from('finance_records').select('id', {count:'exact', head:true}).gt('pending', 0)
```

…which is the source of both `Navbar`'s "pending accounts" and `AdminDashboard`'s metric and `Pending.jsx`. A perfectly current interest-only loan — one that has paid every rupee of interest on time — **always** shows as "pending/overdue", because the held principal is permanently in `pending`.

**Fix:** either add a `is_overdue` computed column / view that compares `next_due_date` to `current_date` (the honest definition of "pending/overdue"), or make every consumer type-aware. The first is far cheaper.

---

### 🟡 P2 — 7,128 lines of CSS with two competing design systems

`frontend/src/index.css` is a single monolithic stylesheet containing:

- **System A** — token-based: `--color-primary: #1769e0` (blue), a full spacing/type/shadow scale, and hand-written utility classes (`.flex`, `.text-sm`, `.p-4`…) that shadow Tailwind's names without Tailwind being installed.
- **System B** — a second `:root { }` block that **overrides** it: `--brand: #146b55` (green), `--ink: #17231f`, a radial-gradient `body` background, and its own `--shadow-card`. Every subsequent rule uses System B.
- **System C** — an "Enterprise sign-in screen" section that overrides `.login-page`/`.login-card` again with a blue gradient.

Evidence of the layering:

| Selector | Times redefined |
|---|---|
| `.login-page {` | 7 |
| `.login-card {` | 7 |
| `.weekly-page {` | 4 |
| `:root {` | 2 |
| Hardcoded hex colours | **819** |

819 raw hex values means the token system is decorative, not enforced. Selectors are also nested *inside* media queries in places (e.g. the whole `ADMIN APPLICATION SHELL` block is indented inside nothing) and `@media (prefers-reduced-motion)` appears mid-file with more rules after it.

**Fix:** keep System B (green) as the design language — it is the one actually rendering — delete System A's tokens and utilities, split into `styles/tokens.css`, `styles/base.css`, `styles/components/*.css`, and route the 819 hex values through tokens. This is mechanical and low-risk, and it will make the UI coherent instead of three AI-generated passes stacked on one another.

---

### 🟡 P2 — `alert()` and inline styles are the UI's error layer

- **273 `alert(` calls.** Every validation failure, every database error, every success confirmation is a blocking native dialog. This is the single biggest UX defect: alerts are unstyleable, unlocalisable beyond the message string, blocking on mobile, and they fire from inside save handlers where a failed write has already partially happened.
- **246 `style={{ ... }}` blocks** inline, duplicating what CSS classes already do.
- **157 `console.error`** with no user-facing surface and no log aggregation.

**Fix:** one `<Toast>`/`<ErrorBanner>` component plus an `useAsyncAction` hook that returns `{run, loading, error}`. Replace `alert` incrementally, page by page — start with the payment pages.

---

### 🟡 P2 — God components

| File | Lines |
|---|---|
| `pages/client/Monthly.jsx` | 1,429 |
| `pages/agent/AgentCollection.jsx` | 1,371 |
| `pages/admin/Daily.jsx` | 1,313 |
| `components/CollectionEvidence.jsx` | 1,122 |
| `pages/client/Weekly.jsx` | 1,115 |
| `pages/admin/AgentSettlement.jsx` | 1,020 |
| `pages/admin/InterestOnlyManage.jsx` | 1,000 |
| `pages/admin/Agents.jsx` | 954 |
| `pages/admin/InterestOnly.jsx` | 915 |
| `pages/admin/AgentAssignments.jsx` | 833 |
| `pages/admin/CustomerProfile.jsx` | 828 |
| `pages/agent/AgentHistory.jsx` | 827 |

24 files exceed 500 lines. The loan-creation forms (Daily/Weekly/Monthly, ~1,100–1,400 lines each) are **the same form three times** with different labels and one different formula. Each holds 12–18 `useState` hooks, a calculation `useEffect`, a save handler, and a full page of JSX.

**Fix:** extract `<LoanForm>` driven by a config object (`{type, interestFormula, scheduleRpc, fields[]}`), then `<MoneyInput>`, `<DateField>`, `<CategorySelect>` — the category selector alone is duplicated verbatim across four pages. Target: no page file over 300 lines.

---

### 🟡 P2 — Data access is scattered across 143 query sites

`supabase.from(...)` appears **143 times** across 59 files; only **7** calls go through `.rpc()`. There is no repository layer — every page builds its own queries, its own loading/error state, its own `let active = false` cleanup, and its own money formatter (`formatMoney` is redefined in at least four files).

`services/` holds only 6 small modules (~330 lines total) and `components/PaymentForm.jsx` + `components/CustomerCard.jsx` are **never imported anywhere** — `PaymentForm` is dead while four pages reimplement payment entry.

**Fix:** `data/financeRecords.js`, `data/customers.js`, `data/payments.js` exposing typed functions; `utils/money.js` for `formatMoney`. This is the highest-leverage refactor for both correctness and testability.

---

### 🟡 P2 — Bundle weight

`dist/assets` after build:

| Chunk | Raw | gzip |
|---|---|---|
| `jspdf.es.min` | 386 kB | 126 kB |
| `html2canvas.esm` | 201 kB | 47 kB |
| `xlsx.mini.min` | 232 kB | 76 kB |
| `jspdf.plugin.autotable` | 31 kB | 10 kB |
| `index-BgEVH8tO.js` (app) | 380 kB | 79 kB |

`jspdf` + `html2canvas` + `xlsx` = **~850 kB raw / ~260 kB gzip** pulled in for PDF/Excel export, which only `admin/Reports.jsx` and `admin/CollectionReport.jsx` use. `html2canvas` is a `jspdf` transitive dep that no page imports directly.

The `manualChunks` config in `vite.config.js` correctly splits react/supabase/i18n — but these three should be split too and **dynamically imported inside the export handler**:

```js
const { jsPDF } = await import('jspdf');        // only when Export clicked
const XLSX = await import('xlsx');
```

That removes ~260 kB gzip from first load for every admin and agent.

---

### 🟢 P3 — Smaller issues

- **`frontend/src/pages/CollectionEvidence.jsx` has a broken import path.** It re-exports from `'../../components/CollectionEvidence'`, which from `src/pages/` resolves to `frontend/components/CollectionEvidence` — a directory that does not exist. It is unreferenced, so the build survives. Delete it.
- **Zero-byte files committed:** `components/CustomerForm.jsx`, `components/SummaryCard.jsx`, `components/Sidebar.jsx`. Delete.
- **`legacy/root-src/`** contains an entire superseded copy of the app (`pages-App.jsx`, `AgentCollection.jsx`, five `*Manage.jsx`). Nothing imports it. Move to a tag or delete — it makes `rg` results twice as noisy.
- **No `.env.example`.** `.gitignore` has a `!**/.env.example` negation, but the file does not exist. A newcomer sees `throw new Error('VITE_SUPABASE_URL is missing from .env')` and has nothing to copy.
- **`generateCustomerId()`** (`utils/customerId.js`) is `CUS + last-6-digits-of-epoch-ms + 3 random digits` — collision-prone and, worse, not collision-*checked*. The migration added `customers_workspace_customer_id_key`, so a collision becomes a hard insert failure rather than a duplicate. Agents get the right treatment (`AGT` + 6 hex chars, 10 retry attempts, existence-checked, in `create-agent`).
- **`console.log` left in production paths** — `CustomerFinance.jsx` logs the whole customer object and navigation state before routing.
- **`AuthBoundary` double-fetches on every navigation**: it calls `getUser()` *then* `profiles.select('role')` on every `location.pathname` change, with no cache. On a role-scoped app that is two network round-trips per click, and it flashes "Checking login..." between pages.
- **`AdminLayout` and `Navbar` both fire** the same three `count: exact` queries (finance totals, pending, payments-today). Duplicate work on every admin page load.
- **`Navbar`'s `isAdminPage`** derives role from the *path* (`!startsWith('/agent') && !['/client','/weekly','/monthly'].includes(...)`) rather than from the profile it already fetched. Rename a route and the header changes role.
- **`admin/Settings.jsx`** reads `app_settings` with `.order('id').limit(1).maybeSingle()` — it takes whichever row sorts first, ignoring `workspace_id`. For a multi-tenant app that is a bug waiting for a second workspace. Same pattern in `client/Weekly.jsx`.
- **`record_agent_payment`** applies the full payment to `principal_paid`/`principal_outstanding` for daily/weekly/monthly, where `pending` already equals principal — consistent, but it means `interest_paid` is never touched for those loan types while `interest_accrual` is set. Reports that sum `interest_paid` across loan types will understate.
- **`admin/Payments.jsx`** (37 lines) is a stub that just links to `/weekly` and `/monthly`. It is in the sidebar's module grid and in the header's "payments today" link destination.

---

## 3. What's genuinely good

Worth stating plainly, because the DB work is better than the frontend work:

- **The workspace isolation design is correct and defence-in-depth.** Restrictive RLS ANDed with permissive policies *plus* triggers that validate relationships across tables — that combination survives a missing policy in a way RLS alone does not. The `coalesce(workspace_id, LEGACY)` treatment of pre-existing rows is the right call for a zero-downtime retrofit.
- **The rename-and-wrap pattern** for `record_agent_payment` / `record_interest_only_payment` / `adjust_interest_only_principal` / `schedule_interest_only_due_date` is the correct way to bolt a new authorization check onto an existing `security definer` function without rewriting its body.
- **`apply_interest_only_payment` and `rebuild_interest_only_ledger`** are genuinely careful: `for update` row locks, explicit principal/interest split persisted per payment, full deterministic replay ordered by `(date, created_at, type, id)`, and hard failures rather than silent data corruption when history cannot be reconciled.
- **The `client/Weekly.jsx` business rules are documented in comments** at every point where the behaviour is counter-intuitive ("Already Paid does NOT reduce Total Repayment") — that is unusually disciplined for code like this.
- **Agent authorization is enforced in the RPC**, not the SPA: `record_agent_payment` re-checks active-agent status, category assignment, and `collection_type` match server-side. Migration `20260923133000` tightened the agent-facing RLS so agents cannot enumerate other agents or settlements.
- **The edge functions roll back correctly** — `create-agent` deletes the auth user if profile or agent insert fails; `create-admin-workspace` tears down settings → profile → workspace → auth user in order.
- **`vite.config.js` manual chunking, route-level `lazy()` on all 35 routes, accessible markup** (aria-current, aria-pressed, role="switch", focus-visible rings, `prefers-reduced-motion`) — the accessibility and code-splitting basics are done, not skipped.

---

## 4. Prioritised plan

**Do first (correctness + security, ~2–3 days)**
1. Commit the base schema baseline (`supabase db dump --schema public`) and the storage bucket policies. Without this, nothing else is verifiable.
2. Add admin-only enforcement for loan creation at the RPC + RLS layer; move `/weekly`, `/monthly` out of `isClientPath`.
3. Wrap daily/weekly/monthly loan creation in a transaction RPC (`create_*_loan`) so a schedule failure cannot orphan a loan.
4. Add `vitest` and unit-test `services/interestOnly.js` against the live `apply_interest_only_payment` semantics.

**Do next (data quality, ~2 days)**
5. Fix `pending` semantics — add a view/column that defines overdue as `next_due_date < current_date AND loan_status = 'active'`, and point dashboards/pending/reports at it.
6. Audit `finance_payments` for interest-only rows with `principal_payment > 0`; reconcile if any exist. Then delete the JS fallback and make the preview server-side.

**Then (maintainability, ~1–2 weeks, incremental)**
7. Extract `<LoanForm>` and kill the three ~1,200-line duplication; add the data/repository layer.
8. Replace `alert` with a toast/banner + `useAsyncAction`.
9. Consolidate `index.css` onto the green token set and split it.
10. Dynamically import `jspdf`/`xlsx` inside the export handlers.
11. Delete the dead files (`pages/CollectionEvidence.jsx`, `components/PaymentForm.jsx`, `CustomerCard.jsx`, three empty components, `legacy/`), add `.env.example`, add ESLint.
12. Cache the role lookup in `AuthBoundary` instead of re-querying on every navigation.

---

## 5. One-paragraph summary

This is a real, working, non-trivial line-of-business application with a **strong database layer and a weak frontend architecture**. The workspace isolation, the interest-only ledger with its backdating replay, and the agent-authorization RPCs are above the bar for this class of software. Against that, the base schema lives only in someone's production database, the loan-creation path is a non-transactional two-step client write reachable by a `client` role, the same 1,200-line form exists three times, and 7,128 lines of CSS contain three design systems layered on each other with 819 hardcoded colours. The money math is the thing most at risk: it is complex, it has already been rewritten five times in one day, and it has zero tests. Fix the schema baseline and add tests for `interestOnly.js` before touching anything else.

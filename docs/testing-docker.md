# Run the tests in Docker

From the repository root, with Node 24.21.0 and Docker Compose available:

```powershell
node infra/test-disposable.mjs --docker --images --backups --seeds
```

Verified with Docker Engine 29.8.0 / Compose 5.5.1. The runner overlay uses Compose's `!reset` tag. The host Node process orchestrates Docker and sends image smoke requests; test suites and their npm dependencies execute in containers. No host npm or host `node_modules` is required in `--docker` mode.

## What runs

| Part | Checks |
|---|---|
| Backend test image | Lint, typed lint canaries, typecheck, unit tests, PostgreSQL/Redis integration, financial/destructive-operation regressions, build and seven measurement controls. |
| Frontend test image | Lint, hook/Promise canaries, typecheck, tests and production build. |
| Agent test image | Typecheck and HTTP test of the loopback agent. The test rejects an empty print job without contacting a printer. |
| Synthetic seeds | Both current and historical benchmark seeds in isolated PostgreSQL; counts, header/item/payment reconciliation, wrong-database rejection and repeat behavior. |
| Runtime images | Build API/frontend, health, metrics authentication, cookie login/session revocation, SPA fallback, actual backup/simulation restore, storage/lock failures and backup persistence after API recreation. |

All workspace checks run before a workspace failure is reported. Lint canaries intentionally invoke invalid code and empty test selections; their expected nonzero child exits are assertions of the gate. Product regressions now contain **no expected failures**. A nonzero top-level exit indicates a failed check, and the harness attempts cleanup in `finally`.

`--docker` runs the workspace checks; `--images` adds runtime images and smoke; `--backups` requires `--images`; `--seeds` adds the isolated seed validation. The legacy mode without `--docker` still runs integration/regression on the host and needs installed backend dependencies plus `NPM_CLI`. CI uses the full Docker command above.

## Isolation

The fixed project `pos-phase0-tests` uses only literal synthetic credentials and tmpfs PostgreSQL data. All published ports bind to dynamic `127.0.0.1` ports. The test image build context excludes environment files, host dependencies, compiled artifacts and certificates. Builds install npm 12.2.0 and use `npm ci --ignore-scripts` with existing lockfiles; no dependencies were added for this work.

In Docker mode, Redis and the backend test runner share the disposable database container's network namespace. Tests still connect to `127.0.0.1` and retain their existing `pos_phase0_test` database/loopback guards. The runtime API reaches Redis through the `db` service in this mode. Frontend and agent runners use no external network; the agent listens only on its own loopback interface, without a host port or printer access.

Seed checks use a separate fixed `pos-seed-tests` project, recreated between fixtures, with the same synthetic database identity. They do not execute the SQL benchmark that drops/recreates indexes. The application Compose project and development database are never selected. Containers, volumes and networks of these two test projects are removed afterward. Run one instance of the harness at a time because their project names are fixed. Forced termination or an unavailable Docker daemon can require cleanup of these test projects.

## Checkout correction covered by the tests

`POST /api/v1/sales` now requires non-null `payment_method` and `amount_paid`. Missing values return HTTP 400 before persistence. The API no longer infers that an omitted amount was tendered. Cash/card/bank/other require full settlement; credit requires a customer and zero payment; credit with entry requires a customer and a positive amount no greater than the total. An authorized full discount accepts an explicit zero payment.

The frontend request type and OpenAPI agree with this contract. Existing POS requests already provide both fields. Other API clients must send them explicitly. Stored historical sales remain readable, and legacy imports continue through their separate importer; no historical data migration or constraint was applied. Credit-limit/inactive-customer checks, non-negative stock policy and other roadmap debts remain separate work.

The new HTTP suite uses valid synthetic products/customers and verifies that rejected requests leave sale, item and movement counts unchanged. It checks stored money/change for successful sales and outstanding credit totals. Direct use-case callers are also checked before repository access. The former `TSK-016` expected failure is now a normal required regression.

## Seeds

| Fixture | Sales | Items | Customer payments | Outstanding total | Repeated execution |
|---|---:|---:|---:|---:|---|
| `infra/performance/seed.sql` | 120,000 | 360,000 | 0 | R$ 0 | Refuses a populated core without changing rows. |
| `backend/sql/benchmarks/phase4_seed.sql` | 120,000 | 360,000 | 180,000 | R$ 1,800,000 | Same counts and monetary invariants. |

The historical seed previously stored R$100 subtotal/R$90 total against three R$10 items, and payments exceeded charges. It now stores R$30 subtotal/total, zero discount and explicit customer credit with zero initial payment. Each separate synthetic payment is R$10, leaving a positive debt total. Product cost is explicitly synthetic at R$6. Both seeds reject a different database/user. The current phase-six fixture already reconciled and did not need a data change.

These are read/query fixtures inserted directly into SQL, without a complete stock ledger or the operational checkout path. They are not a development inventory seed. Historical performance figures used the old seed and are retained as historical evidence; they are not measurements of the corrected fixture or the current checkout code.

Optional machine-readable seed/backup evidence:

```powershell
$env:SEED_TEST_EVIDENCE_PATH = 'C:/Temp/seeds.json'
$env:BACKUP_TEST_EVIDENCE_PATH = 'C:/Temp/backups.json'
node infra/test-disposable.mjs --docker --images --backups --seeds
```

Create the destination directory first. These evidence files may be replaced on another run. The [Docker follow-up record](technical-audit/20-validacao-docker-e-correcoes.md) records the completed run, scope and remaining limitations.

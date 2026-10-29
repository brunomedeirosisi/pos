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

## Import feedback validation (2026-10-29)

The import feedback change passed the Docker workspace checks with Node 24.21.0, Docker Engine 29.8.0 and Compose 5.5.1:

| Suite | Passed |
|---|---:|
| Backend unit | 144 |
| Backend PostgreSQL/Redis integration | 82 |
| Backend financial/destructive-operation regression | 4 |
| Measurement controls | 7 |
| Frontend | 96 |
| Agent | 9 |
| **Total** | **342** |

Lint, lint-rule canaries, typechecks and builds also passed. The frontend total includes 20 new import tests covering PT-BR and EN. The six legacy-import integration tests include progress during a blocked real database stage, completed summaries/checkpoints, retries and final failure with corrupt synthetic DBF input. After placing feedback at the top of the page, frontend checks and the six import integration tests passed again. [Successful runner logs](test-evidence/import-feedback-docker-20261029.log.gz).

This run used the `backend-tests`, `frontend-tests` and `agent-tests` Compose runners directly, with the disposable PostgreSQL/Redis services. Runtime image smoke, backup recovery and synthetic seed checks are separate optional harness steps and were not repeated for this change. No schema or seed changes were needed. Existing React server-render warnings and the Vite bundle-size advisory do not fail the checks.

## Payment history validation (2026-10-29)

All workspace checks passed again after adding global payment history and audited cancellation: 144 backend unit tests, 94 database/Redis integration tests, 4 regressions, 7 measurement controls, 115 frontend tests and 9 agent tests (**373 total**). Lint, lint canaries, typechecks and builds passed. This includes 12 new database integration tests and 19 new frontend tests, covering both locales, profile restrictions, balance restoration, duplicate/concurrent cancellation, audit rollback, receipts, paging and migration of existing data.

The API and frontend runtime images also built and started successfully. An HTTP smoke check through the complete API, using real cookie login and database roles, verified Manager cancellation, Seller rejection, rejection of a custom wildcard role, repeated-cancellation rejection, reopened balance, cancelled receipt metadata, published OpenAPI paths and `/payments/history` SPA fallback. [Successful checks and runtime evidence](test-evidence/payment-history-docker-20261029.log.gz). Backup recovery and synthetic benchmark seeds were not repeated; the change does not alter seed data.

## ARJ import and rejection feedback validation (2026-10-29)

The final Docker run passed **418 checks**: 147 backend unit tests, 126 PostgreSQL/Redis integration tests, 4 regressions, 7 measurement controls, 125 frontend tests and 9 agent tests. Lint, lint-rule canaries, typechecks and production builds passed. The ARJ suite exercises the real pinned decoder with stored and compressed synthetic archives, unsafe names, collisions, passwords, split volumes, CRC/size mismatches, shared budgets, process timeouts and credential isolation. Two worker-process tests publish real synthetic DBFs from ARJ content under `.arj` and `.zip` filenames. The authenticated upload test covers ARJ handoff; PT-BR/EN tests distinguish disabled overwrite from actual forbidden access.

The supplied `BACEST 4.zip` was mounted read-only in a disposable container: ARJ metadata and extraction passed for 20 members, 104,826,827 declared bytes and 18 DBF/DBT outputs, including all seven required DBFs. No records from that archive were imported into the application database. Production API/frontend images were rebuilt and recreated after confirming no active imports. A synthetic ARJ smoke check passed inside the running API; the current frontend advertises ARJ, health passes through the reverse proxy, and `ENABLE_LEGACY_OVERWRITE` remains false. [Successful runner and runtime evidence](test-evidence/arj-import-docker-20261029.log.gz).

The backend test image and API runtime use the same `backend/scripts/install-sevenzip.mjs` installer, with version and SHA256 pins. Frontend and agent test images do not install the decoder. No schema, npm dependency or seed change was required for ARJ support. Benchmark seed and backup-recovery suites were not repeated for this change.

## Overwrite availability validation (2026-10-29)

The availability fix passed **434 tests in Docker**: 147 backend unit, 130 integration, 4 regression, 7 measurement controls, 137 frontend and 9 agent tests. Lint, lint-rule canaries, typechecks and production builds passed. New tests verify the protected options endpoint with both gate values and missing permissions, plus PT-BR/EN behavior for disabled, loading, unavailable and changing overwrite availability. A selected overwrite request is never silently converted to append mode.

API/frontend images were recreated after checking for active imports. Runtime smoke confirmed the protected options route, updated frontend bundle, published API contract and health. This validation preserved `ENABLE_LEGACY_OVERWRITE=false`; enabling the installation gate is a separate administrative decision that permits operational data replacement. No import was started, and no schema or seed change was needed. [Successful runner and runtime evidence](test-evidence/overwrite-options-docker-20261029.log.gz).

## DBF NUL-byte correction validation (2026-10-29)

The backend Docker runner passed **290 tests**: 147 unit tests, 132 PostgreSQL/Redis integration tests, 4 regressions and 7 measurement controls. Lint, lint-rule canaries, typecheck and build passed. Two new PostgreSQL/DBF regressions first reproduced `invalid byte sequence for encoding "UTF8": 0x00`, then passed after the staging correction. They cover a NUL-filled order beyond the 500-record batch boundary, blank order handling, Latin-1 accents, internal whitespace, optional empty text, numeric padding and legacy references. Source files are not modified by normalization; the session log reports only aggregate cleanup counts.

A separate read-only mount of the supplied archive completed all 15 worker stages against the fixed disposable `pos_phase0_test` database, in overwrite mode confined to that database. It removed 57 NUL bytes from 11 mapped fields in one order record. The existing reconciliation reported 1,170 missing-product references; those source discrepancies remain visible and were not silently repaired. Private field values were excluded from the evidence. The disposable database and input copy were removed afterward. The application API image was rebuilt and recreated only after confirming no active imports and validating the preserved backup; the failed production session was not restarted. No schema, seed or frontend change was needed. [Docker and runtime evidence](test-evidence/nul-dbf-docker-20261029.log.gz).

## Calendar-date and timezone validation (2026-10-29)

The final Docker run passed **446 tests**: 152 backend unit tests, 138 PostgreSQL/Redis integration tests, 4 regressions, 7 measurement controls and 145 frontend tests. Lint, lint-rule canaries, typechecks and production builds passed for both changed workspaces.

Regression tests distinguish PostgreSQL calendar dates from actual timestamps. Separate Node processes query real PostgreSQL under UTC, `America/Sao_Paulo` and `Pacific/Auckland`; the test also changes the transaction's PostgreSQL timezone and confirms date-only JSON, null dates and unchanged timestamp instants. Synthetic DBF `D` fields pass through independent worker processes in the same three timezones, then through sale list/detail APIs, exact-day filters, payment history, stock dates and PT-BR/EN receipts. The fixture includes Brazil's 2018 daylight-saving midnight transition. Date helper tests cover leap days and calendar parts in ISO strings with offsets.

PT-BR/EN sales-history and detail rendering tests prevent artificial `21:00`/`00:00` times. Frontend checks run in Docker with `TZ=America/Sao_Paulo`, and focused date/page checks also run with Auckland and UTC. The final backend checks run with São Paulo timezone, including the API date filters as well as the workers. Source archive contents and production records are not rewritten or reimported to fix presentation. There are no schema or seed changes. [Docker and runtime evidence](test-evidence/calendar-date-docker-20261029.log.gz).

After deployment, all 104,879 existing imported sales/orders matched the staging calendar dates. Before/after row counts and hashes of IDs plus calendar dates remained identical for sales, customer payments and stock movements. Runtime read paths verified date-only sale lists/details, exact-day filtering, both receipt locales and preserved real timestamps. API/frontend health checks passed; no real import or historical data rewrite was executed.

## Searchable history filters validation (2026-10-29)

**163 frontend tests passed in Docker**, including 18 new combobox/history-filter tests, plus lint, typed-lint canaries, typecheck and production build. The test runner uses `TZ=America/Sao_Paulo` and jsdom for input, focus, mouse and keyboard interactions.

The frontend Docker runner checks the shared combobox and both history pages in PT-BR and EN. Tests cover substring filtering, keyboard/IME behavior, click and clear actions, discarded drafts, debounce, remote catalog matches beyond the initial page, retained selected labels, stale-response isolation, loading, translated errors and retries. Existing payment-history tests now select through the real combobox instead of native select change events; pagination, authorization and payment actions remain covered. Sales-date presentation tests continue to pass.

The change reuses existing catalog search endpoints and `useDebouncedValue`, React Query and form styles. The receiving-user list is filtered locally; customer, seller and payment-term queries use server search so pagination does not hide all later records from the search. No backend, dependency, schema, seed or permission change is required. [Docker and runtime evidence](test-evidence/searchable-filters-docker-20261029.log.gz).

The frontend runtime image was rebuilt and recreated after the checks passed. HTTPS smoke verified both history SPA routes serve the new bundle, PT-BR/EN search strings, combobox code and dropdown styles. API health remained OK; the API container and production data were not changed.

## Authoritative legacy customer balances validation (2026-10-29)

**485 tests passed in Docker**: 152 backend unit tests, 154 PostgreSQL/Redis integration tests, 4 regressions, 7 measurement controls and 168 frontend tests. Lint, typed-lint canaries, typechecks and production builds passed. The backend/frontend checks run with `TZ=America/Sao_Paulo`.

The new financial suite reproduces the reported differences using synthetic customers, verifies official debit/credit/zero/cents, exact DBF source validation, leading-zero codes, complete customer coverage, audit rollback, idempotence and lock serialization with concurrent receipts. It exercises customer details, payment limits, new receipts/reports, cancellation of receipts and sales, and preservation of newer activity. Import tests verify the mandatory source before publication and successful balance certification despite a missing product. Receipt date comparisons use calendar strings so same-day payments remain included across process timezones.

PT-BR/EN tests verify source/adjustment disclosure, the separate treatment of reconciliation versus payments, unknown historical receipt balances and import certification feedback. Legacy document pending amounts are explicitly unknown rather than inferred from full document totals. No seed or new runtime dependency is required. [Docker evidence](test-evidence/legacy-balances-docker-20261029.log.gz).

The supplied archive completed all 16 stages in the disposable database: 3,395 customer balances matched the source with zero financial differences, including two credits. The original 1,170 missing-product warnings remained visible. A separate test removed the disposable reconciliation entries and exercised the production CLI's preview/apply paths, real managed backup creation/validation and source-fingerprint rejection. Its financial reports stayed in ignored private artifacts. The disposable database and backup volumes were removed afterward.

The application repair used a reviewed preview of the original archive, the same source fingerprint and latest completed import, then created and validated a managed backup before committing 3,395 audited reconciliation entries. All source balances matched after the repair. Before/after counts and financial fingerprints of customers, sales, items, receipts and stock were identical; no original transactions were replaced or reimported. The API and updated PT-BR/EN customer UI passed runtime checks. Published evidence contains aggregate verification only; private customer reports and financial diagnostics are not versioned.

## Isolation

The fixed project `pos-phase0-tests` uses only literal synthetic credentials and tmpfs PostgreSQL data. All published ports bind to dynamic `127.0.0.1` ports. The test image build context excludes environment files, host dependencies, compiled artifacts and certificates. Builds install npm 12.2.0 and use `npm ci --ignore-scripts` with versioned lockfiles. The frontend uses jsdom as a development dependency for interactive import-page tests; production dependencies are unchanged.

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

## Restore validation

The restore runner uses the final API image (including real `pg_dump`/`psql`), a disposable database, dedicated backup volumes and synthetic credentials. It never enables or restores the application database. From the repository root:

```powershell
docker compose -p pos-phase0-tests -f infra/docker-compose.test.yml -f infra/docker-compose.test-runners.yml up -d --wait db redis
docker compose -p pos-phase0-tests -f infra/docker-compose.test.yml -f infra/docker-compose.test-runners.yml --profile images build api
docker compose -p pos-phase0-tests -f infra/docker-compose.test.yml -f infra/docker-compose.test-runners.yml --profile images run --rm --no-deps -e ENABLE_DATABASE_RESTORE=true -v "${PWD}/infra/restore-image-check.mjs:/app/restore-image-check.mjs:ro" api node restore-image-check.mjs
```

Only use the fixed test project with disposable data. Run workspace integration tests before the restore runner, not concurrently against its database. The runner checks password/confirmation, active-operation fencing, rejection of unverified SQL, atomic rollback of SQL errors, real HTTP restoration, session revocation, durable journal/catalog, rollback after a post-cutover fault and recovery after an interrupted operation. Unit and UI tests also cover failure fencing and both PT-BR/EN flows, including upload outcomes and disabled-server feedback.

Optional `RESTORE_FIXTURE_FILE` (read-only mount) and `RESTORE_FIXTURE_CHECKSUM` allow a separately verified native backup to be restored **only in this disposable fixture**. Actual store backups and per-customer reports must remain outside Git. Versioned evidence must contain aggregate counts/checksums only. This explicit test-fixture registration does not add a production mechanism to trust foreign SQL.

After reviewing results, remove only the test project:

```powershell
docker compose -p pos-phase0-tests -f infra/docker-compose.test.yml -f infra/docker-compose.test-runners.yml --profile runners --profile images down --volumes --remove-orphans
```

See the [restore runbook](backup-restore-runbook.md) for operator behavior, provenance restrictions, persistent maintenance and recovery limits. No seed changes are needed; fixtures are private to these tests.

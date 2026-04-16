# Phase 6 Release Candidate Checklist (SRE + QA)

## SRE

- [ ] CI `quality-gate` workflow green (`install`, `lint`, `typecheck`, `test`).
- [ ] Backend metrics endpoint responding (`/api/v1/metrics`) with valid scrape payload.
- [ ] `x-request-id` propagated in API responses and backend logs.
- [ ] Error rate and latency dashboards wired to:
  - `pos_api_http_requests_total`
  - `pos_api_http_request_duration_seconds`
  - `pos_api_http_errors_total`
- [ ] Alert configured for elevated 5xx rate and p95 latency breach.
- [ ] OpenAPI validation job passing (`npm run openapi:validate`).

## QA

- [ ] Auth flow regression passed (`POST /auth/login`, `GET /auth/me`).
- [ ] Checkout regression passed (`POST /sales`).
- [ ] Customer payment regression passed (`POST /customers/{id}/payments`, `GET /customers/{id}/payments`).
- [ ] Backup/restore regression passed (`POST /admin/restore` with sanitized errors).
- [ ] Legacy import regression passed (`POST /admin/import/legacy`, status polling).
- [ ] Frontend typed client generation executed and committed (`npm run openapi:generate`).

## Exit Criteria

- [ ] Coverage threshold met in CI for backend critical flow suite.
- [ ] No critical lint warnings.
- [ ] Typecheck clean in backend + frontend.
- [ ] Release candidate approved by SRE + QA owners.


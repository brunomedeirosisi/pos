# OWASP Basic Checklist (Phase 1)

## Configuration and Secrets
- [x] No insecure default for `JWT_SECRET` in runtime bootstrap.
- [x] No insecure default for `POSTGRES_PASSWORD` in runtime bootstrap.
- [x] Environment variables validated centrally with schema (`backend/src/config/env.ts`).
- [x] Startup fails fast when required security configuration is missing/invalid.

## Error Handling and Information Disclosure
- [x] Unexpected `500` responses are sanitized to `internal_error`.
- [x] Internal error details are logged server-side only.

## HTTP and CORS
- [x] CORS origin policy restricted by explicit allowlist (`CORS_ALLOWED_ORIGINS`).
- [x] `x-powered-by` header disabled.
- [x] `helmet` remains enabled.

## File Upload Security
- [x] Uploads moved from memory to temporary disk storage.
- [x] File size limits reduced and centrally configured.
- [x] MIME type + extension validation applied for backup and legacy import.
- [x] Temporary uploaded files are cleaned up after processing.

## Container Hardening
- [x] Base images pinned by version/tag.
- [x] `npm ci` used for deterministic dependency installation.
- [x] Runtime containers run as non-root user.
- [x] Healthcheck defined in backend and frontend Dockerfiles.

## Tests
- [x] Integration test coverage added for auth middleware path.
- [x] Integration test coverage added for upload validation flow.

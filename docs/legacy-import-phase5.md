# Fase 5 - Importação Legada Robusta

## O que mudou
- Fila de importação migrada para **Redis + BullMQ** (persistente).
- Retry automático configurável por ambiente e DLQ persistente.
- Checkpoints por etapa em `system_legacy_import_checkpoint`.
- Status operacional ampliado (`retry_count`, `current_stage`, `last_error_stage`, `last_heartbeat`).
- Relatório de reconciliação padronizado e versionado:
  - `reconciliation.v1.csv`
  - `reconciliation.v1.json`
  - `version: legacy-reconciliation/v1`
- Schema do fluxo legado movido para migration versionada:
  - `backend/sql/migrations/20260414_001_phase5_legacy_import_hardening.sql`

## Garantias operacionais
- Reinício de serviço não perde jobs:
  - jobs em Redis continuam disponíveis;
  - registros `running` são reclassificados para `retrying` no bootstrap e reenfileirados.
- Sem inconsistência parcial silenciosa:
  - cada etapa grava checkpoint (`running/completed/failed`);
  - etapas de escrita executam em transação por etapa;
  - em falha final, evento vai para DLQ e para `system_legacy_import_dead_letter`.

## Variáveis novas
- `REDIS_HOST`, `REDIS_PORT`, `REDIS_DB`, `REDIS_PASSWORD`
- `LEGACY_IMPORT_QUEUE_NAME`, `LEGACY_IMPORT_DLQ_NAME`
- `LEGACY_IMPORT_JOB_ATTEMPTS`, `LEGACY_IMPORT_JOB_BACKOFF_MS`

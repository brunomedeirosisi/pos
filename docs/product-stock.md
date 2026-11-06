# Product stock in the catalog

The existing product table and modal display **Estoque atual** (PT-BR) / **Current stock** (EN), distinct from minimum stock. When creating a product, this field accepts the initial quantity on hand and defaults to zero. It accepts nonnegative quantities up to `99999999999.999`, with up to three decimal places and PT-BR/EN numeric separators. Leaving the field blank uses zero. Editing an existing product displays its computed stock as read-only.

Quantities use the selected application locale, up to three decimal places, without rounding to whole sale units: `1234.567` appears as `1.234,567` in PT-BR and `1,234.567` in EN. Zero and negative balances remain visible. Catalog readers can see stock in the table; editing retains the existing `catalog:write` requirement. The values represent the last catalog query; reload the list to see later movements.

## API and calculation

`current_stock` is a read-only JSON number returned by:

- `GET /api/v1/lists/products` (inside each `items` entry).
- `GET /api/v1/products` and `GET /api/v1/products/{id}`.
- `POST /api/v1/products` (the entered initial stock, or zero when omitted) and `PATCH /api/v1/products/{id}`.

`POST /api/v1/products` accepts the optional JSON number `initial_stock`. A positive quantity creates one `entrada` stock movement with `origin=operational`, atomically with the product. Zero or an omitted value creates no movement. Invalid, negative, excessive or over-precision input returns HTTP 400 before creation. If stock persistence fails, the product creation rolls back. The existing `catalog:write` permission covers creation and its initial stock entry.

The response field `current_stock` remains derived and read-only. `PATCH` excludes both `current_stock` and `initial_stock` from metadata updates. `min_stock` remains a separate editable threshold. Subsequent sales/cancellations apply to the initial entry normally, and legacy reconciliation preserves it as operational stock. No new component, database migration, dependency or seed change is needed for product creation stock.

`backend/src/utils/stock-sql.ts` shares the dashboard rules with catalog queries. Imported products use the authoritative **`PRODUTO.DBF.ESTO_PROD`** snapshot. `MOV_EST.DBF` is historical activity already reflected in that snapshot; summing it alone cannot reconstruct current stock for most products. The import reconciles that history once:

```text
legacy history = signed sum of movements with origin = legacy
reconciliation adjustment = ESTO_PROD - legacy history
current stock = signed sum of all movements + reconciliation adjustment
```

This gives `ESTO_PROD + subsequent operational movements`, including products with no movement history. The calculation has no sales-date filter. Movement signs follow:

| Movement type, after trimming and lowercasing | Contribution |
|---|---|
| `e`, `entrada`, `in`, `credit`, `compra` | Absolute quantity added |
| `s`, `saida`, `out`, `debit`, `venda` | Absolute quantity subtracted |
| Other types | Original signed quantity |
| No movements | Imported source quantity, or zero for a native product |

Completed sales produce `venda` movements; cancellations produce inverse `entrada` movements. Catalog reads use the existing product movement index and preserve pagination, search and permissions. The OpenAPI `Product` schema documents `current_stock`.

Migration `20261106_001_legacy_product_stock.sql` adds `product_legacy_stock`, the staged source quantity and movement origin. Before this migration only the importer created movements without a sale link, so those existing movements are classified as legacy. Future movement origin defaults to operational; the importer explicitly writes legacy origin. Sale and movement quantities, values and dates are not rewritten. The reconciliation stores source quantity, reconstructed quantity, adjustment, import session, SHA-256 and timestamp, with transactional `LEGACY_PRODUCT_STOCK_RECONCILED` audit records. Reapplying the same source is idempotent. Later sales, cancellations and manual adjustments retain their effect.

New imports require `ESTO_PROD`, finite quantities representable with three decimals and unique product keys before resetting/publishing. Leading zeros and the unique unnamed legacy record with an empty key are preserved exactly. Missing stock is rejected instead of being silently treated as zero. The `reconcile-product-stock` checkpoint, summary and CSV/JSON report certify product coverage. The existing import page displays this stage and verification in PT-BR/EN.

No dependency or benchmark seed update is needed. Tests insert isolated synthetic stock records into the disposable database; benchmark seeds retain their existing query-fixture purpose.

## Repair an existing import

Apply the migration with the updated API, then run `dist/scripts/reconcile-legacy-stock.js` against the original DBF or ZIP/ARJ archive. Use a read-only source mount and a private report directory:

```powershell
docker compose run --rm --no-deps -T `
  -v 'C:/Backups/legacy.arj:/input/legacy.arj:ro' `
  -v 'C:/Temp/pos-stock-review:/evidence' `
  api node dist/scripts/reconcile-legacy-stock.js `
  --source /input/legacy.arj --session '<latestCompletedSessionId>' --report /evidence/preview.json
```

The default is preview. Review source/reconstructed quantities, the proposed adjustment and projected stock. The source must cover exactly the latest import's staged product keys; use the original package, not a different DBF version. Reports contain store data and must remain outside Git.

Apply using a new report name, `--apply` and `--source-sha256 '<reviewedSourceSha256>'`. The CLI requires the latest completed session, fences active imports/restores, creates and validates a managed backup before writing, and commits reconciliation plus audit together. It preserves existing sales, items, receipts and stock movements; a full reimport/overwrite is unnecessary. A failed report write or verification rolls back the repair.

## Validation in Docker

Use the isolated Docker runners described in [testing-docker.md](testing-docker.md). `backend/test/integration/product-stock.test.ts` covers numeric zero, all recognized movement aliases, whitespace/case normalization, signed adjustments, fractions, product isolation, reads after real checkout/cancellation, write behavior and permissions. It compares catalog balances with the dashboard against PostgreSQL. `frontend/src/pages/catalog/ProductsPage.test.tsx` covers both locales, zero/negative/fractional quantities, the existing modal and save flow, read permissions, creation, and loading/empty/error column spans. The shared list tests check stock on the second page.

The import regression suite runs real DBFs through the worker with and without `MOV_EST.DBF`, verifies the snapshot rather than a history sum, rejects missing stock before publication, and checks report certification. Source parsing tests cover zero/negative/fractional stock, invalid precision/range, missing fields, duplicate keys and preservation of leading-zero/empty legacy keys. Reconciliation tests verify rollback, product coverage, repeated sources/imports, and retained operational adjustments/sales/cancellations. The repair CLI was additionally exercised in the final API image against disposable data with preview, fingerprint rejection, real backup and apply. See the [import-stock validation record](testing-docker.md#initial-imported-product-stock-validation-2026-11-06).

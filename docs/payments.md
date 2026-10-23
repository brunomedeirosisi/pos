# Customer Payment & Debt Management

This feature lets operators register payments against a customer, keep running balances, filter and review payment history, and print either a single payment receipt or a full history report.

The customer balance now considers both:

- the full value of completed sales (`sale.total`)
- all amounts already received, including:
  - upfront/down-payment amounts stored in `sale.amount_paid`
  - later manual payments stored in `customer_payment.amount`

## Sale cancellation safeguard

- Cancelling a sale now checks the projected customer balance before applying the change.
- If removing that sale would leave the customer with a credit balance, the cancellation is blocked.
- This protects the receivables ledger because manual customer payments are stored at customer level, not linked to a specific sale.
- Operational rule:
  - reverse customer payments first, or
  - refund amounts first,
  - then cancel the sale.

## Credit sale modes

The POS checkout supports two debt-oriented payment modes:

- `À prazo` / `On credit`
- `À prazo com entrada` / `On credit with down payment`

Behavior:

- `À prazo`: `amount_paid = 0`, pending balance = full sale total.
- `À prazo com entrada`: `amount_paid = down payment`, pending balance = `sale total - down payment`.
- For credit sales with down payment, the entry is required, must be `> 0`, and cannot exceed the sale total.
- When the down payment equals the total, the sale is accepted and no balance remains open.

## Server-side checkout normalization

The sale total that feeds customer debt is now protected on the API side:

- the browser can still send preview values, but the API recalculates the official item prices from the catalog before persisting the sale;
- `cash` prefers `product.price_cash`;
- `card`, `bank`, `other`, `credit`, and `credit_with_entry` prefer `product.price_base`, with fallback to `price_cash`;
- subtotal, total, pending balance, and change are normalized from those catalog prices;
- role discount limits are validated as percentages of the recalculated subtotal.

## Backend endpoints

- `GET /api/v1/customers/{id}/payments`
  - Query params: `start_date`, `end_date` (`YYYY-MM-DD`), `method` (`cash|card|bank|other|legacy`), `sort` (`asc|desc`).
  - Returns `payments[]` plus a `summary` with total debt, total paid, current balance, and filtered totals.
  - `total_paid` includes manual customer payments and sale-time received amounts (`sale.amount_paid`).
- `POST /api/v1/customers/{id}/payments`
  - Body: `amount` (required, `> 0`), optional `payment_date`, `method`, `reference`, `notes`.
  - Records the payment for the authenticated user (`received_by`) and returns `payment` + `summary` (previous/new balance) + `receipt_hint`.
- `GET /api/v1/customers/{id}/payments/report`
  - Date/method/sort filters match the list endpoint. This report returns the complete selection in one read-only repeatable-read snapshot, up to 5,000 payments; page/page_size do not truncate it.
  - coverage.complete, coverage.row_count and coverage.row_limit identify the complete result. Counts, unique payment ids and exact decimal sums must agree with the filtered totals.
  - Selections above 5,000 rows return HTTP 413 (payment_report_limit_exceeded); narrow the date or method filter. Inconsistent/unrepresentable totals return HTTP 422 (payment_report_inconsistent), without a partial payload.
  - The printable page verifies completeness before offering Print, including when connected to an older API without coverage metadata. A truncated response is not printed as a full history.
  - Global debt/balance formulas are unchanged here; net sale-time payment accounting remains tracked in TSK-012.
- `GET /api/v1/customers/{customerId}/payments/{paymentId}/receipt`
  - Returns receipt payload with previous balance, payment amount, new balance, and metadata (company, customer, employee).

## Frontend flows

- Customer detail page: shows current balance, total charges/paid, and a filtered payment history (date range, method, sort).
- POS checkout: supports immediate payment, full credit sale, and credit sale with down payment.
- Register payment: opens from customer detail or quick entry and returns the new balance after saving.
- Printable views: `/catalog/customers/:customerId/payments/:paymentId/receipt` and `/catalog/customers/:id/payments/history`.

## Currency mask

Manual monetary inputs in the frontend use a BRL mask:

- `R$ 0,00`
- `R$ 10,00`
- `R$ 1.000,00`
- `R$ 10.000,50`

Rules:

- The UI shows formatted BRL values only.
- Internally the app keeps numeric decimal values.
- Parsing strips `R$`, thousands separators, and localized punctuation before calculation/persistence.

## Company header

Receipts and reports use these env vars (defaults are provided):

```text
COMPANY_NAME
COMPANY_ADDRESS
COMPANY_TAX_ID
```

Set them in `.env` or deployment to reflect the store's legal info.

## Backup/restore and imports

- Full backups/restores include the entire `customer_payment` table, so payment history is preserved end-to-end.
- Legacy imports require payment history in `PAGAMENT.DBF` and will fail fast if it is missing, ensuring payments are loaded alongside customers and sales.

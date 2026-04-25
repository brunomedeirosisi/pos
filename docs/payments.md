# Customer Payment & Debt Management

This feature lets operators register payments against a customer, keep running balances (debt minus payments), filter and review payment history, and print either a single payment receipt or a full history report.

## Backend endpoints

- `GET /api/v1/customers/{id}/payments`
  - Query params: `start_date`, `end_date` (`YYYY-MM-DD`), `method` (`cash|card|bank|other|legacy`), `sort` (`asc|desc`).
  - Returns `payments[]` plus a `summary` with total debt, total paid, current balance, and filtered totals.
- `POST /api/v1/customers/{id}/payments`
  - Body: `amount` (required, >0), optional `payment_date`, `method`, `reference`, `notes`.
  - Records the payment for the authenticated user (`received_by`) and returns `payment` + `summary` (previous/new balance) + `receipt_hint`.
- `GET /api/v1/customers/{id}/payments/report`
  - Same filters as the list endpoint. Returns company header, customer summary, payments, and totals ready for printing.
- `GET /api/v1/customers/{customerId}/payments/{paymentId}/receipt`
  - Returns receipt payload with previous balance, payment amount, new balance, and metadata (company, customer, employee).

## Frontend flows

- **Customer detail page**: Shows current balance, total charges/paid, and a filtered payment history (date range, method, sort). Each row offers “Receipt”; history can be printed via “Print payment history”.
- **Register payment**: Opens from customer detail (or quick entry page). After saving, the success banner shows the receipt link and the new balance.
- **Printable views**: `/catalog/customers/:customerId/payments/:paymentId/receipt` (single receipt) and `/catalog/customers/:id/payments/history` (full report) include quick print buttons and auto-print when loaded.

## Company header

Receipts and reports use these env vars (defaults are provided):

```
COMPANY_NAME
COMPANY_ADDRESS
COMPANY_TAX_ID
```

Set them in `.env`/deployment to reflect the store's legal info.

## Backup/restore and imports

- Full backups/restores (pg_dump snapshots) include the entire `customer_payment` table, so payment history is preserved end-to-end.
- Legacy imports require payment history in `PAGAMENT.DBF` and will fail fast if it is missing, ensuring payments are loaded alongside customers and sales.

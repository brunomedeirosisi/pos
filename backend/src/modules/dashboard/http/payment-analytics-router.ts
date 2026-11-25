import { Router } from "express";
import { requirePermission } from "../../../middleware/auth.js";
import { forbidden } from "../../../errors.js";
import { canReadCustomerFinancials } from "../../../services/customer-portfolio.js";
import { asyncHandler } from "../../../utils/async-handler.js";
import { logAudit } from "../../../utils/audit.js";
import { createXlsx } from "../../../utils/xlsx.js";
import { paymentAnalyticsSchema } from "../contracts/payment-analytics-contracts.js";
import { PgPaymentAnalyticsRepository } from "../repository/payment-analytics-repository.js";

export const paymentAnalyticsRouter = Router();
const repository = new PgPaymentAnalyticsRepository();
paymentAnalyticsRouter.use(
  requirePermission("reports:view"),
  requirePermission("catalog:read"),
  (req, res, next) => {
    if (!canReadCustomerFinancials(req.user))
      return next(forbidden("customer_financials_forbidden"));
    res.set("Cache-Control", "no-store");
    next();
  },
);
paymentAnalyticsRouter.get(
  "/options",
  asyncHandler(async (_req, res) => {
    res.json(await repository.options());
  }),
);
paymentAnalyticsRouter.get(
  "/summary",
  asyncHandler(async (req, res) => {
    res.json(await repository.summary(paymentAnalyticsSchema.parse(req.query)));
  }),
);
for (const kind of ["transactions", "customers", "employees"] as const) {
  paymentAnalyticsRouter.get(
    "/" + kind,
    asyncHandler(async (req, res) => {
      res.json(
        await repository.page(kind, paymentAnalyticsSchema.parse(req.query)),
      );
    }),
  );
}
paymentAnalyticsRouter.get(
  "/export",
  asyncHandler(async (req, res) => {
    const filters = paymentAnalyticsSchema.parse(req.query),
      rows = await repository.exportRows(filters);
    const pt = filters.locale === "pt-BR";
    const headers = pt
      ? [
          "Data efetiva",
          "Tipo",
          "Origem",
          "Forma",
          "Cliente",
          "Responsável",
          "Loja",
          "ID de origem",
          "Referência",
          "Recebido bruto (BRL)",
          "Estornos (BRL)",
          "Recebido líquido (BRL)",
          "Registro de origem",
        ]
      : [
          "Effective date",
          "Event",
          "Origin",
          "Method",
          "Customer",
          "Receiver",
          "Store",
          "Source ID",
          "Reference",
          "Gross received (BRL)",
          "Reversals (BRL)",
          "Net received (BRL)",
          "Source record",
        ];
    const labels: Record<string, string> = pt
      ? {
          receipt: "Recebimento",
          reversal: "Estorno",
          cash_sale: "Venda à vista",
          credit_entry: "Entrada de venda a prazo",
          debt_payment: "Amortização de dívida",
          cash: "Dinheiro",
          card: "Cartão",
          bank: "Transferência bancária",
          other: "Outros",
          legacy: "Legado (não identificado)",
          unspecified: "Não informado",
        }
      : {
          receipt: "Receipt",
          reversal: "Reversal",
          cash_sale: "Cash sale",
          credit_entry: "Credit sale entry",
          debt_payment: "Debt amortization",
          cash: "Cash",
          card: "Card",
          bank: "Bank transfer",
          other: "Other",
          legacy: "Legacy (unidentified)",
          unspecified: "Unspecified",
        };
    const buffer = await createXlsx(
      headers,
      rows.map((row) => [
        row.event_date,
        labels[row.kind],
        labels[row.origin],
        labels[row.method],
        row.customer_name,
        row.receiver_name,
        row.store_id,
        row.source_id,
        row.reference,
        Number(row.gross),
        Number(row.refunds),
        Number(row.net),
        row.source_type === "sale"
          ? `/sales/${row.source_id}`
          : `/payments/${row.source_id}`,
      ]),
      pt ? "Pagamentos" : "Payments",
    );
    await logAudit({
      userId: req.user!.id,
      action: "DASHBOARD_PAYMENTS_EXPORT",
      ipAddress: req.ip,
      details: {
        count: rows.length,
        startDate: filters.startDate,
        endDate: filters.endDate,
      },
    });
    res
      .type("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
      .attachment("payments.xlsx")
      .send(buffer);
  }),
);

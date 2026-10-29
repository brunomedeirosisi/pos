import type {
  SaleItemDto,
  SalePaymentMethod,
  SaleReceiptDto,
  SaleReceiptLocale,
} from '../contracts/sales-contracts.js';
import { getSalePaidAt, isLegacySale, mapSaleItem } from './sales-domain.js';
import type { SaleReceiptRecord } from '../repository/sales-repository.js';

const RECEIPT_WIDTH = 40;
const RECEIPT_SEPARATOR = '-'.repeat(RECEIPT_WIDTH);

type CompanyInfo = SaleReceiptDto['company'];

const paymentMethodLabels: Record<SaleReceiptLocale, Record<SalePaymentMethod, string>> = {
  'pt-BR': {
    cash: 'Dinheiro',
    card: 'Cartao',
    bank: 'Transferencia',
    other: 'Outro',
    credit: 'A prazo',
    credit_with_entry: 'A prazo c/ entrada',
  },
  en: {
    cash: 'Cash',
    card: 'Card',
    bank: 'Bank transfer',
    other: 'Other',
    credit: 'On credit',
    credit_with_entry: 'On credit with down payment',
  },
};

const receiptLabels = {
  'pt-BR': {
    title: 'RECIBO DE VENDA',
    receiptCode: 'Codigo',
    date: 'Data',
    time: 'Hora',
    customer: 'Cliente',
    customerCode: 'Codigo',
    taxId: 'Documento',
    seller: 'Vendedor',
    paymentTerm: 'Condicao',
    paymentMethod: 'Forma pgto',
    amountPaid: 'Valor pago',
    changeAmount: 'Troco',
    itemHeader: 'ITEM',
    qtyHeader: 'QTD',
    unitHeader: 'UNIT',
    totalHeader: 'TOTAL',
    subtotal: 'Subtotal',
    discount: 'Desconto',
    grandTotal: 'Total compra',
    orderNumber: 'Pedido',
    generatedAt: 'Gerado em',
    thanks: 'Obrigado pela preferencia.',
    notInformed: 'Nao informado',
  },
  en: {
    title: 'SALES RECEIPT',
    receiptCode: 'Code',
    date: 'Date',
    time: 'Time',
    customer: 'Customer',
    customerCode: 'Code',
    taxId: 'Tax ID',
    seller: 'Seller',
    paymentTerm: 'Payment term',
    paymentMethod: 'Payment',
    amountPaid: 'Amount paid',
    changeAmount: 'Change',
    itemHeader: 'ITEM',
    qtyHeader: 'QTY',
    unitHeader: 'UNIT',
    totalHeader: 'TOTAL',
    subtotal: 'Subtotal',
    discount: 'Discount',
    grandTotal: 'Order total',
    orderNumber: 'Order',
    generatedAt: 'Generated',
    thanks: 'Thank you for shopping with us.',
    notInformed: 'Not informed',
  },
} as const;

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function formatDateParts(value: string | null | undefined): { date: string; time: string } {
  if (!value) {
    return { date: '--/--/----', time: '--:--' };
  }

  const calendarDate = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (calendarDate) {
    return { date: `${calendarDate[3]}/${calendarDate[2]}/${calendarDate[1]}`, time: '--:--' };
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return { date: value, time: '--:--' };
  }

  return {
    date: `${pad2(parsed.getDate())}/${pad2(parsed.getMonth() + 1)}/${parsed.getFullYear()}`,
    time: `${pad2(parsed.getHours())}:${pad2(parsed.getMinutes())}`,
  };
}

function formatCurrency(value: number | null, locale: SaleReceiptLocale): string {
  if (value == null) {
    return '-';
  }

  const normalized = value.toFixed(2);
  if (locale === 'pt-BR') {
    return `R$ ${normalized.replace('.', ',')}`;
  }

  return `BRL ${normalized}`;
}

function formatQuantity(value: number): string {
  const normalized = value.toFixed(3);
  return normalized.replace(/\.?0+$/, '');
}

function trimText(value: string, width: number): string {
  const safe = value.trim().replace(/\s+/g, ' ');
  if (safe.length <= width) {
    return safe;
  }
  if (width <= 1) {
    return safe.slice(0, width);
  }
  return `${safe.slice(0, width - 1)}~`;
}

function centerText(value: string): string {
  const safe = trimText(value, RECEIPT_WIDTH);
  const leftPad = Math.max(0, Math.floor((RECEIPT_WIDTH - safe.length) / 2));
  return `${' '.repeat(leftPad)}${safe}`;
}

function labelValueLine(label: string, value: string): string {
  const safeLabel = trimText(label, RECEIPT_WIDTH - 1);
  const safeValue = trimText(value, RECEIPT_WIDTH - 1);
  const spaces = Math.max(1, RECEIPT_WIDTH - safeLabel.length - safeValue.length);
  return `${safeLabel}${' '.repeat(spaces)}${safeValue}`;
}

function buildItemsLines(items: SaleItemDto[], locale: SaleReceiptLocale): string[] {
  const labels = receiptLabels[locale];
  const lines = [labelValueLine(labels.itemHeader, `${labels.qtyHeader}  ${labels.unitHeader}  ${labels.totalHeader}`)];

  for (const item of items) {
    const productName = trimText(item.product_name ?? item.product_id, RECEIPT_WIDTH);
    const qty = formatQuantity(item.quantity).padStart(6, ' ');
    const unit = trimText(formatCurrency(item.unit_price ?? 0, locale), 10).padStart(10, ' ');
    const total = trimText(formatCurrency(item.total ?? item.quantity * (item.unit_price ?? 0), locale), 10).padStart(10, ' ');

    lines.push(productName);
    lines.push(`${' '.repeat(2)}${qty}${unit}${total}`);
  }

  return lines;
}

function buildPlainText(receipt: Omit<SaleReceiptDto, 'plain_text'>, locale: SaleReceiptLocale): string {
  const labels = receiptLabels[locale];
  const timestamp = formatDateParts(receipt.sale.paid_at ?? receipt.sale.emission_date);
  const generatedAt = formatDateParts(receipt.generated_at);
  const methodLabel = receipt.sale.payment_method ? paymentMethodLabels[locale][receipt.sale.payment_method] : labels.notInformed;
  const customerName = receipt.customer?.name ?? labels.notInformed;

  const lines = [
    centerText(receipt.company.name),
    centerText(receipt.company.address),
    centerText(receipt.company.tax_id),
    RECEIPT_SEPARATOR,
    centerText(labels.title),
    labelValueLine(labels.receiptCode, receipt.sale.code),
    labelValueLine(labels.date, timestamp.date),
    labelValueLine(labels.time, timestamp.time),
    labelValueLine(labels.customer, customerName),
  ];

  if (receipt.customer?.legacy_code) {
    lines.push(labelValueLine(labels.customerCode, receipt.customer.legacy_code));
  }

  if (receipt.customer?.cpf) {
    lines.push(labelValueLine(labels.taxId, receipt.customer.cpf));
  }

  if (receipt.seller?.name) {
    lines.push(labelValueLine(labels.seller, receipt.seller.name));
  }

  if (receipt.sale.order_number) {
    lines.push(labelValueLine(labels.orderNumber, receipt.sale.order_number));
  }

  if (receipt.sale.payment_term_name) {
    lines.push(labelValueLine(labels.paymentTerm, receipt.sale.payment_term_name));
  }

  lines.push(labelValueLine(labels.paymentMethod, methodLabel));
  lines.push(labelValueLine(labels.amountPaid, formatCurrency(receipt.sale.amount_paid, locale)));

  if ((receipt.sale.change_amount ?? 0) > 0) {
    lines.push(labelValueLine(labels.changeAmount, formatCurrency(receipt.sale.change_amount, locale)));
  }

  lines.push(RECEIPT_SEPARATOR);
  lines.push(...buildItemsLines(receipt.items, locale));
  lines.push(RECEIPT_SEPARATOR);
  lines.push(labelValueLine(labels.subtotal, formatCurrency(receipt.sale.subtotal, locale)));
  lines.push(labelValueLine(labels.discount, formatCurrency(receipt.sale.discount, locale)));
  lines.push(labelValueLine(labels.grandTotal, formatCurrency(receipt.sale.total, locale)));
  lines.push(RECEIPT_SEPARATOR);
  lines.push(labelValueLine(labels.generatedAt, `${generatedAt.date} ${generatedAt.time}`));
  lines.push(centerText(labels.thanks));

  return `${lines.join('\n')}\n`;
}

export function mapSaleReceipt(record: SaleReceiptRecord, company: CompanyInfo, locale: SaleReceiptLocale): SaleReceiptDto {
  const items = Array.isArray(record.items) ? record.items.map(mapSaleItem) : [];
  const baseReceipt = {
    company,
    sale: {
      id: record.id,
      code: `REC-${record.id.slice(0, 8).toUpperCase()}`,
      emission_date: record.emission_date,
      paid_at: getSalePaidAt(record),
      order_number: record.order_number,
      status: record.status,
      subtotal: Number(record.subtotal ?? 0),
      discount: Number(record.discount ?? 0),
      total: Number(record.total ?? 0),
      pending_amount: isLegacySale(record) ? null : record.pending_amount == null
        ? Math.max(Number(record.total ?? 0) - Number(record.amount_paid ?? 0), 0)
        : Number(record.pending_amount),
      payment_method: record.payment_method,
      payment_term_name: record.payment_term_name,
      amount_paid: record.amount_paid == null ? null : Number(record.amount_paid),
      change_amount: record.change_amount == null ? null : Number(record.change_amount),
    },
    customer: record.customer_id && record.customer_name
      ? {
          id: record.customer_id,
          legacy_code: record.customer_legacy_code,
          name: record.customer_name,
          cpf: record.customer_cpf,
        }
      : null,
    seller: record.seller_id && record.seller_name
      ? {
          id: record.seller_id,
          name: record.seller_name,
        }
      : null,
    items,
    generated_at: new Date().toISOString(),
  } satisfies Omit<SaleReceiptDto, 'plain_text'>;

  return {
    ...baseReceipt,
    plain_text: buildPlainText(baseReceipt, locale),
  };
}

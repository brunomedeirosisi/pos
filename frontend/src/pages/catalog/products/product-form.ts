import { z } from 'zod';
import { parseLocaleNumericInput } from '../../../utils/number';

const nullableNumberSchema = z.preprocess(
  parseLocaleNumericInput,
  z.number({ invalid_type_error: 'Invalid number' }).nonnegative().nullable()
);

export const productFormSchema = z.object({
  name: z.string().trim().min(1, 'Required'),
  barcode: z.string().trim().optional(),
  group_id: z.string().uuid().optional().or(z.literal('')),
  reference: z.string().trim().optional(),
  min_stock: nullableNumberSchema.optional(),
  price_cash: nullableNumberSchema.optional(),
  price_base: nullableNumberSchema.optional(),
});

export type ProductFormValues = z.infer<typeof productFormSchema>;

export const productFormDefaults: ProductFormValues = {
  name: '',
  barcode: '',
  group_id: '',
  reference: '',
  min_stock: null,
  price_cash: null,
  price_base: null,
};

export function buildProductPayload(values: ProductFormValues) {
  return {
    ...values,
    barcode: values.barcode?.trim() || null,
    group_id: values.group_id ? values.group_id : null,
    reference: values.reference?.trim() || null,
    min_stock: values.min_stock ?? null,
    price_cash: values.price_cash ?? null,
    price_base: values.price_base ?? null,
  };
}

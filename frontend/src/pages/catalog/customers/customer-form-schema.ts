import { z } from 'zod';
import { parseLocaleNumericInput } from '../../../utils/number';

const nullableNumberSchema = z.preprocess(parseLocaleNumericInput, z.number().nonnegative().nullable());

export const customerFormSchema = z.object({
  name: z.string().trim().min(1, 'Required'),
  legacy_code: z.string().trim().optional(),
  cpf: z.string().trim().optional(),
  address: z.string().trim().optional(),
  city: z.string().trim().optional(),
  uf: z
    .string()
    .trim()
    .length(2, 'UF must be 2 letters')
    .transform((value) => value.toUpperCase())
    .optional()
    .or(z.literal('')),
  cep: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  status: z.enum(['active', 'delinquent', 'inactive']).default('active'),
  credit_limit: nullableNumberSchema.optional(),
  notes: z.string().trim().optional(),
});

export type CustomerFormValues = z.infer<typeof customerFormSchema>;

export const customerFormDefaults: CustomerFormValues = {
  name: '',
  legacy_code: '',
  cpf: '',
  address: '',
  city: '',
  uf: '',
  cep: '',
  phone: '',
  status: 'active',
  credit_limit: null,
  notes: '',
};

export function buildCustomerPayload(values: CustomerFormValues) {
  return {
    ...values,
    legacy_code: values.legacy_code?.trim() || null,
    cpf: values.cpf?.trim() || null,
    address: values.address?.trim() || null,
    city: values.city?.trim() || null,
    uf: values.uf ? values.uf.toUpperCase() : null,
    cep: values.cep?.trim() || null,
    phone: values.phone?.trim() || null,
    notes: values.notes?.trim() || null,
    credit_limit: values.credit_limit ?? null,
  };
}
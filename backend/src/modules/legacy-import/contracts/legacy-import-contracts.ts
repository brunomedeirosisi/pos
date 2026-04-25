import { z } from 'zod';

export const REQUIRED_DBF = ['PRODUTO.DBF', 'GRUPO.DBF', 'CLIENTES.DBF', 'VENDEDOR.DBF', 'VENDAS.DBF', 'PEDIDOS.DBF', 'PAGAMENT.DBF'];

export const legacyImportSchema = z.object({
  overwrite: z
    .union([z.string(), z.boolean()])
    .optional()
    .transform((value) => {
      if (value === undefined) return false;
      if (typeof value === 'boolean') return value;
      const normalized = value.toLowerCase();
      return normalized === 'true' || normalized === '1' || normalized === 'on';
    }),
  confirmation: z.string(),
  password: z.string().min(1),
});

export type LegacyImportInputDto = z.infer<typeof legacyImportSchema>;

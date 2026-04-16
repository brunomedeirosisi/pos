import { typedClient, unwrapOpenApiResponse } from '../api/openapi-client';
import type { Sale, SaleInput, SaleListFilters } from '../types/sales';

export const salesService = {
  list: async (filters?: SaleListFilters): Promise<Sale[]> =>
    unwrapOpenApiResponse(typedClient.GET('/api/v1/sales', { params: { query: filters } })),
  get: async (id: string): Promise<Sale> =>
    unwrapOpenApiResponse(typedClient.GET('/api/v1/sales/{id}', { params: { path: { id } } })),
  create: async (data: SaleInput): Promise<Sale> =>
    unwrapOpenApiResponse(typedClient.POST('/api/v1/sales', { body: data })),
  cancel: async (id: string, reason?: string): Promise<Sale> =>
    unwrapOpenApiResponse(
      typedClient.POST('/api/v1/sales/{id}/cancel', {
        params: { path: { id } },
        body: reason ? { reason } : {},
      })
    ),
};

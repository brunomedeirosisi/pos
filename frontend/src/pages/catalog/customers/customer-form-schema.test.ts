import { describe, expect, it } from 'vitest';
import { buildCustomerPayload } from './customer-form-schema';

describe('buildCustomerPayload', () => {
  it('does not include a manually editable code field', () => {
    const payload = buildCustomerPayload({
      name: 'Cliente novo',
      cpf: ' 123 ',
      address: ' Rua A ',
      city: ' Cidade ',
      uf: 'sp',
      cep: ' 00000-000 ',
      phone: ' 9999-9999 ',
      status: 'active',
      credit_limit: 100,
      notes: ' Obs ',
    });

    expect(payload).toEqual({
      name: 'Cliente novo',
      cpf: '123',
      address: 'Rua A',
      city: 'Cidade',
      uf: 'SP',
      cep: '00000-000',
      phone: '9999-9999',
      status: 'active',
      credit_limit: 100,
      notes: 'Obs',
    });
    expect('legacy_code' in payload).toBe(false);
  });
});

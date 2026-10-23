import { beforeEach, describe, expect, it, vi } from 'vitest';

const { queryMock } = vi.hoisted(() => ({
  queryMock: vi.fn(),
}));

vi.mock('../db.js', () => ({
  query: queryMock,
}));

import { generateNextNumericCode } from './generated-code.js';

describe('generateNextNumericCode', () => {
  beforeEach(() => {
    queryMock.mockReset();
  });

  it('locks and returns the next customer code', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ next_code: '42' }] });

    const result = await generateNextNumericCode('customer', {} as never);

    expect(result).toBe('42');
    expect(queryMock).toHaveBeenNthCalledWith(1, 'select pg_advisory_xact_lock($1)', [41001], expect.anything());
    expect(queryMock).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('from customer'),
      undefined,
      expect.anything()
    );
  });

  it('defaults to 1 when there is no numeric code yet', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ next_code: 1 }] });

    const result = await generateNextNumericCode('product', {} as never);

    expect(result).toBe('1');
    expect(queryMock).toHaveBeenNthCalledWith(1, 'select pg_advisory_xact_lock($1)', [41002], expect.anything());
    expect(queryMock).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('from product'),
      undefined,
      expect.anything()
    );
  });
});

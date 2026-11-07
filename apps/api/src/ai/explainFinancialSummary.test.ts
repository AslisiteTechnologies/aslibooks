import { describe, expect, it, vi } from 'vitest';
import { explainFinancialSummary } from './explainFinancialSummary.js';

const summary = { period: '2026-04-01 to 2026-11-05', currency: 'INR', revenuePaise: 100_000, expensesPaise: 45_000,
  netProfitPaise: 55_000, cashPaise: 80_000, receivablesPaise: 20_000, payablesPaise: 5_000 } as const;
const output = { summary: 'Income exceeds expenses. Verify decisions with a qualified person.', observations: ['Receivables exceed payables.'], questions: ['Are receivables expected to be collected soon?'] };
const response = (text: string, ok = true) => ({ ok, json: async () => ({ output: [{ content: [{ type: 'output_text', text }] }] }) }) as Response;

describe('explainFinancialSummary', () => {
  it('sends only the allowlisted aggregate and validates the structured response', async () => {
    const fetcher = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => response(JSON.stringify(output)));
    await expect(explainFinancialSummary(summary, { apiKey: 'test-key', fetcher })).resolves.toEqual(output);
    const request = JSON.parse(String(fetcher.mock.calls[0][1]?.body));
    expect(request.store).toBe(false);
    expect(request.input).toContain('revenuePaise');
    expect(request.input).not.toContain('customer');
    expect(request.tools).toBeUndefined();
    expect(fetcher.mock.calls[0][1]?.headers).toMatchObject({ Authorization: 'Bearer test-key' });
  });

  it('rejects extra input fields and missing provider configuration', async () => {
    await expect(explainFinancialSummary({ ...summary, accountNames: ['Private account'] }, { apiKey: 'key' }))
      .rejects.toMatchObject({ status: 400 });
    await expect(explainFinancialSummary(summary, { apiKey: '' })).rejects.toMatchObject({ status: 503 });
  });

  it('rejects malformed model output and hides provider errors', async () => {
    const malformed = vi.fn(async () => response(JSON.stringify({ ...output, surprise: 'unvalidated' })));
    await expect(explainFinancialSummary(summary, { apiKey: 'key', fetcher: malformed }))
      .rejects.toMatchObject({ status: 502 });
    const unavailable = vi.fn(async () => response('{}', false));
    await expect(explainFinancialSummary(summary, { apiKey: 'key', fetcher: unavailable }))
      .rejects.toMatchObject({ status: 502 });
  });
});

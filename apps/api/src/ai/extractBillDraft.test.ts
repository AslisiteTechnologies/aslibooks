import { describe, expect, it, vi } from 'vitest';
import { extractBillDraft } from './extractBillDraft.js';

const sourceText = 'Northwind Supplies invoice NW-42 dated 5 November 2026. Total INR 1,234.50. Payment due 30 November 2026. Paper supplies.';
const suggestion = { vendorName: 'Northwind Supplies', vendorReference: 'NW-42', description: 'Paper supplies', amountPaise: 123450,
  dueDate: '2026-11-30', currency: 'INR', taxStatus: 'none_seen', confidence: 'high', uncertainties: [] };
const response = (text: string, ok = true) => ({ ok, json: async () => ({ output: [{ content: [{ type: 'output_text', text }] }] }) }) as Response;

describe('extractBillDraft', () => {
  it('sends bounded untrusted source as non-persisted input and validates output', async () => {
    const fetcher = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => response(JSON.stringify(suggestion)));
    await expect(extractBillDraft({ sourceText }, { apiKey: 'test-key', fetcher })).resolves.toEqual(suggestion);
    const payload = JSON.parse(String(fetcher.mock.calls[0][1]?.body));
    expect(payload.store).toBe(false); expect(payload.tools).toBeUndefined(); expect(payload.input).toBe(sourceText);
  });
  it('rejects invalid input, missing configuration and malformed provider output', async () => {
    await expect(extractBillDraft({ sourceText: 'too short' }, { apiKey: 'key' })).rejects.toMatchObject({ status: 400 });
    await expect(extractBillDraft({ sourceText }, { apiKey: '' })).rejects.toMatchObject({ status: 503 });
    await expect(extractBillDraft({ sourceText }, { apiKey: 'key', fetcher: async () => response('{"unexpected":true}') })).rejects.toMatchObject({ status: 502 });
  });
  it('does not apply amounts stated in a non-INR currency', async () => {
    const foreign = { ...suggestion, amountPaise: 123450, currency: 'other' };
    await expect(extractBillDraft({ sourceText }, { apiKey: 'key', fetcher: async () => response(JSON.stringify(foreign)) }))
      .resolves.toMatchObject({ amountPaise: null, currency: 'other' });
  });
});

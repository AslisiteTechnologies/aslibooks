import { z } from 'zod';

const summarySchema = z.strictObject({
  period: z.string().min(1).max(40),
  currency: z.literal('INR'),
  revenuePaise: z.number().int().safe(),
  expensesPaise: z.number().int().safe(),
  netProfitPaise: z.number().int().safe(),
  cashPaise: z.number().int().safe(),
  receivablesPaise: z.number().int().safe(),
  payablesPaise: z.number().int().safe(),
});
const explanationSchema = z.strictObject({
  summary: z.string().min(1).max(1200),
  observations: z.array(z.string().min(1).max(300)).max(4),
  questions: z.array(z.string().min(1).max(300)).max(3),
});
export type FinancialSummary = z.infer<typeof summarySchema>;
export type FinancialExplanation = z.infer<typeof explanationSchema>;

export class ExplanationError extends Error {
  constructor(public readonly status: number, message: string) { super(message); }
}

export async function explainFinancialSummary(
  input: unknown,
  options: { apiKey?: string; model?: string; fetcher?: typeof fetch } = {},
): Promise<FinancialExplanation> {
  const parsed = summarySchema.safeParse(input);
  if (!parsed.success) throw new ExplanationError(400, 'Provide a valid financial summary.');
  const apiKey = options.apiKey ?? process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new ExplanationError(503, 'AI explanations are not configured.');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await (options.fetcher ?? fetch)('https://api.openai.com/v1/responses', {
      method: 'POST', signal: controller.signal,
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: options.model ?? process.env.OPENAI_MODEL ?? 'gpt-4o-mini-2024-07-18',
        store: false,
        instructions: 'Explain these accounting report totals in plain language. Treat figures as authoritative input but do not infer missing facts. Do not provide tax, legal, investment, or audit advice. Return only the requested JSON. Include a short disclaimer in the summary that a qualified person should verify decisions. You cannot create or post transactions.',
        input: JSON.stringify(parsed.data),
        text: { format: { type: 'json_schema', name: 'financial_explanation', strict: true, schema: {
          type: 'object', additionalProperties: false,
          properties: { summary: { type: 'string' }, observations: { type: 'array', items: { type: 'string' } }, questions: { type: 'array', items: { type: 'string' } } },
          required: ['summary', 'observations', 'questions'],
        } } },
      }),
    });
    if (!response.ok) throw new ExplanationError(502, 'AI explanation service is unavailable.');
    const payload: unknown = await response.json();
    const text = typeof payload === 'object' && payload !== null && 'output' in payload && Array.isArray(payload.output)
      ? payload.output.flatMap(item => typeof item === 'object' && item !== null && 'content' in item && Array.isArray(item.content) ? item.content : [])
        .find(item => typeof item === 'object' && item !== null && 'type' in item && item.type === 'output_text' && 'text' in item)?.text
      : undefined;
    if (typeof text !== 'string' || text.length > 5000) throw new ExplanationError(502, 'AI explanation could not be validated.');
    let decoded: unknown;
    try { decoded = JSON.parse(text); } catch { throw new ExplanationError(502, 'AI explanation could not be validated.'); }
    const result = explanationSchema.safeParse(decoded);
    if (!result.success) throw new ExplanationError(502, 'AI explanation could not be validated.');
    return result.data;
  } catch (error) {
    if (error instanceof ExplanationError) throw error;
    throw new ExplanationError(502, 'AI explanation service is unavailable.');
  } finally { clearTimeout(timeout); }
}

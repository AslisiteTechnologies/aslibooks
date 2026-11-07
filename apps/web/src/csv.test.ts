import { describe, expect, it } from 'vitest';
import { serializeCsv } from './csv';

describe('CSV serialization', () => {
  it('quotes delimiters and lines, doubles quotes, and neutralizes spreadsheet formulas', () => {
    expect(serializeCsv(['Name', 'Value'], [
      ['Vendor, Inc.', 'a "quoted"\nvalue'],
      ['=HYPERLINK("https://example.invalid")', -250],
      ['@SUM(A1:A2)', 125],
    ])).toBe('"Name","Value"\r\n"Vendor, Inc.","a ""quoted""\nvalue"\r\n"\'=HYPERLINK(""https://example.invalid"")",-250\r\n"\'@SUM(A1:A2)",125');
  });
});

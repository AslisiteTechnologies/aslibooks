import { describe, expect, it } from 'vitest';
import { buildPrintableReportHtml } from './printableReport';

describe('printable financial reports', () => {
  it('renders organization, report sections, and values in a printable packet', () => {
    const html = buildPrintableReportHtml('Asli Stores', '2026-03-31', [{
      title: 'Trial balance', rows: [['Cash', '₹1,000.00'], ['TOTAL', '₹1,000.00']],
    }]);
    expect(html).toContain('Asli Stores · Through 2026-03-31 · INR');
    expect(html).toContain('<h2>Trial balance</h2>');
    expect(html).toContain('<td>₹1,000.00</td>');
    expect(html).toContain('window.print()');
  });

  it('escapes organization, section, and cell values before writing popup HTML', () => {
    const html = buildPrintableReportHtml('<img src=x onerror=alert(1)>', '2026-03-31', [{
      title: '<script>alert(1)</script>', rows: [['<svg onload=alert(1)>', '"quoted" & value']],
    }]);
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<script>alert');
    expect(html).not.toContain('<svg');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).toContain('&quot;quoted&quot; &amp; value');
  });
});

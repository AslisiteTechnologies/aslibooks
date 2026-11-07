export type PrintableReportSection = {
  title: string;
  rows: Array<Array<string | number>>;
};

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character] ?? character);
}

export function buildPrintableReportHtml(organizationName: string, asOf: string, sections: PrintableReportSection[]) {
  const renderedSections = sections.map(section => {
    const rows = section.rows.map(row => `<tr>${row.map(value => `<td>${escapeHtml(String(value))}</td>`).join('')}</tr>`).join('');
    return `<section><h2>${escapeHtml(section.title)}</h2><table><tbody>${rows}</tbody></table></section>`;
  }).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(organizationName)} · Financial reports · ${escapeHtml(asOf)}</title><style>body{font:14px Arial,sans-serif;color:#17202a;margin:32px}h1{margin-bottom:4px}h2{font-size:18px;margin:28px 0 8px}p{color:#5d6875}table{border-collapse:collapse;width:100%}td{padding:7px 9px;border-bottom:1px solid #d7dce1}td:first-child{width:65%}@media print{body{margin:12mm}section{break-inside:avoid}h2{break-after:avoid}thead,tr{break-inside:avoid}}</style></head><body><h1>Financial reports</h1><p>${escapeHtml(organizationName)} · Through ${escapeHtml(asOf)} · INR</p>${renderedSections}<script>window.onload=()=>window.print()</script></body></html>`;
}

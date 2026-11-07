import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';

const baseUrl = process.env.ASLIBOOKS_WEB_URL ?? 'http://localhost:5173';
const browser = await chromium.launch({ headless: true });

try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));

  const response = await page.goto(baseUrl, { waitUntil: 'networkidle' });
  assert.ok(response?.ok(), `web app returned ${response?.status() ?? 'no response'}`);
  await page.getByRole('heading', { name: 'Aslibooks' }).waitFor();
  await page.getByLabel('Email').waitFor();
  await page.getByLabel('Password').waitFor();
  await page.getByRole('button', { name: 'Sign in' }).waitFor();

  await page.getByRole('button', { name: 'Create account' }).click();
  await page.getByLabel('Full name').waitFor();
  await page.getByLabel('Email').waitFor();
  await page.getByLabel('Password').waitFor();

  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth,
  }));
  assert.ok(dimensions.content <= dimensions.viewport, `horizontal overflow: ${JSON.stringify(dimensions)}`);
  assert.deepEqual(pageErrors, [], `browser errors: ${pageErrors.join('; ')}`);
  console.log(`Local auth/mobile smoke passed at ${baseUrl} (${dimensions.viewport}px, no overflow).`);
} finally {
  await browser.close();
}

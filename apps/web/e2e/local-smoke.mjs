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

  const createAccount = page.getByRole('button', { name: 'Create account' });
  await createAccount.focus();
  await page.keyboard.press('Enter');
  await page.getByLabel('Full name').waitFor();
  await page.getByLabel('Email').waitFor();
  await page.getByLabel('Password').waitFor();
  assert.equal(await page.getByLabel('Full name').evaluate(element => element === document.activeElement), true,
    'signup should move focus to the first required field');
  await page.keyboard.press('Tab');
  assert.equal(await page.getByLabel('Email').evaluate(element => element === document.activeElement), true,
    'Tab from the name field should move focus to email');
  const backToSignIn = page.getByRole('button', { name: 'Sign in', exact: true });
  await backToSignIn.focus();
  await page.keyboard.press('Enter');
  assert.equal(await page.getByLabel('Email').evaluate(element => element === document.activeElement), true,
    'returning to sign in should move focus to email');

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

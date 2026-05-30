import { type Page, expect } from '@playwright/test';

export function uniqueUser(prefix = 'e2e') {
  const tag = Math.random().toString(36).slice(2, 8);
  return {
    username: `${prefix}_${tag}`,
    email: `${prefix}_${tag}@omnira.test`,
    password: 'correct horse battery staple',
  };
}

export async function signup(page: Page, u: { email: string; username: string; password: string }) {
  await page.goto('/signup');
  await page.getByLabel('Email').fill(u.email);
  await page.getByLabel('Username').fill(u.username);
  await page.getByLabel('Password').fill(u.password);
  await page.getByRole('button', { name: /create account/i }).click();
  // Signup pushes us to /play which then redirects to /lobby. Wait for either.
  await page.waitForURL((url) => /\/(play|lobby)/.test(url.pathname), { timeout: 20_000 });
}

export async function login(page: Page, identifier: string, password: string) {
  await page.goto('/login');
  await page.getByLabel(/email or username/i).fill(identifier);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: /log in/i }).click();
}

/**
 * Read the full wallet address from the Nav (rendered on every authed page,
 * with the full address stashed in `title=`).
 */
export async function walletFromNav(page: Page): Promise<string> {
  // wait for it to be rendered
  const el = page.locator('header [title^="0x"]').first();
  await el.waitFor({ state: 'visible', timeout: 15_000 });
  const title = await el.getAttribute('title');
  expect(title).toMatch(/^0x[0-9a-fA-F]{40}$/);
  return title!.trim();
}

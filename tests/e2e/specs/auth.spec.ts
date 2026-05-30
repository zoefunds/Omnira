import { test, expect } from '@playwright/test';
import { uniqueUser, signup, login, walletFromNav } from '../fixtures/helpers.js';

test.describe('auth & wallet persistence', () => {
  test('signup → wallet visible; logout; login → SAME wallet', async ({ browser }) => {
    const u = uniqueUser('auth');

    // Step 1: signup in context A
    const ctxA = await browser.newContext();
    const pageA = await ctxA.newPage();
    await signup(pageA, u);
    const walletAfterSignup = await walletFromNav(pageA);
    expect(walletAfterSignup).toMatch(/^0x[0-9a-fA-F]{40}$/);

    // Step 2: log out (Nav has a "Sign out" button)
    await pageA.getByRole('button', { name: /sign out/i }).click();
    await pageA.waitForURL('**/login');
    await ctxA.close();

    // Step 3: fresh context (simulates new device / cleared cache)
    const ctxB = await browser.newContext();
    const pageB = await ctxB.newPage();
    await login(pageB, u.username, u.password);
    const walletAfterLogin = await walletFromNav(pageB);

    // Same wallet across devices — the deterministic-derivation promise
    expect(walletAfterLogin).toBe(walletAfterSignup);

    await ctxB.close();
  });

  test('login with wrong password fails', async ({ browser }) => {
    const u = uniqueUser('auth_bad');
    const ctxA = await browser.newContext();
    const pageA = await ctxA.newPage();
    await signup(pageA, u);
    await pageA.getByRole('button', { name: /sign out/i }).click();
    await ctxA.close();

    const ctxB = await browser.newContext();
    const pageB = await ctxB.newPage();
    await login(pageB, u.username, 'totally wrong password');
    await expect(pageB.getByText(/invalid email\/username or password/i)).toBeVisible();
    await ctxB.close();
  });
});

import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { uniqueUser, signup } from '../fixtures/helpers.js';

async function clickSquare(page: Page, square: string) {
  const sq = page.locator(`[data-square="${square}"]`).first();
  await sq.waitFor({ state: 'visible', timeout: 10_000 });
  await sq.click();
}

async function tryMove(page: Page, from: string, to: string) {
  await clickSquare(page, from);
  await clickSquare(page, to);
}

async function queueBoth(p1: Page, p2: Page, label: string) {
  await p1.goto('/lobby');
  await p2.goto('/lobby');
  // Wait for the pill itself — its presence means auth + socket + hydration are done.
  await p1.getByText(label, { exact: true }).first().waitFor({ state: 'visible', timeout: 30_000 });
  await p2.getByText(label, { exact: true }).first().waitFor({ state: 'visible', timeout: 30_000 });
  // Click p1, wait for its 'searching' state so we know the socket is connected
  // and the queue:join actually landed on the server, THEN click p2 to trigger pair.
  await p1.getByText(label, { exact: true }).first().click();
  await p1.getByText(/searching for an opponent/i).waitFor({ state: 'visible', timeout: 15_000 });
  await p2.getByText(label, { exact: true }).first().click();
  await Promise.all([
    p1.waitForURL('**/play', { timeout: 30_000 }),
    p2.waitForURL('**/play', { timeout: 30_000 }),
  ]);
  await Promise.all([
    p1.locator('[data-square="e1"]').first().waitFor({ state: 'visible', timeout: 15_000 }),
    p2.locator('[data-square="e1"]').first().waitFor({ state: 'visible', timeout: 15_000 }),
  ]);
}

test.describe('match flow', () => {
  test('two players queue 5+3, white resigns, both see BLACK_WON', async ({ browser }) => {
    const a = uniqueUser('mp_a');
    const b = uniqueUser('mp_b');

    const ctxA: BrowserContext = await browser.newContext();
    const ctxB: BrowserContext = await browser.newContext();
    const pageA = await ctxA.newPage();
    const pageB = await ctxB.newPage();

    await signup(pageA, a);
    await signup(pageB, b);

    await queueBoth(pageA, pageB, '5+3');

    // Read myColor from the MatchView root — exposed via data-test-mycolor for e2e tests.
    const mycolorEl = pageA.locator('[data-test-mycolor]').first();
    await mycolorEl.waitFor({ state: 'attached', timeout: 15_000 });
    const aColor = await mycolorEl.getAttribute('data-test-mycolor');
    const aIsWhite = aColor === 'w';
    const whitePage = aIsWhite ? pageA : pageB;
    const blackPage = aIsWhite ? pageB : pageA;

    // Play 1.e4 e5 2.Nf3
    await tryMove(whitePage, 'e2', 'e4');
    await blackPage.waitForTimeout(800);
    await tryMove(blackPage, 'e7', 'e5');
    await whitePage.waitForTimeout(800);
    await tryMove(whitePage, 'g1', 'f3');
    await whitePage.waitForTimeout(800);

    whitePage.once('dialog', (d) => d.accept());
    await whitePage.getByRole('button', { name: /resign/i }).click();

    await expect(whitePage.getByText(/black wins/i)).toBeVisible({ timeout: 15_000 });
    await expect(blackPage.getByText(/black wins/i)).toBeVisible({ timeout: 15_000 });

    await ctxA.close();
    await ctxB.close();
  });
});

import { expect, test } from "@playwright/test";

/**
 * Smoke test 2 (§15): paste 5 alerts on /import, assert 5 rows resolve.
 *
 * "Resolve" means reach a terminal state. With ANTHROPIC_API_KEY set they
 * resolve to PARSED or SKIPPED; without one they resolve to FAILED with a
 * sentence explaining why. Either way this exercises the whole pipeline —
 * batch creation, per-row tracking, the 202, the polling loop, and the
 * terminal state — without pretending a model ran.
 */

const ALERTS = [
  "Your Card ending 4417 was used for AED 245.50 at CARREF 4471 DUBAI AE on 12/07/2026 14:32. Avl Bal AED 8,412.10",
  "Purchase of AED 62.00 at TALABAT.COM on 14-07-2026. Ref 88213A",
  "AED 18.00 spent at CAREEM NETWORKS FZ LLC",
  "Salary credit of AED 18,000.00 has been credited to your account XXXX2201",
  "123456 is your One Time Password. Do not share it with anyone.",
];

const TERMINAL = /^(PARSED|SKIPPED|FAILED)$/;

test("five pasted alerts produce five rows that all resolve", async ({ page }) => {
  await page.goto("/import");

  await page.getByLabel("Bank alerts").fill(ALERTS.join("\n"));
  await page.getByRole("button", { name: "Parse" }).click();

  // The progress readout is a count, not a bar (§11.6).
  await expect(page.getByText(`0 / ${ALERTS.length}`)).toBeVisible();

  const rows = page.locator(".ledger-block");
  await expect(rows).toHaveCount(ALERTS.length);

  // Every row reaches a terminal state.
  await expect
    .poll(
      async () => {
        const labels = await page.locator(".ledger-row__label").allInnerTexts();
        return labels.filter((label) => TERMINAL.test(label.trim())).length;
      },
      { timeout: 40_000 },
    )
    .toBe(ALERTS.length);

  await expect(page.getByText(`${ALERTS.length} / ${ALERTS.length}`)).toBeVisible();
  await expect(page.getByRole("button", { name: "Import more" })).toBeVisible();
});

test("import states the scope of its access", async ({ page }) => {
  await page.goto("/import");
  await expect(page.getByText(/no access to your bank/i)).toBeVisible();
});

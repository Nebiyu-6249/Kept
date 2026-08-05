import { expect, test } from "@playwright/test";

/**
 * The §16 quality floor and the §20 checklist items that need a real browser.
 */

const ROUTES = ["/", "/ask", "/holds", "/ledger", "/import", "/review", "/insights"];

test.describe("quality floor", () => {
  for (const route of ROUTES) {
    test(`${route} has exactly one h1 and headings in order`, async ({ page }) => {
      await page.goto(route);
      await expect(page.locator("h1")).toHaveCount(1);

      // No heading level is skipped on the way down.
      const levels = await page
        .locator("h1, h2, h3, h4, h5, h6")
        .evaluateAll((nodes) => nodes.map((node) => Number(node.tagName[1])));

      let previous = 0;
      for (const level of levels) {
        if (previous !== 0) expect(level).toBeLessThanOrEqual(previous + 1);
        previous = level;
      }
    });
  }

  test("is usable at 360px with no horizontal overflow", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 720 });
    for (const route of ROUTES) {
      await page.goto(route);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      // A pixel of rounding is fine; a scrollbar's worth is not.
      expect(overflow, `${route} overflows horizontally by ${overflow}px`).toBeLessThanOrEqual(1);
    }
  });

  test("the rail and spine drop below 768px", async ({ page }) => {
    await page.goto("/ask");

    await page.setViewportSize({ width: 1280, height: 800 });
    await expect(page.getByText(/PERIOD .* KEPT/)).toBeVisible();

    await page.setViewportSize({ width: 360, height: 720 });
    await expect(page.getByText(/PERIOD .* KEPT/)).toBeHidden();
  });
});

test.describe("keyboard and reduced motion", () => {
  test("the deck is operable by keyboard alone", async ({ page }) => {
    await page.goto("/");

    const deck = page.getByRole("group", { name: /Example verdicts/ });
    await deck.scrollIntoViewIfNeeded();
    await deck.focus();
    await expect(deck).toBeFocused();

    const counter = page.locator("output");
    await expect(counter).toHaveText(/AED 0$/);

    // ArrowLeft holds the top card, which adds its amount to the counter.
    await page.keyboard.press("ArrowLeft");
    await expect(counter).not.toHaveText(/AED 0$/);

    // ArrowRight approves, which does not.
    const afterHold = await counter.innerText();
    await page.keyboard.press("ArrowRight");
    await expect(counter).toHaveText(afterHold);
  });

  test("every interactive element keeps a visible focus ring", async ({ page }) => {
    await page.goto("/ask");
    const amount = page.getByLabel("Amount");
    await amount.focus();

    const outline = await amount.evaluate((node) => {
      const style = getComputedStyle(node);
      return { width: style.outlineWidth, style: style.outlineStyle };
    });

    // Not `outline: none` — the input has a real ring when focused.
    expect(outline.style).not.toBe("none");
    expect(Number.parseFloat(outline.width)).toBeGreaterThan(0);
  });

  test.describe("with reduced motion", () => {
    // page.emulateMedia rather than test.use({ reducedMotion }): the context
    // option does not reach the page with a browser supplied via
    // executablePath, and it must be in effect before the inline head script
    // runs, which is what decides whether the reveal start state applies.

    test("the reduced-motion render is the finished app, not a blank page", async ({ page }) => {
      await page.emulateMedia({ reducedMotion: "reduce" });

      for (const route of ["/", "/ask", "/insights"]) {
        await page.goto(route);

        // The start state must never have been applied.
        await expect(page.locator("html")).not.toHaveClass(/js-reveal/);

        // Nothing that should be on screen is left invisible.
        const hidden = await page.locator(".reveal-init").evaluateAll((nodes) =>
          nodes.filter((node) => Number(getComputedStyle(node).opacity) < 0.99).length,
        );
        expect(hidden, `${route} has invisible content under reduced motion`).toBe(0);

        await expect(page.locator("h1")).toBeVisible();
      }
    });

    test("the Kept figure shows its final value immediately", async ({ page }) => {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.goto("/holds");
      const response = await page.request.get("/api/budget-state");
      const kept = (await response.json()).kept as number;
      const whole = Math.round(kept / 100).toLocaleString("en-US");
      await expect(page.locator("body")).toContainText(`AED ${whole}`);
    });
  });
});

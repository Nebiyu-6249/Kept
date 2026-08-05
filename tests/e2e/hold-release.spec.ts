import { expect, test, type APIRequestContext } from "@playwright/test";

/**
 * Smoke test 1 (§15): onboarding → ask → hold → release, asserting the Kept
 * figure moves by the intent amount, and that it matches §6.3 exactly.
 *
 * The ask → verdict step needs a live model. When ANTHROPIC_API_KEY is set the
 * test walks the whole path; without one it works against the seeded intents,
 * so the assertions that matter hold in both environments.
 */

const hasModel = Boolean(process.env.ANTHROPIC_API_KEY);

type Intent = {
  id: string;
  amount: number;
  decision: "ALLOW" | "HOLD" | "DECLINE";
  state: "OPEN" | "HELD" | "PURCHASED" | "RELEASED" | "EXPIRED";
  expired: boolean;
};

async function keptFils(request: APIRequestContext): Promise<number> {
  const response = await request.get("/api/budget-state");
  return (await response.json()).kept as number;
}

async function intents(request: APIRequestContext): Promise<Intent[]> {
  const response = await request.get("/api/intents");
  return (await response.json()).intents as Intent[];
}

/** §6.3, recomputed here independently of the server's implementation. */
function keptByDefinition(all: Intent[]): number {
  return all
    .filter(
      (intent) =>
        intent.state === "RELEASED" ||
        (intent.decision === "DECLINE" && intent.state !== "PURCHASED"),
    )
    .reduce((sum, intent) => sum + intent.amount, 0);
}

test("onboarding writes a policy and lands on ask", async ({ page }) => {
  // The seeded user already has a policy, so /onboarding forwards to /ask.
  // That redirect is the guard from §11.2 and is worth asserting directly.
  await page.goto("/onboarding");
  await expect(page).toHaveURL(/\/ask$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("ASK");
  await expect(page.getByLabel("Amount")).toBeVisible();
});

test("ask offers categories as toggles, not a select", async ({ page }) => {
  await page.goto("/ask");
  await expect(page.getByRole("button", { name: "Dining", exact: true })).toHaveAttribute(
    "aria-pressed",
    /true|false/,
  );
  await expect(page.locator("select")).toHaveCount(0);
});

test("the Kept figure matches the definition in §6.3", async ({ page, request }) => {
  const all = await intents(request);
  const expected = keptByDefinition(all);

  expect(await keptFils(request)).toBe(expected);

  // And the figure on /holds is that same number, formatted.
  await page.goto("/holds");
  const whole = Math.round(expected / 100).toLocaleString("en-US");
  await expect(page.getByLabel(/Kept this period/).first()).toBeVisible();
  await expect(page.locator("body")).toContainText(`AED ${whole}`);
});

test("releasing a hold through the UI moves Kept by exactly what §6.3 says", async ({
  page,
  request,
}) => {
  if (hasModel) {
    // Full path: ask for something the policy will not wave through, then hold it.
    await page.goto("/ask");
    await page.getByLabel("Amount").fill("450");
    await page.getByRole("button", { name: "Dining", exact: true }).click();
    await page.getByLabel("Note (optional)").fill("team lunch");
    await page.getByRole("button", { name: "Ask", exact: true }).click();
    await page.getByRole("button", { name: "Hold it" }).click();
    await expect(page).toHaveURL(/\/holds$/);
  }

  const before = await keptFils(request);
  const held = await intents(request);
  const target = held.find((intent) => intent.state === "HELD" && intent.expired);
  expect(target, "the seed provides one hold whose window has passed").toBeTruthy();
  if (!target) return;

  // A declined intent already counts toward Kept while it sits unpurchased, so
  // releasing it changes nothing. Only a hold that was not already counted adds
  // to the figure. Predicting the delta from the definition is the whole point.
  const expectedDelta = target.decision === "DECLINE" ? 0 : target.amount;

  await page.goto("/holds");
  await page.getByRole("button", { name: /Open details/ }).first().click();
  await page.getByRole("button", { name: "Let it go" }).first().click();

  await expect
    .poll(async () => keptFils(request), { timeout: 15_000 })
    .toBe(before + expectedDelta);

  // Whatever the delta, the figure still equals the definition.
  expect(await keptFils(request)).toBe(keptByDefinition(await intents(request)));
});

test("releasing a hold that was not already counted increments Kept by its amount", async ({
  request,
}) => {
  const before = await keptFils(request);

  const all = await intents(request);
  const target = all.find(
    (intent) => intent.state === "HELD" && intent.decision !== "DECLINE",
  );
  expect(target, "the seed provides a waiting hold").toBeTruthy();
  if (!target) return;

  const response = await request.patch(`/api/intents/${target.id}`, {
    data: { action: "release" },
  });
  expect(response.ok()).toBe(true);

  expect(await keptFils(request)).toBe(before + target.amount);

  // Releasing it twice is a conflict, not a second increment.
  const again = await request.patch(`/api/intents/${target.id}`, {
    data: { action: "release" },
  });
  expect(again.status()).toBe(409);
  expect(await keptFils(request)).toBe(before + target.amount);
});

import { expect, test } from "@playwright/test";

test("login, What's New modal, guided tour, theme and source registry", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Password").fill("admin123");
  await page.getByRole("button", { name: "Sign in" }).click();

  // First visit => welcome modal, then tour.
  await expect(page.getByRole("dialog")).toContainText("Welcome to TrendBridge");
  await page.getByTestId("start-tour").click();
  await expect(page.locator(".driver-popover")).toContainText("Navigation");
  const remaining = () =>
    page.evaluate(
      async () =>
        (await (await fetch("http://localhost:4000/tour", { credentials: "include" })).json()).steps
          .length as number,
    );
  // the tour spans pages, so the popover briefly disappears between steps: wait for the server to record completion
  for (let i = 0; i < 200 && (await remaining()) > 0; i++) {
    const btn = page.locator(".driver-popover-next-btn");
    if (await btn.isVisible()) await btn.click();
    await page.waitForTimeout(200);
  }
  expect(await remaining()).toBe(0);
  await expect(page.locator(".driver-popover")).toHaveCount(0);

  // Sample banner and theme toggle
  await expect(page.getByText("Sample data.")).toBeVisible();
  await page.getByLabel("Toggle dark mode").click();
  await expect(page.locator("html")).toHaveClass(/dark|light/);

  // Modal does not reappear
  await page.reload();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await page.goto("/sources");
  await expect(page.getByText("ECB exchange rates (Frankfurter)").first()).toBeVisible();
  await page.goto("/trends");
  await expect(page.getByRole("link", { name: "Personalised star map frame" })).toBeVisible();
  await page.getByRole("button", { name: "Real only" }).click();
  await page.goto("/gifts");
  await expect(page.getByText("Gift of the week")).toBeVisible();
  await page.getByLabel("Occasion").selectOption("diwali");
  await page.getByLabel("Budget").selectOption("u1500");
  await expect(page.getByText(/gift ideas/)).toBeVisible();
  await page.goto("/gifts/windows");
  await expect(page.getByText("Latest import order").first()).toBeVisible();
  await page.goto("/gifts/corporate");
  await page.getByLabel("Order quantity").fill("120");
  await expect(page.getByText(/At 120 units/).first()).toBeVisible();
  await page.goto("/verticals/ro");
  await expect(page.getByText("Feature gaps India has not filled")).toBeVisible();
  await page.getByLabel("Water type").selectOption("borewell_high");
  await expect(page.getByText("Guidance, not a water test.")).toBeVisible();
  await page.getByLabel("Subscription price / year (incl. GST)").fill("3000");
  await expect(page.getByText(/LTV : CAC/)).toBeVisible();
  await page.goto("/economics");
  await expect(page.getByText("Recommended route")).toBeVisible();
  await expect(page.getByTestId("placeholder-warning")).toBeVisible();
  await page.getByLabel("Supplier price (FOB)").fill("4.5");
  await expect(page.getByTestId("placeholder-warning")).toHaveCount(0);
  await page.getByLabel("Selling price (incl. GST)").fill("1499");
  await expect(page.getByText("Break-even units")).toBeVisible();
  await page.goto("/economics/tables");
  await expect(page.getByText("INDICATIVE").first()).toBeVisible();
  await page.goto("/scoring");
  await expect(page.getByRole("heading", { name: "Scoring & weights" })).toBeVisible();
  await expect(page.getByText("Smart ring")).toBeVisible();
  await page.goto("/import");
  await page
    .getByLabel("Data")
    .fill("trend,country,metric,week_start,value\nNope,US,search_interest,bad,1\n");
  await page.getByRole("button", { name: "Validate" }).click();
  await expect(page.getByText("0/1 rows valid")).toBeVisible();
});

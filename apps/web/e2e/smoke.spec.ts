import { expect, test } from "@playwright/test";

test("login, What's New modal, guided tour, theme and source registry", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Password").fill("admin123");
  await page.getByRole("button", { name: "Sign in" }).click();

  // First visit => welcome modal, then tour.
  await expect(page.getByRole("dialog")).toContainText("Welcome to TrendBridge");
  await page.getByTestId("start-tour").click();
  await expect(page.locator(".driver-popover")).toContainText("Navigation");
  for (let i = 0; i < 6; i++) {
    const btn = page.locator(".driver-popover-next-btn");
    await expect(btn).toBeVisible();
    await btn.click();
  }
  await expect(page.locator(".driver-popover")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

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
});

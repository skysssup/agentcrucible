import { expect, test } from "@playwright/test";

test("executes the refund experiment, opens its evidence, and exports it", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "The refund went through. The response didn’t." })).toBeVisible();
  await page.getByRole("button", { name: "Run the experiment" }).click();
  await expect(page.locator(".lab-result")).toHaveCount(5);
  await page.screenshot({ path: "test-results/lab-desktop.png" });
  await expect(page.locator(".lab-result").filter({ has: page.getByRole("heading", { name: "naive-retry", exact: true }) })).toContainText("HARMFUL_ACTION");
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download the evidence" }).click();
  expect((await downloaded).suggestedFilename()).toBe("agentcrucible-evidence.md");
  await page.getByRole("link", { name: "Inspect the full trace" }).first().click();
  await expect(page.locator("#view")).toContainText("timeout_after_commit");
  expect(errors).toEqual([]);
});

test("works with denied storage and malformed deep links", async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(window, "localStorage", { get() { throw new DOMException("Blocked", "SecurityError"); } }));
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/#/report/bad%2");
  await expect(page.getByText("This report is not available", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Failure lab", exact: true }).click();
  await expect(page.getByRole("button", { name: "Run the experiment" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("fits a phone viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/#/lab");
  await expect(page.getByRole("button", { name: "Run the experiment" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

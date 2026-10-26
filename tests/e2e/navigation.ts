import { expect, type Page } from "@playwright/test";

export async function openSettingsSection(page: Page, section: string) {
  const categories = page.getByRole("navigation", { name: "Settings categories", exact: true });
  if (!await categories.isVisible()) await page.getByRole("button", { name: "Settings", exact: true }).click();
  await categories.getByRole("button", { name: section, exact: true }).click();
}

export async function openUsageDetails(page: Page) {
  if (!await page.getByRole("region", { name: "Profile dashboard", exact: true }).isVisible()) {
    await page.getByRole("navigation", { name: "Profile resources", exact: true }).getByRole("button", { name: "Dashboard", exact: true }).click();
  }
  await page.getByRole("navigation", { name: "Dashboard pages", exact: true }).getByRole("button", { name: "Usage", exact: true }).click();
  const details = page.getByRole("region", { name: "Profile usage dashboard", exact: true });
  if (!await details.isVisible()) await page.getByText("Detailed accounting and original records", { exact: true }).click();
  await expect(details).toBeVisible();
}

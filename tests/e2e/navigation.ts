import { expect, type Page } from "@playwright/test";

export async function openModelChoices(page: Page) {
  await page.getByRole("dialog", { name: "Model", exact: true }).getByRole("button", { name: "Choose model", exact: true }).click();
  return page.getByRole("menu", { name: "Models", exact: true });
}
export async function chooseThinkingEffort(page: Page, name: string) {
  await page.getByRole("dialog", { name: "Model", exact: true }).getByRole("button", { name: "Thinking effort", exact: true }).click();
  await page.getByRole("menu", { name: "Thinking effort", exact: true }).getByRole("menuitemradio", { name, exact: true }).click();
}
export async function chooseContextWindow(page: Page, name: string) {
  await page.getByRole("dialog", { name: "Model", exact: true }).getByRole("button", { name: "Working context window", exact: true }).click();
  await page.getByRole("menu", { name: "Working context window", exact: true }).getByRole("menuitemradio", { name, exact: true }).click();
}

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

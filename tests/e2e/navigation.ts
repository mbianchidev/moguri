import { expect, type Locator, type Page } from "@playwright/test";
import { kanbanPreferences, type MoguriSdk } from "../../packages/sdk/src/index.ts";
import { SETTINGS_GROUPS } from "../../apps/desktop/src/settings-catalog.ts";

export async function waitForWorkspace(page: Page) {
  await expect(page.getByRole("navigation", { name: "Projects and sessions", exact: true })).toBeVisible();
}
export async function showKanban(sdk: MoguriSdk, projectId: string) {
  const { board } = await sdk.issues.board(projectId);
  await sdk.issues.configure(projectId, { ...board, kanban: { ...kanbanPreferences(board), visible: true } }, board.revision);
}
export async function openSessionSearch(page: Page) {
  const search = page.getByRole("searchbox", { name: "Search sessions", exact: true });
  if (!await search.isVisible()) await page.getByRole("button", { name: "Search sessions", exact: true }).click();
  await expect(search).toBeFocused();
  return search;
}

export async function focusByKeyboard(target: Locator) {
  await target.focus();
  await target.page().keyboard.press("Tab");
  await target.page().keyboard.press("Shift+Tab");
  await expect(target).toBeFocused();
}

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

// Opens a Settings item by its label: a rail entry, or a tab inside a tabbed rail entry such as Integrations (#84).
// Tabs are reached through search, so a test mounts only its target page, never the group's first tab.
export async function openSettingsSection(page: Page, section: string) {
  const categories = page.getByRole("navigation", { name: "Settings categories", exact: true });
  if (!await categories.isVisible()) await page.getByRole("button", { name: "Settings", exact: true }).click();
  const group = SETTINGS_GROUPS.find((value) => "tabbed" in value && value.items.some((item) => item.label === section));
  if (!group) { await categories.getByRole("button", { name: section, exact: true }).click(); return; }
  const search = page.getByLabel("Search settings", { exact: true }), previous = await search.inputValue();
  await search.fill(section);
  await categories.getByRole("region", { name: `${group.label} settings`, exact: true }).getByRole("button", { name: section, exact: true }).click();
  await search.fill(previous);
  await expect(page.getByRole("tablist", { name: group.label, exact: true }).getByRole("tab", { name: section, exact: true })).toHaveAttribute("aria-selected", "true");
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

export async function finishIdleSchedule(page: Page) {
  const choice = page.getByRole("dialog", { name: "Send now or schedule", exact: true });
  await choice.getByRole("button", { name: "No, schedule", exact: true }).click();
  const schedule = page.getByRole("dialog", { name: "Schedule prompt", exact: true });
  await schedule.getByRole("button", { name: "Schedule prompt", exact: true }).click();
  await expect(schedule).toBeHidden();
}

export function projectName(page: Page, name: string): Locator {
  return page.locator(".project-name").filter({ has: page.getByText(name, { exact: true }) });
}
export async function openProjectMenu(page: Page, name: string): Promise<Locator> {
  await projectName(page, name).click({ button: "right" });
  return page.getByRole("menu", { name: `Project actions for ${name}`, exact: true });
}
export async function openGroupMenu(page: Page, name: string): Promise<Locator> {
  await page.locator(".project-folder > summary").filter({ has: page.getByText(name, { exact: true }) }).click({ button: "right" });
  return page.getByRole("menu", { name: `Project group actions for ${name}`, exact: true });
}

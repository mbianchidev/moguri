import { _electron as electron, expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { MoguriSdk } from "../../packages/sdk/src/index.ts";
import { setupFixture } from "../fixture.ts";
import { generatedDocx, generatedPdf, generatedXlsx } from "../fixtures/documents.ts";

const require = createRequire(import.meta.url);
test.skip(process.platform !== "darwin", "Desktop attachment workflows are qualified on macOS.");
test("native document selection, format chips and bounded previews work for PDF, Word and Excel without model calls", async () => {
  const fixture = await setupFixture();
  const app = await electron.launch({ executablePath: require("electron"), args: ["."], env: { ...process.env, MOGURI_STATE_DIR: join(fixture.directory, "state"), MOGURI_TEST_WINDOW: "hidden" } });
  try {
    const page = await app.firstWindow(), errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message));
    const prompt = page.getByLabel("Prompt", { exact: true }); await prompt.fill("Generated complete unsent document task.");
    for (const [format, bytes] of [["pdf", generatedPdf({ imagePage: true })], ["docx", generatedDocx()], ["xlsx", generatedXlsx()]] as const) {
      const name = `generated-ui.${format}`, path = join(fixture.directory, name); await writeFile(path, bytes);
      await app.evaluate(({ dialog }, path) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] }); }, path);
      await page.getByRole("button", { name: "Attach", exact: true }).click();
      await page.getByRole("dialog", { name: "Attach", exact: true }).getByRole("button", { name: /^Local file/ }).click();
      const chip = page.getByRole("button", { name: `Preview document ${name}`, exact: true });
      await expect(chip).toContainText(format.toUpperCase()); await chip.click();
      const preview = page.getByRole("dialog", { name: `Document preview ${name}`, exact: true });
      await expect(preview).toContainText("No model call", { ignoreCase: true });
      if (format === "pdf") {
        await expect(preview).toContainText("scanned/image-only");
        await expect(preview.getByLabel("Document extracted content")).toContainText("Generated PDF page 1");
        await preview.getByLabel("Document page", { exact: true }).fill("2"); await preview.getByRole("button", { name: "Read selection", exact: true }).click();
        await expect(preview.getByLabel("Document extracted content")).toContainText('"text":""');
      } else if (format === "docx") {
        await preview.getByLabel("Document section", { exact: true }).fill("2"); await preview.getByRole("button", { name: "Read selection", exact: true }).click();
        await expect(preview.getByLabel("Document extracted content")).toContainText("GENERATED_DOCUMENT_SECRET");
        await preview.getByLabel("Search document text").fill("table cell B"); await preview.getByRole("button", { name: "Search document", exact: true }).click();
        await expect(preview.getByLabel("Document search results")).toContainText('"column": 2');
      } else {
        await preview.getByLabel("Document range", { exact: true }).fill("B1:D1"); await preview.getByRole("button", { name: "Read selection", exact: true }).click();
        await expect(preview.getByLabel("Document extracted content")).toContainText('"formula":"1+2"');
        await expect(preview.getByLabel("Document extracted content")).toContainText('"cachedValue":null');
        await preview.getByLabel("Document sheet", { exact: true }).selectOption("Generated hidden");
        await preview.getByLabel("Document range", { exact: true }).fill("A1:A2"); await preview.getByRole("button", { name: "Read selection", exact: true }).click();
        await expect(preview.getByLabel("Document extracted content")).toContainText('"si":"7"');
      }
      await preview.getByRole("button", { name: "Close preview", exact: true }).click();
      await expect(prompt).toHaveValue("Generated complete unsent document task.");
    }
    await prompt.press("Meta+Enter");
    await expect.poll(() => fixture.session().queue[0]?.attachments.filter((attachment) => attachment.kind === "document").length).toBe(3);
    expect(fixture.session().queue[0]?.held).toBe(true); expect(fixture.requests).toHaveLength(0); expect(errors).toEqual([]);
  } finally { await app.close(); await fixture.close(); }
});

test("malformed document errors preserve the whole composer and an earlier attachment", async () => {
  const fixture = await setupFixture(), sdk = await new MoguriSdk(fixture.service.connection).ready();
  const valid = join(fixture.directory, "generated.docx"); await writeFile(valid, generatedDocx()); await sdk.attachments.document(fixture.sessionId, valid);
  const invalid = join(fixture.directory, "generated-malformed.pdf"); await writeFile(invalid, "Generated not a PDF");
  const app = await electron.launch({ executablePath: require("electron"), args: ["."], env: { ...process.env, MOGURI_STATE_DIR: join(fixture.directory, "state"), MOGURI_TEST_WINDOW: "hidden" } });
  try {
    const page = await app.firstWindow(), prompt = page.getByLabel("Prompt", { exact: true });
    await prompt.fill("Generated preserved prompt.");
    await app.evaluate(({ dialog }, path) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] }); }, invalid);
    await page.getByRole("button", { name: "Attach", exact: true }).click();
    await page.getByRole("dialog", { name: "Attach", exact: true }).getByRole("button", { name: /^Local file/ }).click();
    await expect(page.getByRole("alert").filter({ hasText: "PDF" })).toBeVisible();
    await expect(prompt).toHaveValue("Generated preserved prompt.");
    await expect(page.getByRole("button", { name: "Preview document generated.docx", exact: true })).toBeVisible();
    expect(fixture.session().draft.attachments).toHaveLength(1); expect(fixture.requests).toHaveLength(0);
  } finally { await app.close(); sdk.disconnect(); await fixture.close(); }
});

test("document capture status exposes exact cancellation and keeps the unsent prompt", async () => {
  const fixture = await setupFixture({ platform: { documents: { workerPath: resolve("tests/fixtures/document-hold-worker.mjs") } } });
  const path = join(fixture.directory, "generated-slow.docx"); await writeFile(path, generatedDocx());
  const app = await electron.launch({ executablePath: require("electron"), args: ["."], env: { ...process.env, MOGURI_STATE_DIR: join(fixture.directory, "state"), MOGURI_TEST_WINDOW: "hidden" } });
  try {
    const page = await app.firstWindow(), prompt = page.getByLabel("Prompt", { exact: true });
    await prompt.fill("Generated unsent cancellation prompt.");
    await app.evaluate(({ dialog }, path) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] }); }, path);
    await page.getByRole("button", { name: "Attach", exact: true }).click();
    await page.getByRole("dialog", { name: "Attach", exact: true }).getByRole("button", { name: /^Local file/ }).click();
    await expect(page.getByRole("progressbar", { name: "Local document extraction" })).toBeVisible();
    await page.getByRole("button", { name: "Cancel extraction", exact: true }).click();
    await expect(page.getByRole("alert").filter({ hasText: /cancelled/ })).toBeVisible();
    await expect(prompt).toHaveValue("Generated unsent cancellation prompt.");
    expect(fixture.session().draft.attachments).toHaveLength(0); expect(fixture.requests).toHaveLength(0);
  } finally { await app.close(); await fixture.close(); }
});

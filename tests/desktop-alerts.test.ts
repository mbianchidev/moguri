import assert from "node:assert/strict";
import test from "node:test";
import { readdir, readFile } from "node:fs/promises";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Alert } from "../apps/desktop/src/Alert.tsx";
import { StalePriceNotice } from "../apps/desktop/src/ProviderPricing.tsx";

test("shared alerts always expose a native X and use severity-appropriate live regions", () => {
  const info = renderToStaticMarkup(createElement(Alert, { className: "notice info" }, "Generated card moved."));
  assert.match(info, /role="status"/); assert.match(info, /data-alert-tone="info"/); assert.doesNotMatch(info, /role="alert"/);
  const error = renderToStaticMarkup(createElement(Alert, { as: "p", role: "alert", className: "inline-error" }, "Generated operation failed."));
  assert.match(error, /role="alert"/); assert.match(error, /data-alert-tone="error"/);
  const warning = renderToStaticMarkup(createElement(Alert, { role: "status", tone: "warning", className: "settings-warning" }, "Generated inspection is still required."));
  assert.match(warning, /role="status"/); assert.match(warning, /data-alert-tone="warning"/);
  const explanation = renderToStaticMarkup(createElement(Alert, { tone: "warning" }, "Generated static safety explanation."));
  assert.doesNotMatch(explanation, /role="(?:alert|status)"/);
  for (const html of [info, error, warning]) {
    assert.match(html, /<button[^>]*type="button"[^>]*aria-label="Dismiss alert"/);
    assert.match(html, /app-alert-dismiss/); assert.match(html, /aria-hidden="true"/);
  }
});

test("desktop alert banners cannot bypass the shared dismissible component", async () => {
  for (const name of (await readdir("apps/desktop/src")).filter((name) => name.endsWith(".tsx") && name !== "Alert.tsx")) {
    const source = await readFile(`apps/desktop/src/${name}`, "utf8");
    assert.doesNotMatch(source, /<(?:p|div|span)\b[^>]*\brole=(?:"alert"|\{[^}]*["']alert["'])/s, `${name} must use Alert for live error banners`);
    assert.doesNotMatch(source, /<(?:p|div|span)\b[^>]*\bclassName=["'](?:notice|inline-error|settings-warning)(?:\s|["'])/s, `${name} must use Alert for styled notification messages`);
  }
});

test("stale provider prices show a warning that points to Refresh, and fresh catalogs show none", () => {
  assert.equal(renderToStaticMarkup(createElement(StalePriceNotice, { stale: [], maxAgeDays: 30 })), "");
  const stale = renderToStaticMarkup(createElement(StalePriceNotice, { stale: ["google", "xai"], maxAgeDays: 30 }));
  assert.match(stale, /data-alert-tone="warning"/); assert.match(stale, /role="status"/);
  assert.match(stale, /Google, xAI prices were checked more than 30 days ago, so models priced by them show as unknown\. Select <strong>Refresh<\/strong>/);
  assert.match(renderToStaticMarkup(createElement(StalePriceNotice, { stale: ["openai"], maxAgeDays: 1 })), /more than 1 day ago/);
});

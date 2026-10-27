import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SettingsFieldsProvider, SettingsInput } from "../apps/desktop/src/SettingsFields.tsx";

test("single settings booleans are accessible switches while explicitly multiple choices remain checkboxes", () => {
  const render = (role?: "checkbox") => renderToStaticMarkup(createElement(SettingsFieldsProvider, {
    children: createElement(SettingsInput, { type: "checkbox", checked: true, readOnly: true, "aria-label": "Generated preference", ...(role ? { role } : {}) }),
  }));
  assert.match(render(), /role="switch"/);
  assert.match(render("checkbox"), /role="checkbox"/);
  assert.doesNotMatch(render("checkbox"), /role="switch"/);
});

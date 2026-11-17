import assert from "node:assert/strict";
import test from "node:test";
import { fuzzyMatch, wordMatch } from "../packages/protocol/src/search.ts";
import { searchSettings } from "../apps/desktop/src/settings-catalog.ts";

test("shared fuzzy matching is case-insensitive, ordered and literal on both query and name", () => {
  for (const name of ["cap", "app", "CAP", "App"]) assert.equal(fuzzyMatch("AP", name), true);
  assert.equal(fuzzyMatch("pa", "cap"), false);
  assert.equal(fuzzyMatch("", "Generated chat"), true);
  assert.equal(fuzzyMatch("gh wf", "GitHub workflows"), true);
  assert.equal(fuzzyMatch("[", "Generated chat"), false);
});

test("dropdown word matching needs each query word verbatim, so long path labels do not over-match", () => {
  const label = "génerated-beta (/generated/workspace/generated-beta)";
  assert.equal(wordMatch("", label), true);
  assert.equal(wordMatch("BETA gener", label), true);
  assert.equal(wordMatch("gnrtd", label), false);
  assert.equal(fuzzyMatch("gnrtd", label), true);
  assert.equal(wordMatch("beta alpha", label), false);
});

test("settings search uses the same fuzzy subsequences across titles and keywords", () => {
  assert.ok(searchSettings("GH WF").some((group) => group.items.some((item) => item.id === "github")));
  assert.ok(searchSettings("dctn").some((group) => group.items.some((item) => item.id === "voice")));
  assert.equal(searchSettings("unmatchable-generated-query-🦄").length, 0);
});

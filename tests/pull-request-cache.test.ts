import test from "node:test";
import assert from "node:assert/strict";
import { cachedItems, readCachedPullRequests, saveCachedPullRequests } from "../apps/desktop/src/pull-request-cache.ts";
import type { GithubItem } from "@moguri-dev/sdk";

class GeneratedStorage {
  values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
}
const pull = (number: number): GithubItem => ({ kind: "pull", id: 1000 + number, number, title: `Generated PR ${number}`, body: "Generated body that is not cached.",
  state: "open", url: `https://github.com/generated-owner/generated-repo/pull/${number}`, updatedAt: null, author: "generated-author", headSha: null, conclusion: null, draft: number === 2 });

test("a project's open PR list is cached per profile with only its title, number, URL and state", () => {
  const storage = new GeneratedStorage();
  saveCachedPullRequests(storage, "default", "generated-project", "generated-owner/generated-repo", "generated-account", [pull(1), pull(2)], new Date("2026-01-01T00:00:00Z"));
  const cached = readCachedPullRequests(storage, "default", "generated-project");
  assert.equal(cached?.repository, "generated-owner/generated-repo");
  assert.deepEqual(cached?.items.map((item) => [item.number, item.title, item.draft]), [[1, "Generated PR 1", false], [2, "Generated PR 2", true]]);
  assert.equal(JSON.stringify(cached).includes("Generated body"), false);
  assert.deepEqual(cachedItems(cached!).map((item) => [item.kind, item.number, item.url]), [["pull", 1, pull(1).url], ["pull", 2, pull(2).url]]);
  assert.equal(readCachedPullRequests(storage, "generated-profile", "generated-project"), null);
});

test("an invalid cached PR list is ignored and read again", (t) => {
  const warn = t.mock.method(console, "warn", () => {});
  const storage = new GeneratedStorage();
  storage.values.set("moguri.pulls.v1:default:generated-project", JSON.stringify({ schemaVersion: 2, items: [] }));
  assert.equal(readCachedPullRequests(storage, "default", "generated-project"), null);
  storage.values.set("moguri.pulls.v1:default:generated-project", "not json");
  assert.equal(readCachedPullRequests(storage, "default", "generated-project"), null);
  assert.equal(warn.mock.callCount(), 2);
});

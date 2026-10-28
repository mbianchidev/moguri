import assert from "node:assert/strict";
import test from "node:test";
import { reorderItems } from "../apps/desktop/src/ReorderList.tsx";

test("shared drag ordering moves exact IDs without replacing current values or accepting stale/missing members", () => {
  const rows = [{ id: "first", text: "Generated current first" }, { id: "second", text: "Generated updated second" }, { id: "third", text: "Generated current third" }];
  const result = reorderItems(rows, "third", "first");
  assert.deepEqual(result.map((row) => row.id), ["third", "first", "second"]);
  assert.equal(result[2], rows[1]);
  assert.deepEqual(reorderItems(rows, "first", null).map((row) => row.id), ["second", "third", "first"]);
  assert.throws(() => reorderItems(rows, "missing", null), /missing|changed/i);
  assert.throws(() => reorderItems(rows, "first", "missing"), /missing|changed/i);
  assert.deepEqual(rows.map((row) => row.id), ["first", "second", "third"]);
});

import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { coveringArrayDocument, coveringArrayPath, uncoveredTargets, generateCoveringCells } from "../tests/fixtures/milestone-covering.ts";

const cells = generateCoveringCells();
const missing = uncoveredTargets(cells);
if (missing.length) {
  console.error(`Covering generation left ${missing.length} targets uncovered: ${missing.slice(0, 5).join(", ")}`);
  process.exit(1);
}
await writeFile(coveringArrayPath, `${JSON.stringify(coveringArrayDocument(cells), null, 2)}\n`);
const perEnv = Object.fromEntries(["Local", "Remote", "Sandbox"].map((env) => [env, cells.filter((cell) => cell.env === env).length]));
console.log(JSON.stringify({ output: fileURLToPath(coveringArrayPath), cells: cells.length, perEnv }));

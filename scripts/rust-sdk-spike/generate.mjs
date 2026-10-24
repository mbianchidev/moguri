import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { artifacts, directory, repo, sdkUrl, packageImport } from "./paths.mjs";
const { QuerySchema, CommandSchema, PROTOCOL_VERSION } = await import(sdkUrl);
assert.equal(PROTOCOL_VERSION, 43, "This retained experiment requires protocol 43. Review its fixtures before using another protocol.");
await mkdir(artifacts, { recursive: true });
const { Value } = await packageImport("typebox/value");
const { Code } = await packageImport("typebox/compile");

export function snapshot(count = 0, seq = 0) {
  return { protocolVersion: 43, seq, profileId: "default",
    projects: [{ id: "p", name: "Generated project", path: "/generated/project" }],
    sessions: [{ id: "s", projectId: "p", title: "Generated session",
      draft: { revision: 0, text: "", attachments: [] }, revision: 0,
      messages: Array.from({ length: count }, (_, i) => ({ id: `m${i}`, role: i % 2 ? "assistant" : "user",
        text: `Generated message ${i}: ` + "generated synthetic context ".repeat(12) })) }],
    provider: { status: "connected", models: [], login: null, diagnostic: null },
    policy: { revision: 0, allowedEnvs: ["Local"] }, settings: { revision: 0, values: {} },
  };
}
const common = [
  { type: "session.progress", sessionId: "s" },
  { type: "budget.status", sessionId: "s" },
  { type: "profile.list" },
  { type: "telemetry.storage" },
  { type: "memory.search", projectId: "p", text: "generated", limit: 6 },
  { type: "session.context", sessionId: "s" },
  { type: "attachment.document.read", sessionId: "s", attachmentId: "a", sheet: "Generated", range: "A1:C3", offset: 0, limit: 4096 },
  { type: "role.contract.read", sequenceId: "generated", index: 1 },
];
const flatten = (schema) => schema.anyOf ? schema.anyOf.flatMap(flatten) : [schema];
const queryCandidates = common.flatMap((q) => [q, { ...q, extra: true }, { ...q, type: 4 },
  { ...q, sessionId: -1 }, { ...q, offset: -1 }, { ...q, limit: 0.5 }]);
for (const schema of flatten(QuerySchema)) {
  const type = schema.properties?.type?.const;
  queryCandidates.push({ type }, { type, sessionId: "s" }, { type, sessionId: null }, { type, limit: -1 }, { type, arbitrary: [] });
}
const queries = queryCandidates.filter((q) => JSON.stringify(q).length < 10000);
const frames = [{ type: "ready", snapshot: snapshot(3) }];
for (let seq = 1; seq <= 400; seq++) {
  frames.push({ type: "event", event: { seq, schema_version: 1, profile_id: "default", project_id: "p", session_id: "s",
    event_type: "assistant.delta", payload: { text: `Generated delta ${seq}` } } });
}
const data = { querySchema: QuerySchema, commandSchema: CommandSchema, queries,
  expectedQueries: queries.map((q) => Value.Check(QuerySchema, q)), frames,
  readySmall: { type: "ready", snapshot: snapshot(8) },
  readyLarge: { type: "ready", snapshot: snapshot(1000) },
  readyHuge: { type: "ready", snapshot: snapshot(10000) },
  edges: [
    { name: "query-unpaired-surrogate", queryJson: JSON.stringify({ type: "memory.search", projectId: "p", text: "\ud800", limit: 6 }) },
    { name: "query-astral-unicode", queryJson: JSON.stringify({ type: "memory.search", projectId: "p", text: "\u{1f34a}\u754c", limit: 6 }) },
    { name: "query-escaped-controls", queryJson: JSON.stringify({ type: "memory.search", projectId: "p", text: "\u0000\n", limit: 6 }) },
  ],
};
const generated = Code(QuerySchema);
if (!generated.External.variables.every((value) => value instanceof RegExp)) throw new Error("Unaccounted AOT external.");
const variables = generated.External.variables.map((value) => `new RegExp(${JSON.stringify(value.source)},${JSON.stringify(value.flags)})`).join(",");
await writeFile(join(directory, "query-aot.raw.mjs"), generated.Code + `\nSetExternal({variables:[${variables}]});\n`);
const { build } = await packageImport("esbuild");
await build({
  entryPoints: [join(directory, "query-aot.raw.mjs")], outfile: join(directory, "query-aot.mjs"),
  bundle: true, platform: "browser", format: "esm", target: "es2024",
  plugins: [{ name: "installed-typebox", setup(build) {
    build.onResolve({ filter: /^typebox\// }, async (args) => {
      if (args.pluginData?.resolving) return;
      const result = await build.resolve(args.path, { resolveDir: repo, kind: args.kind, pluginData: { resolving: true } });
      return { path: result.path, errors: result.errors, warnings: result.warnings };
    });
  } }],
});
await writeFile(join(directory, "dataset.json"), JSON.stringify(data));
await writeFile(join(directory, "query-schema.json"), JSON.stringify(QuerySchema));
await writeFile(join(directory, "command-schema.json"), JSON.stringify(CommandSchema));
console.log(JSON.stringify({ queries: queries.length, validQueries: data.expectedQueries.filter(Boolean).length,
  frames: frames.length, smallSnapshotBytes: JSON.stringify(data.readySmall).length,
  largeSnapshotBytes: JSON.stringify(data.readyLarge).length, hugeSnapshotBytes: JSON.stringify(data.readyHuge).length,
  aotSourceBytes: generated.Code.length, aotRegexConstants: generated.External.variables.length }));

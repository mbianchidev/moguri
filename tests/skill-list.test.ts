import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MoguriSdk, skillListGroups, sourceSkillState, type CapabilityEntry, type GatewaySkill, type SkillSource, type Snapshot } from "../packages/sdk/src/index.ts";
import { SkillList } from "../apps/desktop/src/SkillList.tsx";
import { startService } from "../apps/service/src/server.ts";
import { setupFixture } from "./fixture.ts";
import { generatedZip } from "./fixtures/documents.ts";

const skill = (name: string, body: string) => `---\nname: ${name}\ndescription: Generated ${name} skill\n---\n${body}\n`;
const hash = (letter: string) => letter.repeat(64);
const market: SkillSource = { id: "generated-market", name: "Generated Provider", kind: "remote", url: "https://generated.invalid/market.zip", enabled: true };
const personal: SkillSource = { id: "generated-personal", name: "Generated mine", kind: "remote", url: "https://github.com/generated/generated-skills", personal: true, enabled: true };

test("skills are grouped by personal repository, marketplace provider, folder, plugin and project, with each source's default", () => {
  const folder: SkillSource = { id: "generated-folder", name: "Global agent skills", kind: "local", path: "/generated/skills", enabled: true };
  const off: SkillSource = { id: "generated-off", name: "Generated off", kind: "local", path: "/generated/off", enabled: false };
  const sourceSkill = (source: SkillSource, name: string, extra: Partial<GatewaySkill> = {}): GatewaySkill => ({ id: `${source.id}-${name}`, name, description: name,
    digest: hash("a"), bytes: 1, sourceId: source.id, sourceName: source.name, path: `${name}/SKILL.md`, ...extra });
  const entry = (id: string, projectId: string | null, extra: Partial<CapabilityEntry> = {}): CapabilityEntry => ({ id, projectId, kind: "skill", name: id, description: id,
    contentDigest: hash("c"), enabled: false, revision: 0, source: "user", createdAt: "2026-11-20T00:00:00.000Z", ...extra });
  const groups = skillListGroups({
    projects: [{ id: "generated-project", name: "moguri" }],
    sources: [market, personal, folder, off],
    switches: [{ sourceId: market.id, path: "trusted/SKILL.md", enabled: true, trust: { digest: hash("a"), packageDigest: hash("b"), actor: "user", commandId: "generated-command", at: "2026-11-20T00:00:00.000Z" } },
      { sourceId: market.id, path: "moved/SKILL.md", enabled: true, trust: { digest: hash("a"), packageDigest: hash("d"), actor: "user", commandId: "generated-command", at: "2026-11-20T00:00:00.000Z" } },
      { sourceId: folder.id, path: "quiet/SKILL.md", enabled: false }],
    sourceSkills: [sourceSkill(market, "untrusted", { packageDigest: hash("b") }), sourceSkill(market, "trusted", { packageDigest: hash("b") }),
      sourceSkill(market, "moved", { packageDigest: hash("b") }), sourceSkill(personal, "mine", { packageDigest: hash("b") }), sourceSkill(folder, "loud"), sourceSkill(folder, "quiet"),
      sourceSkill(off, "hidden")],
    registry: [entry("generated-all", null, { enabled: true }), entry("generated-local", "generated-project"),
      { ...entry("generated-bundle", "generated-project", { kind: "plugin", enabled: true }), name: "generated-bundle@1.0.0" },
      entry("generated-bundled", "generated-project", { ownerPluginId: "generated-bundle", enabled: true }),
      entry("generated-copy", null, { installedFrom: { sourceId: market.id, sourceName: market.name, path: "untrusted/SKILL.md", kind: "marketplace" } })],
  });
  assert.deepEqual(groups.map((group) => [group.label, group.kind, group.defaults]), [
    ["Personal - generated-skills", "repository", "on"], ["Generated Provider", "marketplace", "trust"], ["Global agent skills", "folder", "on"],
    ["Plugin - generated-bundle@1.0.0", "plugin", null], ["All projects", "project", null], ["Project - moguri", "project", null],
  ]);
  const states = Object.fromEntries(groups.flatMap((group) => group.skills.map((item) => [item.name, item.state])));
  assert.deepEqual(states, { mine: "on", untrusted: "untrusted", trusted: "on", moved: "changed", "generated-copy": "off", loud: "on", quiet: "off",
    "generated-bundled": "on", "generated-all": "on", "generated-local": "off" });
  assert.equal(groups[1]!.skills.find((item) => item.name === "generated-copy")?.registry?.scope, "All projects");
  assert.equal(sourceSkillState(market, [], { path: "x/SKILL.md", digest: hash("a") }), "untrusted");
  assert.equal(sourceSkillState(folder, [], { path: "x/SKILL.md", digest: hash("a") }), "on");
});

test("the shared list starts collapsed in Settings and expanded on the Capabilities page", () => {
  const snapshot = { registry: [{ id: "generated-all", projectId: null, kind: "skill", name: "generated-all", description: "Generated", contentDigest: hash("c"),
    enabled: true, revision: 0, source: "user", createdAt: "2026-11-20T00:00:00.000Z" }], projects: [],
    settings: { revision: 0, values: { skillSources: [market], skillSwitches: [] } } } as unknown as Snapshot;
  const sdk = { profileId: "default" } as unknown as MoguriSdk;
  const collapsed = renderToStaticMarkup(createElement(SkillList, { sdk, snapshot, defaultExpanded: false }));
  assert.deepEqual([...collapsed.matchAll(/aria-expanded="(true|false)"/g)].map((match) => match[1]), ["false", "false"]);
  assert.doesNotMatch(collapsed, /Enable skill/);
  assert.match(collapsed, /Generated Provider<\/span> <span class="skill-group-count">Not read yet/);
  const expanded = renderToStaticMarkup(createElement(SkillList, { sdk, snapshot, defaultExpanded: true }));
  assert.deepEqual([...expanded.matchAll(/class="skill-group-toggle" aria-expanded="(true|false)"/g)].map((match) => match[1]), ["true", "true"]);
  assert.match(expanded, /role="switch" aria-label="Enable skill generated-all" checked=""/);
  assert.match(expanded, /Marketplace skills stay off until you trust each one/);
});

test("marketplace skills stay off until the actual user trusts them; the service enforces switches and trust for chats", async () => {
  let marketArchive = generatedZip([{ name: "generated/review/SKILL.md", text: skill("generated-market-review", "Generated marketplace instructions.") },
    { name: "generated/review/notes.md", text: "Generated note.\n" }]);
  const personalArchive = generatedZip([{ name: "generated-skills-main/mine/SKILL.md", text: skill("generated-mine", "Generated personal instructions.") }]);
  const fetch = async (url: string | URL | Request) => new Response(Uint8Array.from(String(url).includes("codeload.github.com") ? personalArchive : marketArchive));
  const fixture = await setupFixture({ platform: { skillGateway: { fetch } } });
  let sdk = await new MoguriSdk(fixture.service.connection).ready(), service: Awaited<ReturnType<typeof startService>> | undefined;
  try {
    const folder = join(fixture.directory, "generated-folder");
    await mkdir(join(folder, "local"), { recursive: true });
    await writeFile(join(folder, "local", "SKILL.md"), skill("generated-local", "Generated folder instructions."));
    const local: SkillSource = { id: "generated-folder", name: "Generated folder", kind: "local", path: folder, enabled: true };
    const settings = sdk.settings.get()!;
    await sdk.settings.update({ ...settings.values, skillSources: [market, personal, local] }, settings.revision);

    const listed = await sdk.skills.list();
    assert.deepEqual(listed.failures, []);
    const item = (name: string) => listed.groups.flatMap((group) => group.skills).find((value) => value.name === name)!;
    assert.deepEqual(listed.groups.map((group) => group.label), ["Personal - generated-skills", "Generated Provider", "Generated folder"]);
    assert.deepEqual(["generated-mine", "generated-market-review", "generated-local"].map((name) => item(name).state), ["on", "untrusted", "on"]);
    const text = await sdk.slash(fixture.sessionId, "/skills list", "cli");
    assert.match(text.kind === "text" ? text.text : "", /Generated Provider \(marketplace: trust each skill\)\n  \[untrusted\] generated-market-review[^\n]*\n {6}\/skills trust generated-market generated\/review\/SKILL\.md [a-f0-9]{64} [a-f0-9]{64}/);
    const offered = async () => (await sdk.skills.find("", { sessionId: fixture.sessionId })).skills.map((value) => value.name).sort();
    assert.deepEqual(await offered(), ["generated-local", "generated-mine"]);
    const marketSkill = item("generated-market-review"), source = marketSkill.source!;
    const delegate = (id: string, args: Record<string, unknown>) => fixture.service.controller.platform.delegate(fixture.session(), { id, name: "use_skill", arguments: args }, new AbortController().signal);
    const modelFound = JSON.parse((await delegate("generated-find", { action: "find", query: "" })).text) as { skills: GatewaySkill[] };
    assert.deepEqual(modelFound.skills.map((value) => value.name).sort(), ["generated-local", "generated-mine"]);
    await assert.rejects(() => delegate("generated-untrusted-load", { action: "load", id: source.skillId, expectedDigest: marketSkill.digest }), /isn't trusted/);
    await assert.rejects(() => sdk.skills.use(fixture.sessionId, source.skillId, marketSkill.digest, fixture.session().draft.revision), /isn't trusted/);
    await assert.rejects(() => sdk.skills.setEnabled(market.id, source.path, true), { code: "skill_trust_required" });
    const forged = sdk.settings.get()!;
    await assert.rejects(() => sdk.settings.update({ ...forged.values, skillSwitches: [{ sourceId: market.id, path: source.path, enabled: true,
      trust: { digest: marketSkill.digest, packageDigest: source.packageDigest!, actor: "user", commandId: "generated-forged", at: new Date().toISOString() } }] }, forged.revision), { code: "skill_trust_review" });

    await sdk.skills.trust(market.id, source.path, marketSkill.digest, source.packageDigest!);
    const trust = sdk.settings.get()!.values.skillSwitches!.find((entry) => entry.sourceId === market.id)!;
    assert.deepEqual([trust.enabled, trust.trust?.actor, trust.trust?.digest, trust.trust?.packageDigest], [true, "user", marketSkill.digest, source.packageDigest]);
    assert.ok(trust.trust?.commandId);
    assert.deepEqual(await offered(), ["generated-local", "generated-market-review", "generated-mine"]);
    const loaded = JSON.parse((await delegate("generated-trusted-load", { action: "load", id: source.skillId, expectedDigest: marketSkill.digest })).text) as { body: string };
    assert.match(loaded.body, /Generated marketplace instructions/);
    assert.equal(fixture.service.controller.snapshot().skillAdmissions.at(-1)?.basis, "trusted-source");

    const localSkill = item("generated-local");
    // Concurrent switches on different skills both persist: each sets one value on the current settings.
    const mine = item("generated-mine").source!;
    const [slashOff] = await Promise.all([sdk.slash(fixture.sessionId, `/skills off ${local.id} ${localSkill.source!.path}`, "cli"), sdk.skills.setEnabled(personal.id, mine.path, false)]);
    assert.equal(slashOff.kind, "ok");
    assert.deepEqual(await offered(), ["generated-market-review"]);
    await sdk.skills.setEnabled(personal.id, mine.path, true);
    assert.deepEqual(await offered(), ["generated-market-review", "generated-mine"]);
    await assert.rejects(() => sdk.skills.use(fixture.sessionId, localSkill.source!.skillId, localSkill.digest, fixture.session().draft.revision), /turned off/);

    marketArchive = generatedZip([{ name: "generated/review/SKILL.md", text: skill("generated-market-review", "Generated marketplace instructions.") },
      { name: "generated/review/notes.md", text: "Generated changed note.\n" }]);
    assert.equal((await sdk.skills.list()).groups.flatMap((group) => group.skills).find((value) => value.name === "generated-market-review")?.state, "changed");
    assert.deepEqual(await offered(), ["generated-mine"]);
    await assert.rejects(() => delegate("generated-changed-load", { action: "load", id: source.skillId, expectedDigest: marketSkill.digest }), /isn't trusted/);

    const options = { stateDir: join(fixture.directory, "state"), provider: fixture.provider, retentionKey: fixture.retentionKey,
      platform: { skillGateway: { fetch }, terminal: { defaultRoot: fixture.home, vault: fixture.terminalVault } } };
    sdk.disconnect(); await fixture.service.close();
    service = await startService(options); sdk = await new MoguriSdk(service.connection).ready();
    const restarted = (await sdk.skills.list()).groups.flatMap((group) => group.skills);
    assert.deepEqual(["generated-mine", "generated-market-review", "generated-local"].map((name) => restarted.find((value) => value.name === name)?.state), ["on", "changed", "off"]);
    assert.equal(fixture.requests.length, 0);
  } finally { sdk.disconnect(); await service?.close(); await fixture.close(); }
});

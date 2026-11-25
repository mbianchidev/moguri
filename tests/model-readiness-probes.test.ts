import { ciTime } from "./fixtures/time-scale.ts";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import os from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { build } from "esbuild";
import { API as TypeScriptAPI } from "typescript/unstable/async";
import { Value } from "typebox/value";
import {
  ModelReadinessReportSchema, isModelReadinessReportCurrent,
  type LocalRuntimeConfiguration, type LocalRuntimeExecutableReview, type ModelReadinessTarget,
  type ModelRequirements,
} from "@moguri-dev/sdk/testing";
import {
  collectModelReadiness, modelReadinessConfigurationDigest,
  createNodeReadinessFileSystem,
  createExecutingNodeReadinessProbeSuite,
  ReadinessProbeFailure,
  type ReadinessFileInspection, type ReadinessFileSystem, type ReadinessHostFacts,
  type ReadinessProbeRequest, type ReadinessProbeSuite,
  type ReadinessExecutingBoundary,
} from "@moguri-dev/sdk/testing";
import { ModelReadinessPanel } from "../apps/desktop/src/ModelReadinessPanel.tsx";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const GiB = 1024 ** 3, now = Date.parse("2026-11-05T18:00:00.000Z");
const target: ModelReadinessTarget = {
  profileId: "generated-profile", sessionId: "generated-session", modelId: "generated-model", env: "Local",
  rootDigest: hash("generated-root"), peerDigest: null, buildDigest: hash("generated-build"),
  endpointBindingDigest: hash("generated-endpoint"), modelBindingDigest: hash("generated-model-binding"),
};
const configuration: LocalRuntimeConfiguration = {
  kind: "llama-cpp", executablePath: "/generated/llama-cli", modelPath: "/generated/model.gguf",
};
const requirements: ModelRequirements = {
  provenance: { kind: "user-supplied-model-requirements", actor: "user", sourceDigest: hash("generated-requirements"), recordedAt: new Date(now).toISOString() },
  runtimeKinds: ["llama-cpp"], operatingSystems: ["linux"], architectures: ["x64"], accelerator: "cpu",
  minimumRamBytes: 16 * GiB, minimumFreeRamBytes: 8 * GiB, minimumDiskBytes: 256 * GiB,
  minimumFreeDiskBytes: 32 * GiB, modelFormat: "gguf", minimumModelBytes: GiB,
};
function elf(machine = 62): Uint8Array {
  const bytes = new Uint8Array(64), view = new DataView(bytes.buffer);
  bytes.set([0x7f, 0x45, 0x4c, 0x46, 2, 1, 1, 3]); view.setUint16(18, machine, true);
  return bytes;
}
function gguf(version = 3): Uint8Array {
  const bytes = new Uint8Array(8); bytes.set([0x47, 0x47, 0x55, 0x46]); new DataView(bytes.buffer).setUint32(4, version, true);
  return bytes;
}
function macho(cpu = 0x100000c): Uint8Array {
  const bytes = new Uint8Array(32), view = new DataView(bytes.buffer);
  view.setUint32(0, 0xfeedfacf, true); view.setUint32(4, cpu, true); return bytes;
}
function universalMacho(): Uint8Array {
  const bytes = new Uint8Array(48), view = new DataView(bytes.buffer);
  view.setUint32(0, 0xcafebabe); view.setUint32(4, 2);
  view.setUint32(8, 0x1000007); view.setUint32(28, 0x100000c); return bytes;
}
function installed(path: string, header = elf(), sizeBytes = 1024): ReadinessFileInspection {
  return { status: "observed", code: "file-observed", sizeBytes, sha256: hash(`${path}-bytes`),
    identityDigest: hash(`${path}-identity`), header, executionSafe: true };
}
function generatedFixture() {
  const inspections: Array<{ path: string; hash: boolean; headerBytes: number }> = [], requests: ReadinessProbeRequest[] = [];
  const files = new Map<string, ReadinessFileInspection>([
    [configuration.executablePath!, installed(configuration.executablePath!)],
    [configuration.modelPath!, installed(configuration.modelPath!, gguf(), 4 * GiB)],
  ]);
  const facts: ReadinessHostFacts = {
    operatingSystem: "linux", architecture: "x64", osRelease: "6.12.0",
    ramBytes: 32 * GiB, freeRamBytes: 16 * GiB, cpuAvailable: true,
  };
  const filesystem: ReadinessFileSystem = {
    async inspect(path, options) {
      options.signal.throwIfAborted(); inspections.push({ path, hash: options.hash, headerBytes: options.headerBytes });
      const file = files.get(path);
      return file ? { ...file, sha256: options.hash ? file.sha256 : null, header: file.header.subarray(0, options.headerBytes) } :
        { status: "missing", code: "file-missing", sizeBytes: null, sha256: null, identityDigest: null, header: new Uint8Array(), executionSafe: false };
    },
    async storage(_path, signal) { signal.throwIfAborted(); return { totalBytes: 512 * GiB, availableBytes: 256 * GiB, code: "storage-observed" }; },
  };
  const suite: ReadinessProbeSuite = {
    target, files: filesystem, async hostFacts(signal) { signal.throwIfAborted(); return facts; },
    async run(request) { request.signal.throwIfAborted(); requests.push(request); return "version: 9911 (abcdef01234567)\n"; },
  };
  const executable = files.get(configuration.executablePath!)!;
  const review: LocalRuntimeExecutableReview = {
    kind: "retained-user-runtime-executable-review", actor: "user", runtimeKind: "llama-cpp",
    configurationDigest: modelReadinessConfigurationDigest(configuration), target,
    executableLocationDigest: hash(configuration.executablePath!), executableSha256: executable.sha256!,
    executableIdentityDigest: executable.identityDigest!, reviewDigest: hash("generated-user-review"),
    reviewedAt: new Date(now).toISOString(),
  };
  return { suite, review, files, facts, requests, inspections };
}

test("bounded collection records reviewed runtime identity, actual host facts and model header without inference or a network probe", async () => {
  const fixture = generatedFixture();
  const report = await collectModelReadiness({ target, runtime: configuration, requirements, mode: "required", storagePath: "/generated/root" },
    { signal: new AbortController().signal, probes: fixture.suite, executableReview: fixture.review, now: () => now });
  assert.equal(Value.Check(ModelReadinessReportSchema, report), true);
  assert.equal(report.evaluation.status, "satisfied"); assert.equal(report.evaluation.requiredSatisfied, true);
  assert.equal(report.observations.runtime?.version.value, "build:9911@abcdef01234567");
  assert.equal(report.observations.host.ramBytes.value, 32 * GiB);
  assert.equal(report.observations.host.freeDiskBytes.value, 256 * GiB);
  assert.equal(report.observations.model?.format.value, "gguf"); assert.equal(report.observations.model?.formatVersion, 3);
  assert.equal(report.observations.model?.file.sha256, null);
  assert.equal(report.capacity.status, "unknown"); assert.equal(report.capacity.estimatedMaxParameters, null);
  assert.deepEqual(fixture.requests.map(({ id, executablePath, args }) => ({ id, executablePath, args })), [
    { id: "llama-cpp-version", executablePath: configuration.executablePath, args: ["--version"] },
  ]);
  assert.equal(fixture.inspections.some((inspection) => inspection.path === configuration.modelPath && inspection.hash), false);
  assert.equal(isModelReadinessReportCurrent(report, target, now), true);
  assert.equal(JSON.stringify(report).includes("/generated/"), false);
});

test("the Node file observer reads only a bounded owned source fixture and refuses an oversized identity read", async () => {
  const files = createNodeReadinessFileSystem(), path = fileURLToPath(import.meta.url), signal = new AbortController().signal;
  const metadata = await files.inspect(path, { signal, hash: false, headerBytes: 8, maxHashBytes: 1024 });
  assert.equal(metadata.status, "observed"); assert.equal(metadata.header.byteLength, 8);
  assert.equal(metadata.sha256, null); assert.equal(metadata.executionSafe, false);
  const oversized = await files.inspect(path, { signal, hash: true, headerBytes: 8, maxHashBytes: 1 });
  assert.equal(oversized.status, "unknown"); assert.equal(oversized.code, "executable-identity-size-limit");
  assert.equal(oversized.sha256, null); assert.equal(oversized.header.byteLength, 0);
});

test("Local collection has a Node default, but non-Local owners cannot use controller host facts as a fallback", async (t) => {
  t.mock.method(os, "platform", () => "freebsd");
  t.mock.method(os, "arch", () => "x64");
  t.mock.method(os, "release", () => "14.0.0");
  t.mock.method(os, "totalmem", () => 32 * GiB);
  t.mock.method(os, "freemem", () => 16 * GiB);
  t.mock.method(os, "availableParallelism", () => 4);
  const storagePath = fileURLToPath(new URL("../", import.meta.url)).replace(/\/$/, "");
  const report = await collectModelReadiness({ target, storagePath },
    { signal: new AbortController().signal, now: () => now });
  assert.equal(report.observations.host.operatingSystem.value, "freebsd");
  assert.equal(report.observations.host.architecture.value, "x64");
  assert.equal(report.observations.host.ramBytes.value, 32 * GiB);
  assert.equal(report.observations.discovered.length, 0);
  assert.equal(report.evaluation.status, "unknown"); assert.equal(report.evaluation.requiredSatisfied, null);
  for (const env of ["Remote", "Sandbox"] as const) await assert.rejects(() => collectModelReadiness({
    target: { ...target, env, peerDigest: hash(`generated-${env}`) }, storagePath,
  }, { signal: new AbortController().signal, now: () => now }), { code: "model_readiness_provenance" });
});

test("a separately verified executing boundary admits actual-process probes without relabeling Remote or native targets", async (t) => {
  t.mock.method(os, "platform", () => "freebsd"); t.mock.method(os, "arch", () => "x64");
  t.mock.method(os, "release", () => "14.0.0"); t.mock.method(os, "totalmem", () => 32 * GiB);
  t.mock.method(os, "freemem", () => 16 * GiB); t.mock.method(os, "availableParallelism", () => 4);
  const storagePath = fileURLToPath(new URL("../", import.meta.url)).replace(/\/$/, "");
  for (const env of ["Remote", "Sandbox"] as const) {
    const actualPeer = env === "Remote" ? hash("generated-actual-ssh-peer") : null;
    const actualTarget = { ...target, env, peerDigest: actualPeer };
    let live = true, assertions = 0;
    const assertCurrent = () => { assertions++; if (!live) throw new Error("generated-private-owner-revoked"); };
    const boundary: ReadinessExecutingBoundary = env === "Remote" ? {
      kind: "pinned-ssh-bridge", env: "Remote", rootDigest: target.rootDigest,
      buildDigest: target.buildDigest, peerDigest: actualPeer!, assertCurrent,
    } : { kind: "active-sealed-native", env: "Sandbox", rootDigest: target.rootDigest,
      buildDigest: target.buildDigest, peerDigest: null, assertCurrent };
    const probes = createExecutingNodeReadinessProbeSuite(actualTarget, boundary);
    const report = await collectModelReadiness({ target: actualTarget, storagePath },
      { signal: new AbortController().signal, probes, now: () => now });
    assert.equal(probes.target.env, env); assert.equal(report.target.env, env);
    assert.equal(report.observations.host.ramBytes.value, 32 * GiB);
    assert.equal(report.capacity.status, "unknown"); assert.ok(assertions >= 5);
    live = false;
    await assert.rejects(() => probes.hostFacts(new AbortController().signal),
      (error: unknown) => error instanceof Error && "code" in error && error.code === "model_readiness_provenance" &&
        !error.message.includes("generated-private"));
  }
});

test("executing-boundary mismatches fail before probing and the factory runner cannot bypass collector admission", async () => {
  const boundary: ReadinessExecutingBoundary = {
    kind: "pinned-ssh-bridge", env: "Remote", rootDigest: target.rootDigest,
    buildDigest: target.buildDigest, peerDigest: hash("generated-independent-peer"), assertCurrent() {},
  };
  const actualTarget = { ...target, env: "Remote" as const, peerDigest: boundary.peerDigest };
  for (const wrong of [{ ...actualTarget, env: "Local" as const }, { ...actualTarget, rootDigest: hash("wrong-root") },
    { ...actualTarget, buildDigest: hash("wrong-build") }, { ...actualTarget, peerDigest: hash("wrong-peer") }])
    assert.throws(() => createExecutingNodeReadinessProbeSuite(wrong, boundary), { code: "model_readiness_provenance" });
  const probes = createExecutingNodeReadinessProbeSuite(actualTarget, boundary);
  await assert.rejects(() => probes.run({
    id: "llama-cpp-version", executablePath: "/generated/unreviewed-program", args: ["--version"],
    signal: new AbortController().signal, timeoutMs: 100, maxOutputBytes: 1024,
  }), { code: "model_readiness_provenance" });
});

test("fixed NVIDIA observations retain each device's driver and memory without pooling GPUs or starting a runtime", async () => {
  const fixture = generatedFixture();
  fixture.files.set("/usr/bin/nvidia-smi", installed("/usr/bin/nvidia-smi"));
  fixture.suite.run = async (request) => {
    fixture.requests.push(request);
    return request.id === "nvidia-gpu" ? "555.42.01, 24576, 20480\n555.42.01, 8192, 4096\n" : "version: 9911 (abcdef01234567)\n";
  };
  const report = await collectModelReadiness({
    target, runtime: configuration, storagePath: "/generated/root", mode: "required",
    requirements: { ...requirements, accelerator: "cuda", minimumDriverVersion: "550.0.0", minimumVramBytes: 16 * GiB, minimumFreeVramBytes: 16 * GiB },
  }, { signal: new AbortController().signal, probes: fixture.suite, executableReview: fixture.review, now: () => now });
  const devices = report.observations.accelerators.filter((device) => device.kind === "cuda");
  assert.equal(devices.length, 2);
  assert.equal(devices[0]?.driverVersion.value, "555.42.01");
  assert.equal(devices[0]?.vramBytes.value, 24 * GiB); assert.equal(devices[0]?.freeVramBytes.value, 20 * GiB);
  assert.equal(report.evaluation.requiredSatisfied, true);
  assert.deepEqual(fixture.requests.find((request) => request.id === "nvidia-gpu")?.args, [
    "--query-gpu=driver_version,memory.total,memory.free", "--format=csv,noheader,nounits",
  ]);
});

test("Metal support comes from display evidence, while shared RAM, absent driver versions and ambiguous VRAM stay unknown", async () => {
  const fixture = generatedFixture();
  fixture.facts.operatingSystem = "darwin"; fixture.facts.architecture = "arm64";
  fixture.files.set(configuration.executablePath!, installed(configuration.executablePath!, macho()));
  fixture.files.set("/usr/sbin/system_profiler", installed("/usr/sbin/system_profiler", macho()));
  fixture.suite.run = async (request) => {
    fixture.requests.push(request);
    return JSON.stringify({ SPDisplaysDataType: [
      { spdisplays_metal: "spdisplays_metal3", spdisplays_vram_shared: "32 GiB", serial_number: "generated-private-serial", _name: "generated-user-name" },
      { spdisplays_metal: "spdisplays_metal3", spdisplays_vram: "12 GiB" },
      { spdisplays_metal: "spdisplays_metal3", spdisplays_vram: "8 GB" },
    ] });
  };
  const report = await collectModelReadiness({
    target, runtime: configuration, storagePath: "/generated/root",
    requirements: { ...requirements, operatingSystems: ["darwin"], architectures: ["arm64"], accelerator: "metal", minimumVramBytes: 8 * GiB },
  }, { signal: new AbortController().signal, probes: fixture.suite, now: () => now });
  const devices = report.observations.accelerators.filter((device) => device.kind === "metal");
  assert.equal(devices[0]?.support, "observed"); assert.equal(devices[0]?.memoryKind, "unified");
  assert.equal(devices[0]?.vramBytes.value, null); assert.equal(devices[0]?.driverVersion.value, null);
  assert.equal(devices[1]?.vramBytes.value, 12 * GiB); assert.equal(devices[1]?.freeVramBytes.value, null);
  assert.equal(devices[2]?.vramBytes.value, null);
  assert.equal(report.evaluation.checks.find((check) => check.id === "vram")?.status, "pass");
  assert.equal(report.evaluation.requiredSatisfied, null);
  assert.deepEqual(fixture.requests.map((request) => ({ id: request.id, args: request.args })), [
    { id: "macos-displays", args: ["-json", "SPDisplaysDataType", "-detailLevel", "mini"] },
  ]);
  assert.equal(JSON.stringify(report).includes("generated-private-serial"), false);
  assert.equal(JSON.stringify(report).includes("generated-user-name"), false);
});

test("known probe failures become explicit unknowns and unexpected observer errors never expose raw diagnostics", async () => {
  const fixture = generatedFixture();
  fixture.suite.run = async () => { throw new ReadinessProbeFailure("exited-nonzero"); };
  const report = await collectModelReadiness({
    target, runtime: configuration, requirements, mode: "required", storagePath: "/generated/root",
  }, { signal: new AbortController().signal, probes: fixture.suite, executableReview: fixture.review, now: () => now });
  assert.equal(report.observations.runtime?.version.status, "unknown");
  assert.equal(report.observations.runtime?.version.evidence.code, "probe-exit-failed");
  assert.equal(report.evaluation.requiredSatisfied, false);
  fixture.suite.run = async () => { throw new Error("generated-private-token and generated-private-home"); };
  await assert.rejects(() => collectModelReadiness({
    target, runtime: configuration, requirements, storagePath: "/generated/root",
  }, { signal: new AbortController().signal, probes: fixture.suite, executableReview: fixture.review, now: () => now }),
  (error: unknown) => error instanceof Error && "code" in error && error.code === "model_readiness_probe_failed" &&
    !error.message.includes("generated-private"));
});

test("metadata-only discovery does not execute unreviewed, mutable, symlinked, Ollama or DS4 programs", async () => {
  for (const variant of ["unreviewed", "mutable", "symlink", "ollama", "ds4"] as const) {
    const fixture = generatedFixture(), runtime = { ...configuration };
    const file = fixture.files.get(configuration.executablePath!)!;
    if (variant === "mutable") fixture.files.set(configuration.executablePath!, { ...file, executionSafe: false });
    if (variant === "symlink") fixture.files.set(configuration.executablePath!, {
      status: "refused", code: "file-alias-refused", sizeBytes: null, sha256: null,
      identityDigest: null, header: new Uint8Array(), executionSafe: false,
    });
    if (variant === "ollama" || variant === "ds4") runtime.kind = variant;
    const executableReview = variant === "unreviewed" ? undefined : {
      ...fixture.review, runtimeKind: runtime.kind!, configurationDigest: modelReadinessConfigurationDigest(runtime),
    };
    const report = await collectModelReadiness({ target, runtime, requirements, storagePath: "/generated/root" },
      { signal: new AbortController().signal, probes: fixture.suite, executableReview, now: () => now });
    assert.equal(fixture.requests.length, 0, variant);
    assert.equal(report.observations.runtime?.version.status, "unknown", variant);
    assert.notEqual(report.evaluation.status, "satisfied", variant);
    assert.equal(report.observations.discovered.length, 6);
    assert.equal(fixture.inspections.some((inspection) => /\/proc\/|\/sys\/|\/home\/|\/Users\//.test(inspection.path)), false);
  }
});

test("pre-abort and in-flight cancellation propagate without publishing or dispatching later probes", { timeout: ciTime(2000) }, async () => {
  const pre = generatedFixture(), stopped = new AbortController(); stopped.abort("generated-private-reason");
  await assert.rejects(() => collectModelReadiness({ target, storagePath: "/generated/root" },
    { signal: stopped.signal, probes: pre.suite, now: () => now }), { code: "model_readiness_cancelled" });
  assert.equal(pre.inspections.length, 0); assert.equal(pre.requests.length, 0);
  const fixture = generatedFixture(), started = Promise.withResolvers<void>(), late = Promise.withResolvers<string>(), controller = new AbortController();
  let observedSignal: AbortSignal | undefined;
  fixture.suite.run = async (request) => { observedSignal = request.signal; fixture.requests.push(request); started.resolve(); return late.promise; };
  const pending = collectModelReadiness({ target, runtime: configuration, requirements, storagePath: "/generated/root" },
    { signal: controller.signal, probes: fixture.suite, executableReview: fixture.review, now: () => now });
  const rejected = assert.rejects(() => pending, (error: unknown) => error instanceof Error && "code" in error &&
    error.code === "model_readiness_cancelled" && !error.message.includes("generated-private"));
  await started.promise; controller.abort("generated-private-reason"); await rejected;
  assert.equal(observedSignal?.aborted, true); late.resolve("version: 9911 (abcdef01234567)\n");
  assert.equal(fixture.requests.length, 1);
});

test("both probe and total deadlines abort unresponsive read-only fixtures and never publish partial evidence", { timeout: ciTime(2000) }, async () => {
  const fixture = generatedFixture(); let observedSignal: AbortSignal | undefined;
  fixture.suite.run = async (request) => { observedSignal = request.signal; return new Promise<string>(() => {}); };
  await assert.rejects(() => collectModelReadiness({ target, runtime: configuration, requirements, storagePath: "/generated/root" },
    { signal: new AbortController().signal, probes: fixture.suite, executableReview: fixture.review,
      now: () => now, timeoutMs: 200, probeTimeoutMs: 15 }), { code: "model_readiness_timeout" });
  assert.equal(observedSignal?.aborted, true);
  const filesystem = generatedFixture(); let hostSignal: AbortSignal | undefined;
  filesystem.suite.hostFacts = async (signal) => { hostSignal = signal; return new Promise<ReadinessHostFacts>(() => {}); };
  await assert.rejects(() => collectModelReadiness({ target, storagePath: "/generated/root" },
    { signal: new AbortController().signal, probes: filesystem.suite, now: () => now, timeoutMs: 15 }), { code: "model_readiness_timeout" });
  assert.equal(hostSignal?.aborted, true); assert.equal(filesystem.requests.length, 0);
});

test("oversized UTF-8 version or hardware output is rejected rather than truncated into a green observation", async () => {
  const fixture = generatedFixture();
  fixture.suite.run = async () => "λ".repeat(40);
  await assert.rejects(() => collectModelReadiness({ target, runtime: configuration, requirements, storagePath: "/generated/root" },
    { signal: new AbortController().signal, probes: fixture.suite, executableReview: fixture.review,
      now: () => now, maxOutputBytes: 64 }), { code: "model_readiness_output_limit" });
});

test("replaced executable bytes are rejected before dispatch and after a late successful-looking probe", async () => {
  for (const when of ["before", "after"] as const) {
    const fixture = generatedFixture(), inspect = fixture.suite.files.inspect.bind(fixture.suite.files);
    let configuredInspections = 0;
    fixture.suite.files.inspect = async (path, options) => {
      const result = await inspect(path, options);
      if (path === configuration.executablePath && options.hash && ++configuredInspections >= (when === "before" ? 2 : 3))
        return { ...result, sha256: hash("generated-replaced-binary"), identityDigest: hash("generated-replaced-identity") };
      return result;
    };
    await assert.rejects(() => collectModelReadiness({ target, runtime: configuration, requirements, storagePath: "/generated/root" },
      { signal: new AbortController().signal, probes: fixture.suite, executableReview: fixture.review, now: () => now }),
    { code: "model_readiness_stale" });
    assert.equal(fixture.requests.length, when === "before" ? 0 : 1);
  }
});

test("freshness rejects every changed owner/binding, future or expired evidence, including expiry during collection", async () => {
  const fixture = generatedFixture();
  const report = await collectModelReadiness({ target, runtime: configuration, requirements, storagePath: "/generated/root" },
    { signal: new AbortController().signal, probes: fixture.suite, executableReview: fixture.review, now: () => now });
  const changes: ModelReadinessTarget[] = [
    { ...target, profileId: "another-profile" }, { ...target, sessionId: "another-session" },
    { ...target, modelId: "another-model" }, { ...target, env: "Remote" }, { ...target, rootDigest: hash("another-root") },
    { ...target, peerDigest: hash("another-peer") }, { ...target, buildDigest: hash("another-build") },
    { ...target, endpointBindingDigest: hash("another-endpoint") }, { ...target, modelBindingDigest: hash("another-model-binding") },
  ];
  for (const changed of changes) assert.equal(isModelReadinessReportCurrent(report, changed, now), false);
  assert.equal(isModelReadinessReportCurrent(report, target, now - 1), false);
  assert.equal(isModelReadinessReportCurrent(report, target, now + report.freshness.maxAgeMs), false);
  const expires = generatedFixture(); let clock = now;
  expires.suite.run = async () => { clock += 61_000; return "version: 9911 (abcdef01234567)\n"; };
  await assert.rejects(() => collectModelReadiness({ target, runtime: configuration, requirements, mode: "required", storagePath: "/generated/root" },
    { signal: new AbortController().signal, probes: expires.suite, executableReview: expires.review, now: () => clock }),
  { code: "model_readiness_stale" });
});

test("binding changes during a read and mismatched native/SSH origins cannot publish controller-host evidence", async () => {
  const fixture = generatedFixture(), current = { ...target };
  fixture.suite.run = async () => { current.modelBindingDigest = hash("new-model-binding"); return "version: 9911 (abcdef01234567)\n"; };
  await assert.rejects(() => collectModelReadiness({ target, runtime: configuration, requirements, storagePath: "/generated/root" },
    { signal: new AbortController().signal, probes: fixture.suite, executableReview: fixture.review, currentTarget: () => current, now: () => now }),
  { code: "model_readiness_stale" });
  for (const env of ["Remote", "Sandbox"] as const) {
    const wrong = generatedFixture();
    await assert.rejects(() => collectModelReadiness({ target: { ...target, env, peerDigest: hash(`generated-${env}`) }, storagePath: "/generated/root" },
      { signal: new AbortController().signal, probes: wrong.suite, now: () => now }), { code: "model_readiness_provenance" });
    assert.equal(wrong.inspections.length, 0);
  }
});

test("bounded universal Mach-O headers preserve actual architectures without selecting an executable fallback", async () => {
  const fixture = generatedFixture();
  fixture.facts.operatingSystem = "darwin"; fixture.facts.architecture = "arm64";
  fixture.files.set(configuration.executablePath!, installed(configuration.executablePath!, universalMacho()));
  const report = await collectModelReadiness({
    target, runtime: configuration, storagePath: "/generated/root", mode: "required",
    requirements: { ...requirements, operatingSystems: ["darwin"], architectures: ["arm64"] },
  }, { signal: new AbortController().signal, probes: fixture.suite, executableReview: fixture.review, now: () => now });
  assert.deepEqual(report.observations.runtime?.binary.architectures, ["x64", "arm64"]);
  assert.equal(report.evaluation.requiredSatisfied, true);
});

test("inconsistent memory/storage and potentially identifying release text remain unknown with exact diagnostic codes", async () => {
  const fixture = generatedFixture();
  fixture.facts.freeRamBytes = 64 * GiB; fixture.facts.osRelease = "generated-private-serial";
  fixture.suite.files.storage = async () => ({ totalBytes: null, availableBytes: null, code: "storage-access-denied" });
  const report = await collectModelReadiness({ target, runtime: configuration, requirements, mode: "required", storagePath: "/generated/root" },
    { signal: new AbortController().signal, probes: fixture.suite, executableReview: fixture.review, now: () => now });
  assert.equal(report.observations.host.freeRamBytes.value, null);
  assert.equal(report.observations.host.freeRamBytes.evidence.code, "free-memory-inconsistent");
  assert.equal(report.observations.host.freeDiskBytes.value, null);
  assert.equal(report.observations.host.freeDiskBytes.evidence.code, "storage-access-denied");
  assert.equal(report.observations.host.osRelease.value, null);
  assert.equal(JSON.stringify(report).includes("generated-private-serial"), false);
  assert.equal(report.evaluation.requiredSatisfied, false);
});

test("untrusted diagnostic labels, oversized identities and unsolicited weight digests are not report evidence", async () => {
  for (const variant of ["diagnostic", "oversized", "weight-digest"] as const) {
    const fixture = generatedFixture(), inspect = fixture.suite.files.inspect.bind(fixture.suite.files);
    fixture.suite.files.inspect = async (path, options) => {
      const file = await inspect(path, options);
      if (path === configuration.executablePath && options.hash && variant === "diagnostic")
        return Object.assign(file, { code: "generated-private-account" });
      if (path === configuration.executablePath && options.hash && variant === "oversized")
        return { ...file, sizeBytes: 128 * 1024 ** 2 + 1 };
      if (path === configuration.modelPath && variant === "weight-digest") return { ...file, sha256: hash("generated-unrequested-weight-digest") };
      return file;
    };
    await assert.rejects(() => collectModelReadiness({ target, runtime: configuration, requirements, storagePath: "/generated/root" },
      { signal: new AbortController().signal, probes: fixture.suite, executableReview: fixture.review, now: () => now }),
    (error: unknown) => error instanceof Error && "code" in error && error.code === "model_readiness_probe_failed" && !error.message.includes("generated-private"));
  }
});

test("noncanonical runtime/model locations are rejected before any injected filesystem or program call", async () => {
  for (const runtime of [{ ...configuration, executablePath: "/generated/../llama-cli" },
    { ...configuration, modelPath: "/generated/./model.gguf" }]) {
    const fixture = generatedFixture();
    await assert.rejects(() => collectModelReadiness({ target, runtime, storagePath: "/generated/root" },
      { signal: new AbortController().signal, probes: fixture.suite, now: () => now }), { code: "model_readiness_invalid" });
    assert.equal(fixture.inspections.length, 0); assert.equal(fixture.requests.length, 0);
  }
});

test("collection captures root and mode before awaiting host facts and rejects non-canonical calendar evidence", async () => {
  const fixture = generatedFixture();
  const input = { target, runtime: configuration, requirements, mode: "informational" as "informational" | "required", storagePath: "/generated/root" };
  const storagePaths: string[] = [], storage = fixture.suite.files.storage.bind(fixture.suite.files);
  fixture.suite.hostFacts = async () => { input.storagePath = "/generated/changed-root"; input.mode = "required"; return fixture.facts; };
  fixture.suite.files.storage = async (path, signal) => { storagePaths.push(path); return storage(path, signal); };
  const report = await collectModelReadiness(input,
    { signal: new AbortController().signal, probes: fixture.suite, executableReview: fixture.review, now: () => now });
  assert.deepEqual(storagePaths, ["/generated/root"]); assert.equal(report.mode, "informational");
  const malformed = { ...report, freshness: {
    observedAt: "2026-02-31T18:00:00.000Z", expiresAt: "2026-03-03T18:01:00.000Z", maxAgeMs: 60_000,
  } };
  assert.equal(isModelReadinessReportCurrent(malformed, target, Date.parse("2026-03-03T18:00:30.000Z")), false);
});

test("the browser-safe panel uses native controls and evidence tables, never a fabricated endpoint health badge", async () => {
  const fixture = generatedFixture();
  const report = await collectModelReadiness({ target, runtime: configuration, requirements, storagePath: "/generated/root" },
    { signal: new AbortController().signal, probes: fixture.suite, executableReview: fixture.review, now: () => now });
  const render = (owningTarget: ModelReadinessTarget, clock = now) => renderToStaticMarkup(createElement(ModelReadinessPanel, {
    target: owningTarget, initialReport: report, now: () => clock, onProbe: async () => report,
  }));
  const html = render(target);
  assert.match(html, /<button[^>]*type="button"[^>]*>Refresh readiness<\/button>/);
  assert.match(html, /<button[^>]*disabled=""[^>]*>Cancel probe<\/button>/);
  assert.match(html, /<caption>Current runtime and hardware observations<\/caption>/);
  assert.match(html, /<th scope="col">Evidence<\/th>/);
  assert.match(html, /32 GiB/); assert.match(html, /runtime-build-observed/);
  assert.match(html, /not inference|not loaded-model health/i);
  assert.doesNotMatch(html, /Healthy endpoint|green badge|provider permission granted/i);
  assert.doesNotMatch(render({ ...target, profileId: "another-profile" }), /build:9911@/);
  assert.doesNotMatch(render(target, now + report.freshness.maxAgeMs), /build:9911@/);
});

test("the readiness panel has strict types and bundles for browsers without the SDK service runtime", { timeout: ciTime(120_000) }, async () => {
  const paths = ["apps/desktop/src/ModelReadinessPanel.tsx", "tests/model-readiness-probes.test.ts"];
  const configPath = resolve(".model-readiness-virtual-typecheck.json");
  const configuration = JSON.stringify({
    compilerOptions: { target: "ES2024", lib: ["ES2024", "DOM", "DOM.Iterable"], module: "ESNext", moduleResolution: "Bundler",
      jsx: "react-jsx", strict: true, skipLibCheck: true, noEmit: true, allowImportingTsExtensions: true,
      types: ["node", "react", "react-dom"], noUncheckedIndexedAccess: true, noUnusedLocals: true, noUnusedParameters: true },
    files: paths,
  });
  const api = new TypeScriptAPI({ cwd: process.cwd(), fs: {
    fileExists: (path) => path === configPath ? true : undefined,
    readFile: (path) => path === configPath ? configuration : undefined,
  } });
  try {
    const snapshot = await api.updateSnapshot({ openProjects: [configPath] }), project = snapshot.getProject(configPath);
    assert.ok(project);
    const diagnostics: string[] = [];
    for (const path of paths) {
      const found = [...await project.program.getSyntacticDiagnostics(resolve(path)), ...await project.program.getBindDiagnostics(resolve(path)),
        ...await project.program.getSemanticDiagnostics(resolve(path))];
      diagnostics.push(...found.map((diagnostic) => `${path}: TS${diagnostic.code}: ${diagnostic.text}`));
    }
    assert.deepEqual(diagnostics, []);
    await snapshot.dispose();
  } finally { await api.close(); }
  const bundled = await build({
    entryPoints: ["apps/desktop/src/ModelReadinessPanel.tsx"],
    outdir: "readiness-unused-output", bundle: true, write: false, platform: "browser", format: "esm", metafile: true, logLevel: "silent",
  });
  assert.equal(bundled.outputFiles.length, 1);
  assert.equal(Object.keys(bundled.metafile.inputs).some((path) => /@moguri-dev\/sdk\/dist\/(?!sdk\/)/.test(path)), false);
});

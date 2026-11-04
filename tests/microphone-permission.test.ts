import assert from "node:assert/strict";
import test from "node:test";
import { prepareBrowserMicrophone } from "../apps/desktop/src/browser-audio.ts";
import { microphonePermission } from "../apps/desktop/src/microphone-permission.ts";

test("repeated focus-only standby checks never ask for first-time, denied, restricted or unknown OS permission", async () => {
  for (const status of ["not-determined", "denied", "restricted", "unknown"] as const) {
    let prompts = 0;
    for (let focus = 0; focus < 4; focus++) {
      assert.deepEqual(await microphonePermission("standby", {
        getMediaAccessStatus: (kind) => { assert.equal(kind, "microphone"); return status; },
        askForMediaAccess: async () => { prompts++; return true; },
      }), { allowed: false, prompted: false });
    }
    assert.equal(prompts, 0, `Standby must not ask for ${status} permission.`);
  }
});

test("one explicit activation may grant permission, later focus only checks it, and revocation is never cached as access", async () => {
  let status: "not-determined" | "granted" | "denied" = "not-determined", prompts = 0;
  const permissions = {
    getMediaAccessStatus: () => status,
    askForMediaAccess: async () => { prompts++; status = "granted"; return true; },
  };
  assert.deepEqual(await microphonePermission("standby", permissions), { allowed: false, prompted: false });
  assert.deepEqual(await microphonePermission("capture", permissions), { allowed: true, prompted: true });
  for (let focus = 0; focus < 4; focus++) {
    assert.deepEqual(await microphonePermission("standby", permissions), { allowed: true, prompted: false });
  }
  assert.deepEqual(await microphonePermission("capture", permissions), { allowed: true, prompted: false });
  assert.deepEqual(await microphonePermission("devices", permissions), { allowed: true, prompted: false });
  status = "denied";
  assert.deepEqual(await microphonePermission("standby", permissions), { allowed: false, prompted: false });
  assert.equal(prompts, 1);
});

test("only explicit capture and device discovery request OS permission, preserving actual denials and errors", async () => {
  for (const purpose of ["capture", "devices"] as const) {
    for (const allowed of [true, false]) {
      let prompts = 0;
      assert.deepEqual(await microphonePermission(purpose, {
        getMediaAccessStatus: () => "not-determined",
        askForMediaAccess: async (kind) => { assert.equal(kind, "microphone"); prompts++; return allowed; },
      }), { allowed, prompted: true });
      assert.equal(prompts, 1);
    }
    await assert.rejects(() => microphonePermission(purpose, {
      getMediaAccessStatus: () => "unknown",
      askForMediaAccess: async () => { throw new Error("Generated OS permission failure."); },
    }), /Generated OS permission failure/);
  }
});

test("standby without an existing native permission grant opens no media and releases no unrelated grant", async (t) => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  t.after(() => {
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow); else Reflect.deleteProperty(globalThis, "window");
    if (originalNavigator) Object.defineProperty(globalThis, "navigator", originalNavigator); else Reflect.deleteProperty(globalThis, "navigator");
  });
  let requests = 0, microphones = 0, pending: Promise<string | null> | undefined;
  const released: string[] = [];
  Object.defineProperty(globalThis, "window", { configurable: true, value: { moguri: {
    audioPermission: async (input: { purpose: string }) => {
      assert.equal(input.purpose, "standby"); requests++; return pending ?? null;
    },
    releaseAudioPermission: async (id: string) => { released.push(id); },
  } } });
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { mediaDevices: {
    getUserMedia: async () => { microphones++; throw new Error("A focus-only standby attempt reached microphone acquisition without permission."); },
  } } });
  const request = new AbortController();
  assert.equal(await prepareBrowserMicrophone("generated-profile", "generated-chat", "default", request.signal), undefined);
  request.abort();
  const permission = Promise.withResolvers<null>(); pending = permission.promise;
  const original = new AbortController();
  const preparing = prepareBrowserMicrophone("generated-profile", "generated-chat", "default", original.signal);
  original.abort(); permission.resolve(null);
  await assert.rejects(() => preparing, { name: "AbortError" });
  const late = Promise.withResolvers<string>(); pending = late.promise;
  const cancelled = new AbortController();
  const granting = prepareBrowserMicrophone("generated-profile", "generated-chat", "default", cancelled.signal);
  cancelled.abort(); late.resolve("generated-original-late-grant");
  await assert.rejects(() => granting, { name: "AbortError" });
  assert.equal(requests, 3); assert.equal(microphones, 0);
  assert.deepEqual(released, ["generated-original-late-grant"]);
});

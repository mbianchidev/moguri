import { execFile } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";

export async function qualifyModelEvidence({ node = process.execPath, packageRoot, directory }) {
  const root = resolve(packageRoot), stateDir = join(resolve(directory), "state");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const source = `
    import assert from "node:assert/strict";
    import {registerHooks} from "node:module";
    import {createHash} from "node:crypto";
    import {execFile} from "node:child_process";
    import {promisify} from "node:util";
    import {githubCopilotProvider} from "@earendil-works/pi-ai/providers/github-copilot";
    const started=performance.now(),model=githubCopilotProvider().getModels()[0],access="generated-catalogue-request-access-only";
    assert.ok(model);
    const key=Symbol.for("moguri.generated.model-evidence.keyring");
    const backend={reads:0,password:JSON.stringify({type:"oauth",refresh:"generated-unused-refresh",access,expires:Date.now()+3600000,availableModelIds:[model.id]})};
    globalThis[key]=backend;
    const replacement="data:text/javascript,"+encodeURIComponent(
      'import assert from "node:assert/strict";export const qualificationBackend="generated-memory-only";export class AsyncEntry{'+
      'constructor(service,user){this.service=service;this.user=user;}'+
      'check(signal){signal?.throwIfAborted();assert.equal(this.service,"dev.moguri.profile.default");assert.equal(this.user,"github-copilot");return globalThis[Symbol.for("moguri.generated.model-evidence.keyring")];}'+
      'async getPassword(signal){const backend=this.check(signal);backend.reads++;return backend.password;}'+
      'async setPassword(value,signal){this.check(signal).password=value;}'+
      'async deleteCredential(signal){this.check(signal).password=null;return true;}}');
    const hooks=registerHooks({resolve(specifier,context,next){return specifier==="@napi-rs/keyring"?{url:replacement,shortCircuit:true}:next(specifier,context);}});
    assert.equal((await import("@napi-rs/keyring")).qualificationBackend,"generated-memory-only");
    const {createRuntime}=await import(${JSON.stringify(pathToFileURL(join(root, "dist", "sdk", "node.mjs")).href)});
    const {MoguriSdk}=await import(${JSON.stringify(pathToFileURL(join(root, "dist", "sdk", "index.mjs")).href)});
    let catalogue={data:[{id:model.id,vendor:"Generated provider claim",version:"generated-provider-version",
      capabilities:{family:"generated-provider-declaration"},unrelated:"Generated omitted provider data"}]},reads=0,runtime,sdk;
    const originalFetch=globalThis.fetch,origins=new Set(),secrets=new Map();
    const vault={read:async id=>secrets.get(id)??null,write:async(id,value)=>{secrets.set(id,value);},remove:async id=>{secrets.delete(id);}};
    globalThis.fetch=async(input,init)=>{
      const url=new URL(input instanceof Request?input.url:String(input));
      if(url.href==="https://api.individual.githubcopilot.com/models"){
        reads++;init?.signal?.throwIfAborted();
        const headers=new Headers(init?.headers);
        assert.equal(headers.get("Authorization"),"Bearer "+access);assert.equal(headers.get("Accept"),"application/json");
        assert.equal(headers.get("Copilot-Integration-Id"),"vscode-chat");assert.equal(headers.get("X-GitHub-Api-Version"),"2026-06-01");
        assert.equal(init?.redirect,"error");
        return Response.json(catalogue);
      }
      assert.ok(origins.has(url.origin),"Unowned network, live authorization and inference are forbidden in this generated qualification.");
      return originalFetch(input,init);
    };
    const verify=report=>{
      const {digest,...content}=report;
      assert.equal(report.modelId,model.id);assert.equal(report.apiModelId,model.id);assert.equal(report.providerId,"github-copilot");
      assert.equal(digest,createHash("sha256").update("moguri-model-evidence-v1").update(Buffer.from([0])).update(JSON.stringify(content)).digest("hex"));
      assert.match(report.warning,/not.*independen/i);
      assert.equal(JSON.stringify(report).includes(access),false);assert.equal(JSON.stringify(report).includes("Generated omitted provider data"),false);
    };
    try{
      runtime=await createRuntime({stateDir:${JSON.stringify(stateDir)},retentionKey:Buffer.alloc(32,0x74),platform:{vault,remote:{vault,modelsVault:vault}}});
      origins.add(new URL(runtime.connection.baseUrl).origin);
      sdk=await new MoguriSdk(runtime.connection).ready();await sdk.models.refresh();
      assert.equal(reads,0);assert.ok(backend.reads>0);assert.ok(sdk.getState().snapshot.provider.models.some(value=>value.id===model.id));
      const session=await sdk.sessions.create(null,"Generated explicit catalogue inspector");
      const controls=structuredClone(sdk.getState().snapshot.sessions.find(value=>value.id===session.id).controls),events=runtime.controller.events(0).length;
      const report=(await sdk.models.evidence(model.id)).evidence;verify(report);assert.equal(report.status,"declared");assert.equal(reads,1);
      const run=async args=>JSON.parse((await promisify(execFile)(${JSON.stringify(node)},[${JSON.stringify(join(root, "bin", "moguri.mjs"))},"models",...args],
        {cwd:${JSON.stringify(root)},env:{...process.env,MOGURI_STATE_DIR:${JSON.stringify(stateDir)}},timeout:5000})).stdout);
      verify((await run(["evidence",model.id])).evidence);assert.equal(reads,2);
      const shared=await sdk.slash(session.id,"/model-evidence "+model.id,"tui");assert.equal(shared.kind,"text");verify(JSON.parse(shared.text).evidence);assert.equal(reads,3);
      catalogue={data:[{id:model.id}]};
      const unknown=(await sdk.models.evidence(model.id)).evidence;verify(unknown);assert.equal(unknown.status,"unknown");
      assert.deepEqual(unknown.claimed,{family:null,vendor:null,version:null});assert.equal(reads,4);
      catalogue={data:[{id:model.id,capabilities:{family:access}}]};
      await assert.rejects(()=>sdk.models.evidence(model.id),{code:"model_evidence_secret"});assert.equal(reads,5);
      await assert.rejects(()=>sdk.models.evidence("generated-foreign-model"),{code:"model_evidence_unavailable"});assert.equal(reads,5);
      assert.equal((await sdk.budgets.calls()).calls.length,0);assert.equal(runtime.controller.events(0).length,events);
      assert.deepEqual(runtime.controller.snapshot().sessions.find(value=>value.id===session.id).controls,controls);
      console.log(JSON.stringify({status:"PASS",primitive:"Actual package default Copilot adapter, scoped keyring namespace, SDK/CLI/shared metadata read, unknown/secret/foreign rejection",
        ms:performance.now()-started,reads,modelCalls:0,durableEvidenceEvents:0,secretBackend:"generated memory shim; no OS keychain access",network:"generated catalogue interception and owned loopback only; not live Copilot qualification"}));
    }finally{sdk?.disconnect();try{await runtime?.close();}finally{globalThis.fetch=originalFetch;hooks.deregister();delete globalThis[key];}}
  `;
  const { stdout, stderr } = await promisify(execFile)(node, ["--input-type=module", "--eval", source], { cwd: root, timeout: 20_000, maxBuffer: 1024 * 1024 });
  if (stderr.trim()) process.stderr.write(stderr);
  return JSON.parse(stdout.trim());
}

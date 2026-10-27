import { SettingsHelp, SettingsInput, SettingsTextarea } from "./SettingsFields.tsx";
import { useEffect, useState } from "react";
import { type DependencyPlan, type MoguriSdk, type PackageManager, type Project } from "../../../packages/sdk/src/index.ts";
import type { DependencyRegistryConfig, DependencyRegistryPreview } from "../../../packages/protocol/src/workspace.ts";
import { createCacheApi } from "../../../packages/sdk/src/cache.ts";

export function DependencyCachePanel({ sdk, project, workspaceId }: { sdk: MoguriSdk; project?: Project; workspaceId?: string }) {
  const [manager, setManager] = useState<PackageManager>("npm");
  const [plan, setPlan] = useState<DependencyPlan | null>(null);
  const [accept, setAccept] = useState(false);
  const [replace, setReplace] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState("");
  const [registries, setRegistries] = useState<DependencyRegistryPreview[]>([]);
  const [selectedRegistry, setSelectedRegistry] = useState("");
  const [registryName, setRegistryName] = useState("");
  const [registryUrl, setRegistryUrl] = useState("");
  const [resources, setResources] = useState("");
  const [advisoryUrl, setAdvisoryUrl] = useState("https://api.osv.dev/v1/querybatch");
  const [privateSharing, setPrivateSharing] = useState(false);
  const [reviewRegistry, setReviewRegistry] = useState(false);
  const [token, setToken] = useState("");
  const cache = createCacheApi(sdk);
  useEffect(() => {
    setPlan(null); setAccept(false); setReplace(false); setToken(""); setRegistries([]); setSelectedRegistry(""); setReviewRegistry(false);
    setRegistryName(""); setRegistryUrl(""); setResources(""); setAdvisoryUrl("https://api.osv.dev/v1/querybatch"); setPrivateSharing(false); setError(""); setResult("");
  }, [sdk, project?.id, workspaceId]);
  const invalidate = () => { setPlan(null); setAccept(false); setReplace(false); setReviewRegistry(false); };
  const loadRegistries = async () => { const response = await cache.registries.list(); setRegistries(response.registries); };
  const chooseRegistry = (id: string) => {
    const registry = registries.find((entry) => entry.id === id); setSelectedRegistry(id);
    setRegistryName(registry?.name ?? ""); setRegistryUrl(registry?.url ?? ""); setResources(registry?.packages.join("\n") ?? "");
    setAdvisoryUrl(registry?.advisoryUrl ?? "https://api.osv.dev/v1/querybatch"); setPrivateSharing(registry?.sharePrivateMetadata ?? false); setToken(""); setReviewRegistry(false);
  };
  const run = async (operation: () => Promise<void>) => {
    setError(""); setBusy(true);
    try { await operation(); }
    catch (error) { setError(error instanceof Error ? error.message : "The cache operation failed. No successful install was recorded."); }
    finally { setBusy(false); }
  };
  const operate = (install: boolean) => run(async () => {
    if (!project || !plan || !accept) throw new Error("Inspect the current lock and approve dependency metadata sharing first.");
    if (plan.projectId !== project.id || (plan.workspaceId ?? undefined) !== workspaceId) throw new Error("The project/worktree changed. Inspect its own dependency plan first.");
    if (plan.manager !== manager) throw new Error("The package manager changed. Inspect its exact dependency plan first.");
    const job = install ? await sdk.cache.install(project.id, manager, plan.digest, true, false, workspaceId) : await sdk.cache.prepare(project.id, manager, plan.digest, true, workspaceId);
    setResult(`Job ${job.id} started. Progress, cancellation and its terminal outcome are retained below.`);
  });
  return <section aria-label="Shared dependency cache">
    <SettingsHelp label="More about this setting" target={<h2>Dependency cache</h2>}>Verified archives across projects and branches. Public content may share; private registry content stays within this profile and its exact authorization. Installed trees stay local to each worktree.</SettingsHelp>
    {!project && <p className="settings-warning">Open a project before inspecting its dependencies.</p>}
    <label className="setting-field">Package manager<select value={manager} onChange={(event) => { setManager(event.target.value as PackageManager); setPlan(null); setAccept(false); setReplace(false); }}>
      <option value="npm">npm, lockfile v2/v3 and workspaces</option><option value="pnpm">pnpm, lockfile v9 and workspaces</option>
      <option value="python">Python, hash-pinned binary-wheel cache</option><option value="cargo">Rust / Cargo, locked archive cache</option><option value="go">Go, go.mod / go.sum cache</option>
    </select></label>
    <button disabled={!project || busy} onClick={() => void run(async () => {
      const { plan } = await sdk.cache.inspect(project!.id, manager, workspaceId);
      setPlan(plan); setAccept(false); setReplace(false); setResult("");
    })} aria-label="Inspect current lock">Inspect</button>
    {error && <p className="notice error" role="alert">{error}</p>}
    {plan && plan.projectId === project?.id && <div className="cache-plan">
      <SettingsHelp label="More about this setting" target={<h3>Exact dependency plan</h3>}>Every exact version needs a fresh advisory check before download or reuse. Unknown status, outages and known vulnerabilities block preparation. A clean result is not a guarantee against malicious code.</SettingsHelp>
      <dl className="facts"><dt>Packages</dt><dd>{plan.packages.length}, {plan.cachedPackages} already cached</dd><dt>Manager</dt><dd>{plan.manager}</dd><dt>Lock digest</dt><dd><code>{plan.lockDigest}</code></dd>
        {plan.root && <><dt>Exact install/cache source root</dt><dd><code>{plan.root.path}</code></dd></>}
        {plan.npmCache && <><dt>npm archive cache</dt><dd><code>{plan.npmCache}</code></dd><dt>pnpm archive store</dt><dd><code>{plan.pnpmStore}</code></dd></>}
        {plan.cachePath && <><dt>Native cache</dt><dd><code>{plan.cachePath}</code></dd></>}
        <dt>Execution</dt><dd>{plan.mode === "cache-only" ? "Cache only; no environment install or build" : "Script-free workspace install"}</dd></dl>
      <p className="fine-print">{plan.diagnostic}</p>
      {plan.manifests && <details><summary>Exact root and member inputs ({plan.manifests.length})</summary><pre>{plan.manifests.map((manifest) => `${manifest.path}\n${manifest.digest}`).join("\n\n")}</pre></details>}
      {!!plan.registryScopes?.length && <details open><summary>Private registry and advisory review</summary>{plan.registryScopes.map((scope) => <p key={scope.registryId}><code>{scope.resource}</code><br />Advisory destination: <code>{scope.advisoryUrl}</code><br />Private-name sharing: {scope.metadataSharing ? "explicitly enabled" : "blocked; review registry authorization first"}</p>)}</details>}

      <details><summary>Packages and pinned integrity</summary><pre>{plan.packages.map((entry) => `${entry.name}@${entry.version}${entry.ecosystem === "crates.io" ? " (archive only; build scripts not evaluated)" : entry.hasInstallScript ? " (lifecycle script blocked)" : ""}\n${entry.sourceIntegrity ?? entry.integrity}`).join("\n\n")}</pre></details>
      {plan.readiness && <p className={plan.readiness.ready ? "fine-print" : "settings-warning"}>{plan.readiness.diagnostic}</p>}
      <label className="check-setting"><SettingsInput type="checkbox" checked={accept} onChange={(event) => setAccept(event.target.checked)} />I approve sending these exact dependency names and versions to OSV or the explicitly reviewed private advisory destinations above.</label>
      <div className="button-row"><button disabled={!accept || busy || plan.readiness?.ready === false || plan.registryScopes?.some((scope) => !scope.metadataSharing)} onClick={() => void operate(false)} aria-label="Prepare verified cache">Prepare</button></div>
      {plan.mode !== "cache-only" && <>
        <label className="check-setting"><SettingsInput type="checkbox" checked={replace} onChange={(event) => setReplace(event.target.checked)} />I approve replacing root/member node_modules with a managed, script-free workspace install.</label>
        <button disabled={!accept || !replace || busy || plan.registryScopes?.some((scope) => !scope.metadataSharing)} onClick={() => void operate(true)} aria-label="Install with scripts blocked">Install</button>
      </>}
      <p className="settings-warning">Lifecycle code, Python source builds, Cargo build scripts/proc macros and Go builds need a separately qualified execution boundary. Native executable presence is not containment. No host-build fallback is allowed.</p>
      {!!plan.readiness?.command.length && <details><summary>Native offline cache recipe, after successful preparation</summary><pre>{JSON.stringify(plan.readiness.command, null, 2)}</pre><p className="fine-print">This recipe prepares/downloads dependencies only. It does not authorize executing package code or a build.</p></details>}
    </div>}
    <details><summary>Private npm/pnpm registry authorizations</summary>

      <button disabled={busy} onClick={() => void run(loadRegistries)} aria-label="Review saved registries">Review</button>
      <SettingsHelp label="More about this setting" target={<label className="setting-field">Registry authorization<select value={selectedRegistry} onChange={(event) => chooseRegistry(event.target.value)}><option value="">New authorization</option>{registries.map((registry) => <option key={registry.id} value={registry.id}>{registry.name} · {registry.credential}</option>)}</select></label>} descriptionFirst>No .npmrc, environment token or personal package-manager configuration is imported. Review an HTTPS registry and exact packages or @scope/* resources. Credentials stay in this profile's keychain.</SettingsHelp>
      <label className="setting-field">Name<SettingsInput value={registryName} maxLength={80} onChange={(event) => { setRegistryName(event.target.value); setReviewRegistry(false); }} /></label>
      <label className="setting-field">HTTPS registry resource<SettingsInput value={registryUrl} placeholder="https://packages.example.com/npm/" onChange={(event) => { setRegistryUrl(event.target.value); setReviewRegistry(false); }} /></label>
      <label className="setting-field">Exact packages or @scope/*, one per line<SettingsTextarea value={resources} onChange={(event) => { setResources(event.target.value); setReviewRegistry(false); }} /></label>
      <label className="setting-field">Advisory batch destination<SettingsInput value={advisoryUrl} onChange={(event) => { setAdvisoryUrl(event.target.value); setReviewRegistry(false); }} /></label>
      <label className="check-setting"><SettingsInput type="checkbox" checked={privateSharing} onChange={(event) => { setPrivateSharing(event.target.checked); setReviewRegistry(false); }} />I authorize disclosing these private dependency names and versions to this exact advisory destination. Leave off to block preparation.</label>
      <label className="check-setting"><SettingsInput type="checkbox" checked={reviewRegistry} onChange={(event) => setReviewRegistry(event.target.checked)} />I reviewed this registry, package resources and disclosure choice. Saving replaces its credential authorization; I will enter a token again.</label>
      <button disabled={busy || !reviewRegistry || !registryName || !registryUrl || !resources.trim()} onClick={() => void run(async () => {
        const previous = registries.find((registry) => registry.id === selectedRegistry);
        const config: DependencyRegistryConfig = { name: registryName, url: registryUrl, packages: resources.split(/\r?\n/).map((resource) => resource.trim()).filter(Boolean), advisoryUrl, sharePrivateMetadata: privateSharing };
        const result = await cache.registries.save(config, previous?.revision ?? 0, previous?.id); invalidate(); setSelectedRegistry(result.id ?? ""); await loadRegistries();
      })} aria-label="Save reviewed registry">Save</button>
      {selectedRegistry && <>
        <label className="setting-field">Bearer token<SettingsInput type="password" autoComplete="off" spellCheck={false} value={token} onChange={(event) => setToken(event.target.value)} /></label>
        <div className="button-row">
          <button disabled={busy || !token} onClick={() => void run(async () => { const value = token; setToken(""); invalidate(); await cache.registries.setToken(selectedRegistry, value); await loadRegistries(); })}>Store masked token</button>
          <button disabled={busy} onClick={() => void run(async () => { setToken(""); invalidate(); await cache.registries.clearToken(selectedRegistry); await loadRegistries(); })}>Clear token</button>
          <button disabled={busy || !reviewRegistry} onClick={() => void run(async () => { const registry = registries.find((entry) => entry.id === selectedRegistry); if (!registry) return; invalidate(); setToken(""); await cache.registries.remove(registry.id, registry.revision); chooseRegistry(""); await loadRegistries(); })} aria-label="Revoke reviewed authorization">Revoke</button>
        </div>
      </>}
    </details>
    {result && <p role="status">{result}</p>}
  </section>;
}

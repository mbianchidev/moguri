import { SettingsHelp, SettingsInput, SettingsTextarea } from "./SettingsFields.tsx";
import { useEffect, useState } from "react";
import {
  createCacheApi, type DependencyPlan, type DependencyRegistryConfig, type DependencyRegistryPreview, type MoguriSdk, type PackageManager, type Project,
} from "../../../packages/sdk/src/index.ts";
import { Alert } from "./Alert.tsx";

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
    if (!project || !plan || !accept) throw new Error("Inspect the lockfile and allow sending package names first.");
    if (plan.projectId !== project.id || (plan.workspaceId ?? undefined) !== workspaceId) throw new Error("The project or worktree changed. Inspect it again first.");
    if (plan.manager !== manager) throw new Error("The package manager changed. Inspect again first.");
    const job = install ? await sdk.cache.install(project.id, manager, plan.digest, true, false, workspaceId) : await sdk.cache.prepare(project.id, manager, plan.digest, true, workspaceId);
    setResult(`Job ${job.id} started.`);
  });
  return <section aria-label="Shared dependency cache">
    <SettingsHelp label="More about this setting" target={<h2>Dependency cache</h2>}>Reuses verified package archives across projects and branches. Private registry packages stay in this profile, and each worktree gets its own install.</SettingsHelp>
    {!project && <Alert as="p" tone="warning" className="settings-warning">Open a project to inspect its dependencies.</Alert>}
    <label className="setting-field">Package manager<select value={manager} onChange={(event) => { setManager(event.target.value as PackageManager); setPlan(null); setAccept(false); setReplace(false); }}>
      <option value="npm">npm (lockfile v2/v3, workspaces)</option><option value="pnpm">pnpm (lockfile v9, workspaces)</option>
      <option value="python">Python (hash-pinned wheels)</option><option value="cargo">Rust / Cargo (locked archives)</option><option value="go">Go (go.mod / go.sum)</option>
    </select></label>
    <button disabled={!project || busy} onClick={() => void run(async () => {
      const { plan } = await sdk.cache.inspect(project!.id, manager, workspaceId);
      setPlan(plan); setAccept(false); setReplace(false); setResult("");
    })} aria-label="Inspect current lock">Inspect</button>
    {error && <Alert as="p" className="notice error" role="alert">{error}</Alert>}
    {plan && plan.projectId === project?.id && <div className="cache-plan">
      <SettingsHelp label="More about this setting" target={<h3>Dependency plan</h3>}>Each version is checked against advisories before it's downloaded or reused. Known vulnerabilities, unknown results or an advisory outage block preparation; a clean result doesn't rule out malicious code.</SettingsHelp>
      <dl className="facts"><dt>Packages</dt><dd>{plan.packages.length}, {plan.cachedPackages} already cached</dd><dt>Manager</dt><dd>{plan.manager}</dd><dt>Lock digest</dt><dd><code>{plan.lockDigest}</code></dd>
        {plan.root && <><dt>Source root</dt><dd><code>{plan.root.path}</code></dd></>}
        {plan.npmCache && <><dt>npm archive cache</dt><dd><code>{plan.npmCache}</code></dd><dt>pnpm archive store</dt><dd><code>{plan.pnpmStore}</code></dd></>}
        {plan.cachePath && <><dt>Native cache</dt><dd><code>{plan.cachePath}</code></dd></>}
        <dt>Mode</dt><dd>{plan.mode === "cache-only" ? "Cache only (no install or build)" : "Install with scripts blocked"}</dd></dl>
      <p className="fine-print">{plan.diagnostic}</p>
      {plan.manifests && <details><summary>Manifests ({plan.manifests.length})</summary><pre>{plan.manifests.map((manifest) => `${manifest.path}\n${manifest.digest}`).join("\n\n")}</pre></details>}
      {!!plan.registryScopes?.length && <details open><summary>Private registries</summary>{plan.registryScopes.map((scope) => <p key={scope.registryId}><code>{scope.resource}</code><br />Advisory service: <code>{scope.advisoryUrl}</code><br />Sharing private names: {scope.metadataSharing ? "allowed" : "blocked (allow it in the registry settings below)"}</p>)}</details>}

      <details><summary>Packages and integrity hashes</summary><pre>{plan.packages.map((entry) => `${entry.name}@${entry.version}${entry.ecosystem === "crates.io" ? " (archive only; build scripts not run)" : entry.hasInstallScript ? " (lifecycle script blocked)" : ""}\n${entry.sourceIntegrity ?? entry.integrity}`).join("\n\n")}</pre></details>
      {plan.readiness && <Alert as="p" tone="warning" className={plan.readiness.ready ? "fine-print" : "settings-warning"}>{plan.readiness.diagnostic}</Alert>}
      <label className="check-setting"><SettingsInput type="checkbox" checked={accept} onChange={(event) => setAccept(event.target.checked)} />I agree to send these package names and versions to OSV, or to the private advisory services above.</label>
      <div className="button-row"><button disabled={!accept || busy || plan.readiness?.ready === false || plan.registryScopes?.some((scope) => !scope.metadataSharing)} onClick={() => void operate(false)} aria-label="Prepare verified cache">Prepare</button></div>
      {plan.mode !== "cache-only" && <>
        <label className="check-setting"><SettingsInput type="checkbox" checked={replace} onChange={(event) => setReplace(event.target.checked)} />I want to replace node_modules (root and workspace members) with an install that runs no scripts.</label>
        <button disabled={!accept || !replace || busy || plan.registryScopes?.some((scope) => !scope.metadataSharing)} onClick={() => void operate(true)} aria-label="Install with scripts blocked">Install</button>
      </>}
      <Alert as="p" tone="warning" className="settings-warning">Install scripts, Python source builds, Cargo build scripts and Go builds are blocked: they need a verified sandbox and never fall back to this Mac.</Alert>
      {!!plan.readiness?.command.length && <details><summary>Offline cache command (after Prepare)</summary><pre>{JSON.stringify(plan.readiness.command, null, 2)}</pre><p className="fine-print">This command only fetches dependencies. It doesn't allow running package code or builds.</p></details>}
    </div>}
    <details><summary>Private npm/pnpm registries</summary>

      <button disabled={busy} onClick={() => void run(loadRegistries)} aria-label="Review saved registries">Review</button>
      <SettingsHelp label="More about this setting" target={<label className="setting-field">Registry<select value={selectedRegistry} onChange={(event) => chooseRegistry(event.target.value)}><option value="">New registry</option>{registries.map((registry) => <option key={registry.id} value={registry.id}>{registry.name} · {registry.credential}</option>)}</select></label>} descriptionFirst>Moguri doesn't read your .npmrc or token environment variables. Tokens you add here are stored in this profile's keychain.</SettingsHelp>
      <label className="setting-field">Name<SettingsInput value={registryName} maxLength={80} onChange={(event) => { setRegistryName(event.target.value); setReviewRegistry(false); }} /></label>
      <label className="setting-field">Registry URL (HTTPS)<SettingsInput value={registryUrl} placeholder="https://packages.example.com/npm/" onChange={(event) => { setRegistryUrl(event.target.value); setReviewRegistry(false); }} /></label>
      <label className="setting-field">Packages or @scope/*, one per line<SettingsTextarea value={resources} onChange={(event) => { setResources(event.target.value); setReviewRegistry(false); }} /></label>
      <label className="setting-field">Advisory service URL<SettingsInput value={advisoryUrl} onChange={(event) => { setAdvisoryUrl(event.target.value); setReviewRegistry(false); }} /></label>
      <label className="check-setting"><SettingsInput type="checkbox" checked={privateSharing} onChange={(event) => { setPrivateSharing(event.target.checked); setReviewRegistry(false); }} />I allow sending these private package names and versions to this advisory service. If off, Prepare stays blocked.</label>
      <label className="check-setting"><SettingsInput type="checkbox" checked={reviewRegistry} onChange={(event) => setReviewRegistry(event.target.checked)} />I reviewed this registry, its packages and the sharing choice. Saving resets its token, so I'll enter it again.</label>
      <button disabled={busy || !reviewRegistry || !registryName || !registryUrl || !resources.trim()} onClick={() => void run(async () => {
        const previous = registries.find((registry) => registry.id === selectedRegistry);
        const config: DependencyRegistryConfig = { name: registryName, url: registryUrl, packages: resources.split(/\r?\n/).map((resource) => resource.trim()).filter(Boolean), advisoryUrl, sharePrivateMetadata: privateSharing };
        const result = await cache.registries.save(config, previous?.revision ?? 0, previous?.id); invalidate(); setSelectedRegistry(result.id ?? ""); await loadRegistries();
      })} aria-label="Save reviewed registry">Save</button>
      {selectedRegistry && <>
        <label className="setting-field">Bearer token<SettingsInput type="password" autoComplete="off" spellCheck={false} value={token} onChange={(event) => setToken(event.target.value)} /></label>
        <div className="button-row">
          <button disabled={busy || !token} onClick={() => void run(async () => { const value = token; setToken(""); invalidate(); await cache.registries.setToken(selectedRegistry, value); await loadRegistries(); })}>Save token</button>
          <button disabled={busy} onClick={() => void run(async () => { setToken(""); invalidate(); await cache.registries.clearToken(selectedRegistry); await loadRegistries(); })}>Clear token</button>
          <button disabled={busy || !reviewRegistry} onClick={() => void run(async () => { const registry = registries.find((entry) => entry.id === selectedRegistry); if (!registry) return; invalidate(); setToken(""); await cache.registries.remove(registry.id, registry.revision); chooseRegistry(""); await loadRegistries(); })} aria-label="Revoke reviewed authorization">Revoke</button>
        </div>
      </>}
    </details>
    {result && <Alert as="p" role="status">{result}</Alert>}
  </section>;
}

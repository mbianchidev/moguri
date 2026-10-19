import { useState } from "react";
import { type DependencyPlan, type MoguriSdk, type PackageManager, type Project } from "../../../packages/sdk/src/index.ts";

export function DependencyCachePanel({ sdk, project, workspaceId }: { sdk: MoguriSdk; project?: Project; workspaceId?: string }) {
  const [manager, setManager] = useState<PackageManager>("npm");
  const [plan, setPlan] = useState<DependencyPlan | null>(null);
  const [accept, setAccept] = useState(false);
  const [replace, setReplace] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState("");
  const run = async (operation: () => Promise<void>) => {
    setError(""); setBusy(true);
    try { await operation(); }
    catch (error) { setError(error instanceof Error ? error.message : "The cache operation failed. No successful install was recorded."); }
    finally { setBusy(false); }
  };
  const operate = (install: boolean) => run(async () => {
    if (!project || !plan || !accept) throw new Error("Inspect the current lock and approve dependency metadata sharing first.");
    if (plan.projectId !== project.id || (plan.workspaceId ?? undefined) !== workspaceId) throw new Error("The project/worktree changed. Inspect its own dependency plan first.");
    const job = install ? await sdk.cache.install(project.id, manager, plan.digest, true, false, workspaceId) : await sdk.cache.prepare(project.id, manager, plan.digest, true, workspaceId);
    setResult(`Job ${job.id} started. Progress, cancellation and its terminal outcome are retained below.`);
  });
  return <section aria-label="Shared dependency cache">
    <h2>Shared dependency cache</h2>
    <p>One integrity-addressed archive store for projects and branches. Common package/version/bytes are reused; a changed manifest or lock needs a new plan. Mutable dependency trees stay private to each worktree.</p>
    {!project && <p className="settings-warning">Open a project before inspecting its dependencies.</p>}
    <label className="setting-field">Package manager<select value={manager} onChange={(event) => { setManager(event.target.value as PackageManager); setPlan(null); setAccept(false); setReplace(false); }}>
      <option value="npm">npm, package-lock v2/v3</option><option value="pnpm">pnpm, single-project lockfile v9</option>
    </select></label>
    <button disabled={!project || busy} onClick={() => void run(async () => {
      const { plan } = await sdk.cache.inspect(project!.id, manager, workspaceId);
      setPlan(plan); setAccept(false); setReplace(false); setResult("");
    })}>Inspect current lock</button>
    {error && <p className="notice error" role="alert">{error}</p>}
    {plan && plan.projectId === project?.id && <div className="cache-plan">
      <h3>Exact dependency plan</h3>
      <dl className="facts"><dt>Packages</dt><dd>{plan.packages.length}, {plan.cachedPackages} already cached</dd><dt>Manager</dt><dd>{plan.manager}</dd><dt>Lock digest</dt><dd><code>{plan.lockDigest}</code></dd><dt>Shared npm cache</dt><dd><code>{plan.npmCache}</code></dd><dt>Shared pnpm store</dt><dd><code>{plan.pnpmStore}</code></dd><dt>Lifecycle scripts</dt><dd>Blocked, not run on the host</dd></dl>
      <p className="fine-print">Only public npm-registry packages with SHA-512 integrity are admitted. Every exact version is checked with OSV before download/reuse. Unknown status, outages or known vulnerabilities block admission. A clean advisory result is not a guarantee against malicious code.</p>
      <details><summary>Packages and pinned integrity</summary><pre>{plan.packages.map((entry) => `${entry.name}@${entry.version}${entry.hasInstallScript ? " (lifecycle script blocked)" : ""}\n${entry.integrity}`).join("\n\n")}</pre></details>
      <label className="check-setting"><input type="checkbox" checked={accept} onChange={(event) => setAccept(event.target.checked)} />I approve sending these public dependency names and versions to OSV for advisory checks.</label>
      <div className="button-row"><button disabled={!accept || busy} onClick={() => void operate(false)}>Prepare verified cache</button></div>
      <label className="check-setting"><input type="checkbox" checked={replace} onChange={(event) => setReplace(event.target.checked)} />I approve replacing this project's node_modules with a managed, script-free install.</label>
      <button disabled={!accept || !replace || busy} onClick={() => void operate(true)}>Install with scripts blocked</button>
      <p className="settings-warning">Packages needing lifecycle/native builds may remain unusable. Running those scripts requires a qualified SendBox boundary, which is not available. No Local fallback is allowed.</p>
    </div>}
    {result && <p role="status">{result}</p>}
  </section>;
}

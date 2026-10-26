import { useEffect, useRef, useState } from "react";
import { githubItemIdentity, type GithubItem, type GithubRepository, type GithubResponse, type GithubScope, type GithubSourceBinding, type GithubWorkSource, type MoguriSdk } from "../../../packages/sdk/src/index.ts";

export type GithubProject = Extract<GithubResponse, { type: "github.project" }>;
export interface GithubSelection { context: GithubProject; source: GithubWorkSource; binding: GithubSourceBinding; item: GithubItem; digest: string }

export function GitHubRepositoryPicker({ sdk, selected, choose, disabled }: {
  sdk: MoguriSdk; selected: string; choose: (repository: GithubRepository) => void; disabled: boolean;
}) {
  const [source, setSource] = useState<"account" | "public">("account"), [query, setQuery] = useState("");
  const [page, setPage] = useState<Extract<GithubResponse, { type: "github.repositories" }> | null>(null);
  const [repositories, setRepositories] = useState<GithubRepository[]>([]), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const generation = useRef(0), account = useRef<{ account: string; accountId: string } | null>(null);
  const load = async (number = 1) => {
    const token = ++generation.current; setBusy(true); setError("");
    try {
      const value = await sdk.github.repositories({ source, query, page: number, ...(account.current ?? {}) });
      if (generation.current !== token) return;
      account.current = { account: value.account, accountId: value.accountId }; setPage(value);
      setRepositories((previous) => number === 1 ? value.repositories : [...previous, ...value.repositories.filter((item) => !previous.some((entry) => entry.id === item.id))]);
    } catch (error) { if (generation.current === token) setError(error instanceof Error ? error.message : "Repository discovery failed. Enter an exact URL or check GitHub CLI sign-in."); }
    finally { if (generation.current === token) setBusy(false); }
  };
  useEffect(() => { void load(); return () => { generation.current++; }; }, [sdk]);
  const labels = { owner: "Your repositories", organization: "Your organizations", accessible: "Other accessible repositories", public: "Public repositories" };
  return <section className="github-picker" aria-label="GitHub repository discovery" aria-busy={busy}>
    <label className="setting-field">Repository source<select aria-label="Repository source" value={source} disabled={disabled || busy} onChange={(event) => {
      generation.current++; setSource(event.target.value === "public" ? "public" : "account"); setPage(null); setRepositories([]); setError("");
    }}><option value="account">My GitHub repositories and organizations</option><option value="public">Search public repositories</option></select></label>
    <div className="github-search"><label className="setting-field">{source === "public" ? "Public repository search" : "Find a repository"}<input value={query} disabled={disabled || busy} maxLength={200}
      onChange={(event) => { setQuery(event.target.value); setPage(null); setRepositories([]); }} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void load(); } }} /></label>
      <button type="button" disabled={disabled || busy || source === "public" && !query.trim()} onClick={() => void load()}>{source === "public" ? "Search GitHub" : "Load repositories"}</button></div>
    <label className="setting-field">GitHub repository<select aria-label="GitHub repository" value={repositories.find((entry) => entry.sshUrl === selected || entry.cloneUrl === selected)?.id ?? ""}
      disabled={disabled || busy || !repositories.length} onChange={(event) => { const value = repositories.find((entry) => String(entry.id) === event.target.value); if (value) choose(value); }}>
      <option value="">{busy ? "Loading repositories..." : "Choose a repository"}</option>
      {(["owner", "organization", "accessible", "public"] as const).map((relationship) => repositories.some((item) => item.relationship === relationship) &&
        <optgroup label={labels[relationship]} key={relationship}>{repositories.filter((item) => item.relationship === relationship).map((item) =>
          <option value={item.id} key={item.id}>{item.fullName} / {item.visibility}{item.openSource ? ` / ${item.licenseId}` : ""}</option>)}</optgroup>)}
    </select></label>
    {page && <p className="fine-print" role="status">Signed in as {page.account}. {repositories.length} loaded. Public visibility alone does not establish an open-source license.</p>}
    {page?.nextPage && <button type="button" disabled={disabled || busy} onClick={() => void load(page.nextPage!)}>Load more repositories</button>}
    {error && <p className="inline-error" role="alert">{error}</p>}
    <p className="fine-print">Uses the GitHub CLI account on this Mac, separate from Copilot and updates. No automatic sign-in. You can also enter a repository URL below.</p>
  </section>;
}

export function GitHubItemPicker({ sdk, scope, kind, selectedUrl, select, contextChanged, disabled = false }: {
  sdk: MoguriSdk; scope: GithubScope; kind: "issue" | "pull"; selectedUrl?: string | null;
  select: (selection: GithubSelection | null) => void; contextChanged?: (context: GithubProject) => void; disabled?: boolean;
}) {
  const [context, setContext] = useState<GithubProject | null>(null), [items, setItems] = useState<GithubItem[]>([]);
  const [selected, setSelected] = useState(""), [nextPage, setNextPage] = useState<number | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const generation = useRef(0), callbacks = useRef({ select, contextChanged });
  callbacks.current = { select, contextChanged };
  const scopeKey = JSON.stringify([sdk.profileId, scope, kind, selectedUrl]);
  const read = async (number: number, actual: GithubProject, token: number) => {
    const source: GithubWorkSource = { kind, repository: actual.repository, account: actual.account, accountId: actual.accountId, number };
    const value = await sdk.github.source(scope, source);
    if (value.accountId !== actual.accountId) throw new Error("The selected GitHub account changed. Reload this project's item selection.");
    if (JSON.stringify(value.binding) !== JSON.stringify(actual.binding)) throw new Error("The selected project root or policy changed. Refresh its items before reviewing this source.");
    if (generation.current !== token) return;
    setSelected(String(number)); setItems((items) => items.some((entry) => entry.number === number) ? items : [...items, value.item]);
    callbacks.current.select({ context: actual, source, binding: value.binding, item: value.item, digest: value.digest });
  };
  const load = async (page = 1) => {
    const token = ++generation.current; setBusy(true); setError("");
    try {
      const actual = page === 1 || !context ? await sdk.github.project(scope) : context;
      const value = await sdk.github.browse(scope, { resource: kind === "pull" ? "pulls" : "issues", repository: actual.repository, account: actual.account, page, perPage: 30 });
      if (value.accountId !== actual.accountId) throw new Error("The GitHub account changed. Reload this project's items before selecting one.");
      if (generation.current !== token) return;
      setContext(actual); callbacks.current.contextChanged?.(actual);
      setItems((previous) => page === 1 ? value.items : [...previous, ...value.items.filter((item) => !previous.some((entry) => entry.id === item.id))]);
      setNextPage(value.nextPage);
      if (page === 1 && selectedUrl) {
        const binding = githubItemIdentity(selectedUrl);
        if (binding.repository.toLowerCase() !== actual.repository.toLowerCase() || binding.kind !== kind) throw new Error("The linked item belongs to another repository. It was not read using this project's account.");
        await read(binding.number, actual, token);
      }
    } catch (error) { if (generation.current === token) setError(error instanceof Error ? error.message : "GitHub items could not be read. Check this project's upstream and GitHub CLI sign-in."); }
    finally { if (generation.current === token) setBusy(false); }
  };
  useEffect(() => {
    setItems([]); setContext(null); setSelected(""); callbacks.current.select(null); void load();
    return () => { generation.current++; };
  }, [sdk, scopeKey]);
  const label = kind === "pull" ? "Pull request" : "GitHub issue";
  return <section className="github-picker" aria-label={`${label} picker`} aria-busy={busy}>
    {context && <p className="github-binding"><strong>{context.repository}</strong><small>GitHub account: {context.account} / controller, not SSH</small></p>}
    <label className="setting-field">{label}<select aria-label={label} disabled={disabled || busy || !context} value={selected} onChange={(event) => {
      const value = event.target.value; setSelected(value); callbacks.current.select(null);
      if (!value || !context) return;
      const token = ++generation.current; setBusy(true); setError("");
      void read(Number(value), context, token).catch((error: unknown) => { if (generation.current === token) setError(error instanceof Error ? error.message : "The exact selected item could not be read."); })
        .finally(() => { if (generation.current === token) setBusy(false); });
    }}><option value="">{busy ? "Reading GitHub..." : `Choose ${kind === "pull" ? "a pull request" : "an issue"}`}</option>
      {items.map((item) => <option key={item.id} value={item.number}>#{item.number} {item.title} / {item.draft ? "draft" : item.state}</option>)}</select></label>
    <div className="button-row"><button type="button" disabled={disabled || busy} onClick={() => void load()}>Refresh {kind === "pull" ? "pull requests" : "issues"}</button>
      {nextPage && <button type="button" disabled={disabled || busy} onClick={() => void load(nextPage)}>Load more</button>}</div>
    {error && <p className="inline-error" role="alert">{error}</p>}
    {!busy && context && !items.length && !error && <p className="fine-print">No {kind === "pull" ? "pull requests" : "issues"} on this page. Create one or load another page if available.</p>}
    {busy && <p className="fine-print" role="status">Reading the selected repository and account...</p>}
  </section>;
}

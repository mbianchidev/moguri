import { SettingsHelp, SettingsInput, SettingsTextarea } from "./SettingsFields.tsx";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  createLinearWorkflowApi, defaultBoard, type MoguriSdk, type Project, type Session, type Snapshot,
  type LinearCatalogResource, type LinearEntity, type LinearIssueFields, type LinearOperation, type LinearPhaseMapping, type LinearPreview,
  type LinearProjectFields, type LinearResponse, type LinearSnapshot, type LinearWorkflowInput,
} from "../../../packages/sdk/src/index.ts";
import { Alert } from "./Alert.tsx";

type Action = LinearWorkflowInput["action"];
const actions: { value: Action; label: string }[] = [
  { value: "issue.create", label: "Create Linear issue" }, { value: "issue.update", label: "Update issue fields" },
  { value: "issue.move", label: "Move issue to workflow state" }, { value: "issue.archive", label: "Archive or restore issue" },
  { value: "issue.delete", label: "Delete issue (to Linear trash)" }, { value: "comment.create", label: "Add issue comment" },
  { value: "comment.update", label: "Edit my issue comment" }, { value: "comment.delete", label: "Delete my issue comment" },
  { value: "project.create", label: "Create Linear project" }, { value: "project.update", label: "Update Linear project" },
  { value: "project.archive", label: "Archive or restore Linear project" }, { value: "relation.create", label: "Relate issues" },
  { value: "relation.delete", label: "Remove issue relationship" }, { value: "ticket.sync", label: "Sync a linked local ticket" },
  { value: "ticket.publish", label: "Publish a local ticket to Linear" },
];
const resources: LinearCatalogResource[] = ["teams", "states", "projects", "cycles", "labels", "users", "issues", "comments", "relations"];
const issueOptions = ["stateId", "projectId", "cycleId", "priority", "estimate", "assigneeId", "labelIds", "parentId", "dueDate"] as const;
const labels: Record<string, string> = {
  stateId: "Workflow state", projectId: "Linear project", cycleId: "Cycle", priority: "Priority (0-4)", estimate: "Estimate",
  assigneeId: "Assignee", labelIds: "Labels", parentId: "Parent issue UUID", dueDate: "Due date",
  name: "Project name", description: "Description", content: "Project content", leadId: "Project lead", startDate: "Start date", targetDate: "Target date",
};
const entityName = (entry: LinearEntity) => "name" in entry ? entry.name : entry.kind === "issue" ? `${entry.identifier} - ${entry.title}` : entry.kind === "comment" ? entry.body.slice(0, 80) : `${entry.type}: ${entry.issueId} -> ${entry.relatedIssueId}`;
const pretty = (value: unknown) => JSON.stringify(value, null, 2);

export function LinearWorkflowPanel({ sdk, project, session, snapshot }: { sdk: MoguriSdk; project: Project; session?: Session; snapshot: Snapshot }) {
  const linear = useMemo(() => createLinearWorkflowApi(sdk), [sdk]);
  const uid = useId();
  const board = snapshot.boards.find((entry) => entry.projectId === project.id) ?? defaultBoard(project.id);
  const localIssues = snapshot.issues.filter((entry) => entry.projectId === project.id);
  const [action, setAction] = useState<Action>("issue.create");
  const [issueId, setIssueId] = useState("");
  const [secondaryId, setSecondaryId] = useState("");
  const [localId, setLocalId] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [included, setIncluded] = useState<string[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [selectedLabels, setSelectedLabels] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [direction, setDirection] = useState<"pull" | "push">("pull");
  const [archive, setArchive] = useState(true);
  const [relationType, setRelationType] = useState<"blocks" | "duplicate" | "related">("related");
  const [resource, setResource] = useState<LinearCatalogResource>("issues");
  const [catalog, setCatalog] = useState<Extract<LinearResponse, { type: "linear.workflow.catalog" }> | null>(null);
  const [entities, setEntities] = useState<LinearEntity[]>([]);
  const [review, setReview] = useState<LinearPreview | null>(null);
  const [consent, setConsent] = useState(false);
  const [retained, setRetained] = useState<Extract<LinearResponse, { type: "linear.workflow.read" }> | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const local = localIssues.find((entry) => entry.id === localId);
  const operations = ((snapshot as Snapshot & Partial<LinearSnapshot>).linearOperations ?? []).filter((entry) => entry.projectId === project.id).slice(-20).reverse();
  const prohibitedSession = Boolean(session && (session.controls.env !== "Local" || session.kind !== "agent" || session.mode !== "agent" || session.pendingMode === "read-only" || session.status === "archived"));
  const enabled = board.linear.enabled && Boolean(board.linear.teamId);
  const canWrite = enabled && snapshot.policy.allowedEnvs.includes("Local") && !prohibitedSession;
  const revisionKey = pretty([sdk.profileId, project.id, board.revision, local?.revision, snapshot.policy.revision, snapshot.settings.permissionRevision,
    session?.id, session?.workspaceId, session?.controls.env, session?.kind, session?.mode, session?.pendingMode, session?.status === "archived"]);
  const currentScope = useRef(revisionKey); currentScope.current = revisionKey;
  useEffect(() => { setReview(null); setConsent(false); }, [revisionKey]);
  useEffect(() => { setCatalog(null); setEntities([]); setRetained(null); }, [sdk, project.id, board.revision]);
  const invalidate = () => { setReview(null); setConsent(false); };
  const run = async (operation: (isCurrent: () => boolean) => Promise<void>) => {
    const scope = currentScope.current;
    setBusy(true); setError(""); setNotice("");
    try { await operation(() => currentScope.current === scope); }
    catch (value) { setError(value instanceof Error ? value.message : "Linear couldn't complete this operation. Your fields were kept; check the operation history before trying again."); }
    finally { setBusy(false); }
  };
  const remember = (items: LinearEntity[]) => setEntities((previous) => [...previous.filter((entry) => !items.some((item) => item.id === entry.id)), ...items]);
  const readPage = (next = false) => run(async (isCurrent) => {
    const result = await linear.catalog(project.id, resource, {
      ...(["comments", "relations"].includes(resource) ? { issueId } : {}), ...(next && catalog?.nextCursor ? { cursor: catalog.nextCursor } : {}),
    });
    if (!isCurrent()) return;
    setCatalog(result); remember(result.items);
    setNotice(`${result.identity.actorName} / ${result.identity.workspaceName} / ${result.team.name}. Read page ${result.page}; ${result.items.length} results.${result.limitReached ? " Stopped after five pages, so the list may be incomplete." : ""}`);
  });
  const loadChoices = () => run(async (isCurrent) => {
    const result = await Promise.all((["states", "projects", "cycles", "labels", "users"] as const).map((name) => linear.catalog(project.id, name)));
    if (!isCurrent()) return;
    remember(result.flatMap((entry) => entry.items));
    setNotice("Loaded the first page of states, projects, cycles, labels and team members.");
  });
  const toggle = (key: string, checked: boolean) => { invalidate(); setIncluded((previous) => checked ? [...previous.filter((entry) => entry !== key), key] : previous.filter((entry) => entry !== key)); };
  const setValue = (key: string, value: string) => { invalidate(); setValues((previous) => ({ ...previous, [key]: value })); };
  const optionalFields = (): LinearIssueFields => {
    const fields: LinearIssueFields = {};
    for (const key of issueOptions) {
      if (!included.includes(key)) continue;
      const value = values[key] ?? "";
      if (key === "labelIds") fields.labelIds = selectedLabels;
      else if (key === "priority") {
        if (value === "") throw new Error("Choose a priority (0 means none).");
        fields.priority = Number(value);
      } else if (key === "estimate") fields.estimate = value === "" ? null : Number(value);
      else if (key === "stateId") {
        if (!value) throw new Error("Choose a workflow state; it can't be cleared.");
        fields.stateId = value;
      } else fields[key] = value || null;
    }
    return fields;
  };
  const phaseMapping = (): LinearPhaseMapping => Object.entries(mapping).filter(([, stateId]) => Boolean(stateId)).map(([phaseId, stateId]) => ({ phaseId, stateId }));
  const input = (): LinearWorkflowInput => {
    switch (action) {
      case "issue.create": return { action, fields: { ...optionalFields(), title, description: body } };
      case "issue.update": return { action, issueId, fields: { ...optionalFields(), ...(included.includes("title") ? { title } : {}), ...(included.includes("description") ? { description: body } : {}) } };
      case "issue.move": return { action, issueId, stateId: values.stateId ?? "" };
      case "issue.archive": return { action, issueId, archived: archive };
      case "issue.delete": return { action, issueId };
      case "comment.create": return { action, issueId, body };
      case "comment.update": return { action, issueId, commentId: secondaryId, body };
      case "comment.delete": return { action, issueId, commentId: secondaryId };
      case "project.create":
      case "project.update": {
        const fields: LinearProjectFields = {};
        for (const key of ["name", "description", "content", "leadId", "startDate", "targetDate", "priority"] as const) {
          if (!included.includes(key) && !(key === "name" && action === "project.create")) continue;
          const value = key === "name" ? title : key === "description" ? body : values[key] ?? "";
          if (key === "priority") {
            if (!value) throw new Error("Choose a project priority (0-4).");
            fields.priority = Number(value);
          } else if (["leadId", "startDate", "targetDate"].includes(key)) (fields as Record<string, unknown>)[key] = value || null;
          else (fields as Record<string, unknown>)[key] = value;
        }
        return action === "project.create" ? { action, fields: { ...fields, name: title } } : { action, remoteProjectId: secondaryId, fields };
      }
      case "project.archive": return { action, remoteProjectId: secondaryId, archived: archive };
      case "relation.create": return { action, issueId, relatedIssueId: secondaryId, relationType };
      case "relation.delete": return { action, issueId, relationId: secondaryId };
      case "ticket.sync":
        if (!local) throw new Error("Choose a linked local ticket.");
        return { action, localIssueId: local.id, expectedLocalRevision: local.revision, direction, mapping: phaseMapping() };
      case "ticket.publish":
        if (!local) throw new Error("Choose a local ticket to publish.");
        return { action, localIssueId: local.id, expectedLocalRevision: local.revision, mapping: phaseMapping(), fields: optionalFields() };
    }
  };
  const optionsFor = (key: string) => entities.filter((entry) => (
    key === "stateId" ? entry.kind === "state" : key === "projectId" ? entry.kind === "project" : key === "cycleId" ? entry.kind === "cycle" :
      key === "assigneeId" || key === "leadId" ? entry.kind === "user" : key === "parentId" ? entry.kind === "issue" : false
  ));
  const field = (key: string) => {
    const list = `${uid}-${key}`;
    if (key === "labelIds") return <label className="setting-field">Replace labels with<select aria-label="Replacement Linear labels" multiple value={selectedLabels} onChange={(event) => setSelectedLabels(Array.from(event.target.selectedOptions, (option) => option.value))}>
      {entities.filter((entry) => entry.kind === "label").map((entry) => <option key={entry.id} value={entry.id}>{entityName(entry)}</option>)}
    </select><small>Selecting none removes all labels.</small></label>;
    if (key === "priority") return <label className="setting-field"><span id={`${uid}-priority`}>{labels[key]}</span><select aria-labelledby={`${uid}-priority`} value={values[key] ?? ""} onChange={(event) => setValue(key, event.target.value)}>
      <option value="">Choose priority</option>{["None", "Urgent", "High", "Normal", "Low"].map((label, index) => <option value={index} key={index}>{index} - {label}</option>)}
    </select></label>;
    if (key === "content") return <label className="setting-field">{labels[key]}<SettingsTextarea value={values[key] ?? ""} maxLength={64 * 1024} onChange={(event) => setValue(key, event.target.value)} /></label>;
    return <label className="setting-field">{labels[key]}<SettingsInput
      type={["dueDate", "startDate", "targetDate"].includes(key) ? "date" : key === "estimate" ? "number" : "text"}
      min={key === "estimate" ? 0 : undefined} max={key === "estimate" ? 1000 : undefined} step={key === "estimate" ? 1 : undefined}
      value={values[key] ?? ""} list={optionsFor(key).length ? list : undefined}
      placeholder={key === "stateId" ? "Workflow state UUID" : "Leave blank to clear"}
      onChange={(event) => setValue(key, event.target.value)} />
      {optionsFor(key).length > 0 && <datalist id={list}>{optionsFor(key).map((entry) => <option key={entry.id} value={entry.id}>{entityName(entry)}</option>)}</datalist>}
    </label>;
  };
  const projectAction = action.startsWith("project.");
  const ticketAction = action.startsWith("ticket.");
  const issueTarget = !projectAction && !ticketAction && action !== "issue.create";
  const secondaryLabel = action.startsWith("comment.") ? "Comment UUID" : action === "relation.create" ? "Related issue UUID (same team)" : action === "relation.delete" ? "Relationship UUID" : "Linear project UUID";
  const hasSecondary = ["comment.update", "comment.delete", "project.update", "project.archive", "relation.create", "relation.delete"].includes(action);
  const titleField = ["issue.create", "issue.update", "project.create", "project.update"].includes(action);
  const descriptionField = titleField || ["comment.create", "comment.update"].includes(action);
  const updateFields = action === "issue.update" || action === "project.update";
  const localPreview = review?.document.local;
  const showOperation = (operation: LinearOperation) => run(async () => { setRetained(await linear.read(operation.id)); });
  return <section className="board-configuration linear-workflow-panel" aria-label="Reviewed Linear workflows">
    <header><h2>Linear workflows</h2><p>Local tickets stay local until you publish or push them.</p></header>
    <p className="fine-print">Profile {snapshot.profileId} · {enabled ? `Enabled team ${board.linear.teamId}` : "Off by default. Choose a team and add an API key in the board settings."}</p>
    {!snapshot.policy.allowedEnvs.includes("Local") && <p role="status">Your execution policy blocks Local, so Linear isn't available here.</p>}
    {prohibitedSession && <p role="status">This session runs on a Remote host, is a side chat or is read-only, so it can't change Linear or local tickets.</p>}
    {(error || notice) && <Alert as="p" className={`notice ${error ? "error" : ""}`} role={error ? "alert" : "status"}>{error || notice}</Alert>}
    <fieldset disabled={busy || !enabled || !snapshot.policy.allowedEnvs.includes("Local")}>
      <legend>Browse Linear</legend>
      <div className="button-row"><label className="setting-field"><span id={`${uid}-collection`}>Collection</span><select aria-labelledby={`${uid}-collection`} value={resource} onChange={(event) => { setResource(event.target.value as LinearCatalogResource); setCatalog(null); }}>
        {resources.map((value) => <option key={value} value={value}>{value === "users" ? "Team members / assignees" : value}</option>)}
      </select></label>
        <button type="button" onClick={() => void readPage()}>Read first page</button>
        <button type="button" disabled={!catalog?.nextCursor || catalog.resource !== resource} onClick={() => void readPage(true)}>Read next page</button>
        <button type="button" onClick={() => void loadChoices()}>Load field choices</button>
      </div>
      {["comments", "relations"].includes(resource) && <label className="setting-field">Issue UUID for comments or relationships<SettingsInput value={issueId} onChange={(event) => { invalidate(); setCatalog(null); setIssueId(event.target.value); }} /></label>}
      {catalog && <details open><summary>{catalog.items.length} {catalog.resource}, page {catalog.page}{catalog.limitReached ? " (page limit reached)" : ""}</summary>
        <ul>{catalog.items.map((entry) => <li key={entry.id}><code>{entry.id}</code> - {entityName(entry)}
          {entry.kind === "issue" && <button type="button" onClick={() => { invalidate(); setIssueId(entry.id); }}>Use issue</button>}
          {(entry.kind === "comment" || entry.kind === "relation" || entry.kind === "project") && <button type="button" onClick={() => { invalidate(); setSecondaryId(entry.id); }}>Use {entry.kind}</button>}
        </li>)}</ul></details>}
    </fieldset>
    <form aria-label="Linear operation fields" onChange={invalidate} onSubmit={(event) => {
      event.preventDefault(); void run(async (isCurrent) => {
        const value = await linear.preview({ projectId: project.id, ...(session ? { sessionId: session.id } : {}) }, input());
        if (!isCurrent()) return;
        setReview(value.preview); setConsent(false); setRetained(null);
      });
    }}>
      <fieldset disabled={busy || !canWrite}>
        <legend>Choose changes</legend>
        <label className="setting-field"><span id={`${uid}-operation`}>Operation</span><select aria-labelledby={`${uid}-operation`} value={action} onChange={(event) => { invalidate(); setAction(event.target.value as Action); setIncluded([]); }}>
          {actions.map((entry) => <option key={entry.value} value={entry.value}>{entry.label}</option>)}
        </select></label>
        {issueTarget && <label className="setting-field">Linear issue UUID<SettingsInput value={issueId} required onChange={(event) => setIssueId(event.target.value)} /></label>}
        {hasSecondary && <label className="setting-field">{secondaryLabel}<SettingsInput value={secondaryId} required onChange={(event) => setSecondaryId(event.target.value)} /></label>}
        {ticketAction && <>
          <label className="setting-field"><span id={`${uid}-local-ticket`}>Local ticket</span><select aria-labelledby={`${uid}-local-ticket`} required value={localId} onChange={(event) => setLocalId(event.target.value)}>
            <option value="">Choose local ticket</option>{localIssues.filter((entry) => action === "ticket.publish" ? !entry.linear : Boolean(entry.linear)).map((entry) =>
              <option key={entry.id} value={entry.id}>#{entry.number} {entry.title} · revision {entry.revision}{entry.linear ? ` · ${entry.linear.identifier}` : ""}</option>)}
          </select></label>
          {action === "ticket.sync" && <label className="setting-field"><span id={`${uid}-direction`}>Direction</span><select aria-labelledby={`${uid}-direction`} value={direction} onChange={(event) => setDirection(event.target.value as "pull" | "push")}>
            <option value="pull">Pull title, description, state and archive status from Linear</option><option value="push">Push local title, description and mapped state to Linear</option>
          </select></label>}
          <SettingsHelp label="More about this setting" target={<fieldset><legend>Map board phases to Linear states</legend>
            {board.columns.map((column) => <label className="setting-field" key={column.id}>{column.name}<SettingsInput value={mapping[column.id] ?? ""} list={`${uid}-mapping`}
              placeholder="State UUID, or blank to leave unmapped" onChange={(event) => setMapping((previous) => ({ ...previous, [column.id]: event.target.value }))} /></label>)}
            <datalist id={`${uid}-mapping`}>{entities.filter((entry) => entry.kind === "state").map((entry) => <option key={entry.id} value={entry.id}>{entityName(entry)}</option>)}</datalist>
          </fieldset>}>Only the chosen direction runs, once. If the ticket changes on either side before you send, review it again.</SettingsHelp>

        </>}
        {titleField && <>{updateFields && <label className="check-setting"><SettingsInput type="checkbox" checked={included.includes(projectAction ? "name" : "title")} onChange={(event) => toggle(projectAction ? "name" : "title", event.target.checked)} />Replace {projectAction ? "project name" : "issue title"}</label>}
          <label className="setting-field">{projectAction ? "Project name" : "Issue title"}<SettingsInput value={title} maxLength={160} required={!updateFields || included.includes(projectAction ? "name" : "title")}
            disabled={updateFields && !included.includes(projectAction ? "name" : "title")} onChange={(event) => setTitle(event.target.value)} /></label></>}
        {descriptionField && <>{(updateFields || action === "project.create") && <label className="check-setting"><SettingsInput type="checkbox" checked={included.includes("description")} onChange={(event) => toggle("description", event.target.checked)} />Replace description</label>}
          <label className="setting-field">{action.startsWith("comment.") ? "Comment body" : "Description"}<SettingsTextarea value={body}
            maxLength={projectAction ? 255 : 64 * 1024} required={action.startsWith("comment.")}
            disabled={(updateFields || action === "project.create") && !included.includes("description")} onChange={(event) => setBody(event.target.value)} /></label></>}
        {["issue.create", "issue.update", "ticket.publish"].includes(action) && <fieldset><legend>Optional issue fields (unchecked fields stay unchanged)</legend>
          {issueOptions.filter((key) => action !== "ticket.publish" || key !== "stateId").map((key) => <div key={key}>
            <label className="check-setting"><SettingsInput type="checkbox" checked={included.includes(key)} onChange={(event) => toggle(key, event.target.checked)} />Set {labels[key]!.toLowerCase()}</label>
            {included.includes(key) && field(key)}
          </div>)}</fieldset>}
        {action === "issue.move" && field("stateId")}
        {["project.create", "project.update"].includes(action) && <fieldset><legend>Optional project fields</legend>{["content", "leadId", "startDate", "targetDate", "priority"].map((key) =>
          <div key={key}><label className="check-setting"><SettingsInput type="checkbox" checked={included.includes(key)} onChange={(event) => toggle(key, event.target.checked)} />Set {labels[key]!.toLowerCase()}</label>{included.includes(key) && field(key)}</div>)}</fieldset>}
        {action.endsWith(".archive") && <label className="check-setting"><SettingsInput type="checkbox" checked={archive} onChange={(event) => setArchive(event.target.checked)} />Archive (uncheck to restore)</label>}
        {action === "relation.create" && <label className="setting-field"><span id={`${uid}-relationship`}>Relationship</span><select aria-labelledby={`${uid}-relationship`} value={relationType} onChange={(event) => setRelationType(event.target.value as typeof relationType)}><option value="related">Related</option><option value="blocks">Selected issue blocks related issue</option><option value="duplicate">Selected issue duplicates related issue</option></select></label>}

        <SettingsHelp label="More about this setting" target={<button type="submit" aria-label="Preview exact Linear operation">Preview</button>} descriptionFirst>{action === "issue.delete" && <>Moves the issue to Linear's trash. Recovery follows Linear's trash policy; Moguri can't undo it.</>}</SettingsHelp>
      </fieldset>
    </form>
    {review && <section aria-label="Exact Linear review" className="notice">
      <h3>{review.remoteWrite ? "Review before sending to Linear" : "Review before pulling into local"}</h3>
      <p><strong>{review.document.identity.actorName}</strong> in {review.document.identity.workspaceName} / {review.document.team.name} · {review.document.input.action}</p>
      {localPreview && <dl><dt>Local base</dt><dd>#{localPreview.number}, revision {localPreview.revision} · {localPreview.phaseId}</dd>
        <dt>Remote base</dt><dd>{review.document.remote.filter((entry) => entry.kind === "issue").map((entry) => `${entry.id} · updated ${"updatedAt" in entry ? entry.updatedAt : ""}`).join(", ") || "New issue"}</dd>
        {review.document.localAfter && <><dt>Pull result</dt><dd>{review.document.localAfter.title} · {review.document.localAfter.phaseId} · local revision {review.document.localAfter.revision}</dd></>}
      </dl>}
      <details open><summary>Full request details</summary><pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }} tabIndex={0}>{pretty(review.document)}</pre></details>
      <p className="fine-print">{review.diagnostic}</p>
      <label className="check-setting"><SettingsInput type="checkbox" checked={consent} disabled={busy} onChange={(event) => setConsent(event.target.checked)} />I reviewed these changes, the account, team and direction</label>
      <div className="button-row"><button type="button" className={review.destructive ? "danger" : "primary"} disabled={busy || !consent || !canWrite} onClick={() => void run(async () => {
        const accepted = review; setReview(null); setConsent(false);
        const result = await linear.accept(accepted, true); setNotice(`Operation ${result.id} started. Check its status in the history below.`);
      })} aria-label={review.remoteWrite ? "Send reviewed operation to Linear" : "Apply locally: reviewed Linear pull"}>{review.remoteWrite ? "Send" : "Apply locally"}</button>
        <button type="button" disabled={busy} onClick={invalidate}>Discard review</button></div>
    </section>}
    {operations.length > 0 && <details open><summary>Linear operation history</summary>
      <ul>{operations.map((operation) => <li key={operation.id}>
        <strong>{operation.action}</strong> · {operation.status} · by you
        <button type="button" disabled={busy} onClick={() => void showOperation(operation)} aria-label="View receipt and original inputs">Details</button>
        {operation.status === "running" && <button type="button" disabled={busy || operation.stopRequested} onClick={() => void run(async () => {
          await linear.cancel(operation.id); setNotice("Cancellation requested. Writes already sent to Linear stay partial unless Linear confirmed them.");
        })} aria-label={operation.stopRequested ? "Cancellation requested" : "Cancel owned operation"}>{operation.stopRequested ? "Cancellation requested" : "Cancel"}</button>}
        {operation.diagnostic && <p>{operation.diagnostic}</p>}
      </li>)}</ul>
    </details>}
    {retained && <details open><summary>Operation {retained.operation.id}: {retained.operation.status}</summary>
      <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }} tabIndex={0}>{pretty({ operation: retained.operation, document: retained.document, result: retained.result })}</pre>
    </details>}
  </section>;
}

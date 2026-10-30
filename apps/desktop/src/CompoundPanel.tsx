import { SettingsHelp, SettingsInput, SettingsTextarea } from "./SettingsFields.tsx";
import { useEffect, useRef, useState } from "react";
import { activeCompound, COMPOUND_EVIDENCE_WARNING, type CompoundInput, type CompoundResponse, type MoguriSdk, type Session, type Snapshot } from "../../../packages/sdk/src/index.ts";
import { Alert } from "./Alert.tsx";

type Read = Extract<CompoundResponse, { type: "compound.read" }>;
type Preview = Extract<CompoundResponse, { type: "compound.preview" }>["preview"];
export function CompoundPanel({ sdk, snapshot, session, repositoryReady, draftDirty, onDirty, onSelectCandidate }: {
  sdk: MoguriSdk; snapshot: Snapshot; session?: Session; repositoryReady: boolean; draftDirty: boolean; onDirty: (dirty: boolean) => void; onSelectCandidate: (id: string) => void;
}) {
  const [task, setTask] = useState(""), [plan, setPlan] = useState(""), [architecture, setArchitecture] = useState("");
  const [paths, setPaths] = useState(""), [newPaths, setNewPaths] = useState(""), [draftId, setDraftId] = useState(""), [alternateId, setAlternateId] = useState(""), [scriptId, setScriptId] = useState("");
  const [timeout, setTimeout] = useState("10000"), [baseline, setBaseline] = useState(""), [inputOwner, setInputOwner] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ value: Preview; input: CompoundInput; scope: string } | null>(null), [costReviewed, setCostReviewed] = useState(false);
  const [selectedId, setSelectedId] = useState(""), [read, setRead] = useState<Read | null>(null), [testReviewed, setTestReviewed] = useState(false);
  const [busy, setBusy] = useState(""), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const pending = useRef(false), readGeneration = useRef(0), reviewHeading = useRef<HTMLHeadingElement>(null), outcomeHeading = useRef<HTMLHeadingElement>(null), focusNext = useRef(false);
  const configuration = snapshot.projectConfigurations.find((value) => value.projectId === session?.projectId);
  const owner = JSON.stringify([sdk.profileId, session?.id, session?.projectId, session?.workspaceId, session?.controls.env]);
  const fields = JSON.stringify([task, plan, architecture, paths, newPaths, draftId, alternateId, scriptId, timeout]);
  const empty = !task && !plan && !architecture && !paths && !newPaths && !draftId && !alternateId && !scriptId && timeout === "10000";
  const dirty = !empty && fields !== baseline;
  const changedOwner = inputOwner !== null && inputOwner !== owner;
  const inputScope = JSON.stringify([owner, fields, session?.controls, session?.mode, session?.pendingMode, configuration?.revision,
    snapshot.policy.revision, snapshot.settings.revision, snapshot.settings.permissionRevision]);
  const currentScope = useRef(inputScope); currentScope.current = inputScope;
  const workflows = [...snapshot.compoundWorkflows].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const selected = workflows.find((workflow) => workflow.id === selectedId) ?? (!selectedId ? workflows.find((workflow) => workflow.sessionId === session?.id) : undefined);
  const value = read && selected && read.workflow.id === selected.id && read.workflow.revision === selected.revision ? read : null;
  const review = value?.pendingValidation;
  const local = Boolean(repositoryReady && session?.projectId && session.controls.env === "Local" && session.controls.modelId === "kupo" &&
    snapshot.settings.values.kupo.enabled && snapshot.settings.values.kupo.workflow === "compound" && snapshot.policy.allowedEnvs.includes("Local"));
  const writable = local && session?.kind === "agent" && session.mode === "agent" && session.pendingMode !== "read-only" && session.status !== "archived" && !session.turnId && !draftDirty;
  const ownRunning = Boolean(selected && session && selected.sessionId === session.id && selected.id === session.turnId && activeCompound(selected));
  const stages = snapshot.managedWorkspaces.filter((workspace) => workspace.projectId === session?.projectId && workspace.id !== session?.workspaceId && workspace.status === "ready");
  useEffect(() => { onDirty(dirty || Boolean(busy)); return () => onDirty(false); }, [dirty, busy, onDirty]);
  useEffect(() => { setPreview(null); setCostReviewed(false); }, [inputScope]);
  useEffect(() => { setTestReviewed(false); }, [selected?.id, selected?.revision, snapshot.settings.permissionRevision, snapshot.policy.revision]);
  useEffect(() => {
    const generation = ++readGeneration.current;
    if (!selected) { setRead(null); return; }
    void sdk.compound.read(selected.id).then((value) => { if (generation === readGeneration.current) setRead(value); })
      .catch((error: unknown) => { if (generation === readGeneration.current) setError(error instanceof Error ? error.message : "The exact independently retained workflow could not be read."); });
    return () => { readGeneration.current++; };
  }, [sdk, selected?.id, selected?.revision]);
  useEffect(() => {
    if (!focusNext.current || !value) return;
    const target = value.pendingValidation ? reviewHeading.current : !activeCompound(value.workflow) ? outcomeHeading.current : null;
    if (target) { focusNext.current = false; target.focus(); target.scrollIntoView({ block: "nearest" }); }
  }, [value?.workflow.revision]);
  const edit = (operation: () => void) => { if (inputOwner === null) setInputOwner(owner); operation(); };
  const run = async (name: string, operation: (current: () => boolean) => Promise<void>) => {
    if (pending.current) return;
    pending.current = true; const captured = inputScope;
    setBusy(name); setError(""); setNotice("");
    try { await operation(() => currentScope.current === captured); }
    catch (error) { setError(error instanceof Error ? error.message : "Public workflow was not confirmed. Inputs, pending reviews and independent results were preserved."); }
    finally { pending.current = false; setBusy(""); }
  };
  const reset = () => {
    setTask(""); setPlan(""); setArchitecture(""); setPaths(""); setNewPaths(""); setDraftId(""); setAlternateId(""); setScriptId(""); setTimeout("10000");
    setInputOwner(null); setBaseline(""); setPreview(null); setCostReviewed(false); setError("");
  };
  return <section className="candidate-section" aria-label="Public compound workflows" aria-busy={Boolean(busy)}>
    <SettingsHelp label="More about this setting" target={<h2>Reviewed Cascade / Critique</h2>}>Local host commands are not sandboxed. Detached/reparented containment remains unproven. Exact project-test approval and source application are separate decisions.</SettingsHelp>
    <p className="fine-print">{COMPOUND_EVIDENCE_WARNING}</p>

    {error && <Alert as="p" className="inline-error" role="alert">{error}</Alert>}{notice && <Alert as="p" className="fine-print" role="status">{notice}</Alert>}
    {busy && <p className="fine-print" role="status">{busy}</p>}
    {!local && <Alert as="p" tone="warning" className="settings-warning">Configure an explicitly reviewed Compound routing policy, then select kupo in a Local project agent. This panel never changes Env, model, autonomy or budgets for you.</Alert>}
    {changedOwner && <Alert as="p" tone="warning" className="settings-warning">The source owner changed. Your unsaved task remains visible, but cannot be sent into another project. Copy it or explicitly discard before starting a new review.</Alert>}
    <SettingsHelp label="More about this setting" target={<details open={!selected || dirty}>
      <summary>Prepare exact compound input</summary>
      <label className="setting-field">Current task<SettingsTextarea aria-label="Compound task" value={task} disabled={Boolean(busy) || !writable || changedOwner} maxLength={4096} onChange={(event) => edit(() => setTask(event.target.value))} /></label>
      <label className="setting-field">Reviewed request plan, if supplied<SettingsTextarea aria-label="Compound request plan" value={plan} disabled={Boolean(busy) || !writable || changedOwner} maxLength={8192} onChange={(event) => edit(() => setPlan(event.target.value))} /></label>
      <label className="setting-field">Reviewed request architecture, if supplied<SettingsTextarea aria-label="Compound request architecture" value={architecture} disabled={Boolean(busy) || !writable || changedOwner} maxLength={8192} onChange={(event) => edit(() => setArchitecture(event.target.value))} /></label>
      <label className="setting-field">Existing source files, one exact relative path per line<SettingsTextarea aria-label="Compound source paths" value={paths} disabled={Boolean(busy) || !writable || changedOwner} spellCheck={false} onChange={(event) => edit(() => setPaths(event.target.value))} /></label>
      <label className="setting-field">Explicitly new files, one relative path per line<SettingsTextarea aria-label="Compound new paths" value={newPaths} disabled={Boolean(busy) || !writable || changedOwner} spellCheck={false} onChange={(event) => edit(() => setNewPaths(event.target.value))} /></label>
      <label className="setting-field">Draft worktree<select aria-label="Compound draft worktree" value={draftId} disabled={Boolean(busy) || !writable || changedOwner} onChange={(event) => edit(() => setDraftId(event.target.value))}>
        <option value="">Choose a separate clean owned worktree</option>{stages.map((stage) => <option key={stage.id} value={stage.id}>{stage.branch}</option>)}</select></label>
      <label className="setting-field">Alternate / revision worktree<select aria-label="Compound alternate worktree" value={alternateId} disabled={Boolean(busy) || !writable || changedOwner} onChange={(event) => edit(() => setAlternateId(event.target.value))}>
        <option value="">Choose another clean owned worktree</option>{stages.map((stage) => <option key={stage.id} value={stage.id} disabled={stage.id === draftId}>{stage.branch}</option>)}</select></label>
      <label className="setting-field">Configured project validation script<select aria-label="Compound validation script" value={scriptId} disabled={Boolean(busy) || !writable || changedOwner} onChange={(event) => edit(() => setScriptId(event.target.value))}>
        <option value="">Choose an exact user-configured project script</option>{configuration?.values.scripts.map((script) => <option key={script.id} value={script.id}>{script.name}</option>)}</select></label>
      <label className="setting-field">Test deadline in milliseconds<SettingsInput aria-label="Compound test deadline" type="number" min={100} max={120000} value={timeout} disabled={Boolean(busy) || !writable || changedOwner} onChange={(event) => edit(() => setTimeout(event.target.value))} /></label>
      <div className="button-row"><button disabled={Boolean(busy) || !writable || changedOwner || !task.trim() || !draftId || !alternateId || draftId === alternateId || !scriptId || !paths && !newPaths}
        onClick={() => void run("Reviewing exact compound input", async (current) => {
          if (!session) throw new Error("Choose the exact source session before reviewing a workflow.");
          const files = [];
          for (const path of paths.split(/\r?\n/).filter((path) => path.length)) files.push({ path, baseDigest: (await sdk.workspaces.file(session.id, path)).digest });
          for (const path of newPaths.split(/\r?\n/).filter((path) => path.length)) files.push({ path, baseDigest: "absent" });
          const input: CompoundInput = { sessionId: session.id, draftWorkspaceId: draftId, alternateWorkspaceId: alternateId, input: { task, files },
            requestPlan: plan || null, requestArchitecture: architecture || null, validationScriptId: scriptId, validationTimeoutMs: Number(timeout) };
          const result = await sdk.compound.preview(input);
          if (current()) setPreview({ input, value: result.preview, scope: inputScope });
        })} aria-label="Review compound input">Review</button>
        <button disabled={Boolean(busy) || !dirty && !changedOwner} onClick={reset} aria-label="Discard compound input">Discard</button></div>
      {preview && preview.scope === inputScope && <section className="candidate-binding" aria-label="Exact compound input review">
        <p className="fine-print path">Source: {preview.value.document.source.root}<br />Draft: {preview.value.document.draft.root.root}<br />Alternate: {preview.value.document.alternate.root.root}<br />HEAD: {preview.value.document.source.head}</p>

        {preview.value.document.task.files.map((file) => <details key={file.path} open><summary className="path">{file.path} / base {file.baseDigest}</summary><pre className="workspace-file-content">{file.text ?? "(Reviewed new file)"}</pre></details>)}
        <SettingsHelp label="More about this setting" target={<details><summary>Exact eligible routes, role bounds and system instructions</summary><pre>{JSON.stringify(preview.value.document, null, 2)}</pre></details>} descriptionFirst>8-KiB role results, 16-KiB complete validation context. All-role usage is metered; estimates are not exact billing. No file, test or source application is approved here.</SettingsHelp>
        <label className="check-setting"><SettingsInput aria-label="Reviewed compound input and model cost" type="checkbox" checked={costReviewed} onChange={(event) => setCostReviewed(event.target.checked)} />I reviewed this exact source/context, eligible models, privacy policy and possible model cost. Staging, tests and source acceptance stay separate.</label>
        <button className="primary" disabled={Boolean(busy) || !writable || !costReviewed} onClick={() => void run("Starting bounded reviewed compound work", async () => {
          const captured = preview; setPreview(null); setCostReviewed(false); focusNext.current = true;
          const created = await sdk.compound.start(captured.input, captured.value.digest, true);
          if (!created.id) throw new Error("No original public workflow identity was acknowledged. Inspect retained history before another review.");
          setSelectedId(created.id); setBaseline(fields);
        })} aria-label="Start reviewed compound">Start</button>
      </section>}
    </details>}>At most 20 paths. Selected bases must match the committed clean stages. Original composer drafts, attachments and held prompts are not consumed or implicitly included. Create worktrees and configure scripts explicitly in Project settings.</SettingsHelp>
    <label className="setting-field">Retained compound workflow<select aria-label="Retained compound workflow" value={selected?.id ?? ""} disabled={Boolean(busy)} onChange={(event) => setSelectedId(event.target.value)}>
      {!workflows.length && <option value="">No retained public workflows</option>}{workflows.map((workflow) => <option key={workflow.id} value={workflow.id}>{snapshot.artifacts.find((artifact) => artifact.id === workflow.id)?.name ?? workflow.id} / {workflow.status}</option>)}</select></label>
    {value && <div className="candidate-section">
      <h3 ref={outcomeHeading} tabIndex={-1}>Compound {value.workflow.status}</h3>
      <p className="fine-print">Phase: {value.workflow.phase}. {value.workflow.route ? `Classifier selected ${value.workflow.route.pattern}.` : "No route accepted."} No source acceptance or Git operation is implied.</p>
      {value.workflow.diagnostic && <Alert as="p" className="settings-warning" role="alert">{value.workflow.diagnostic}</Alert>}
      {ownRunning && <button disabled={Boolean(busy)} onClick={() => void run("Requesting owned workflow stop", async () => { await sdk.compound.stop(value.workflow.id); })} aria-label="Stop this compound workflow">Stop</button>}
      {value.roles.map(({ step, input, result }) => <details key={step.planId}><summary>{step.role} / {step.modelId} / {step.state}</summary>
        <p className="fine-print">Untrusted role data, never a user answer, permission or quality proof.</p>{input && <details><summary>Exact model input</summary><pre>{input}</pre></details>}{result && <pre>{result}</pre>}</details>)}
      {value.validations.map(({ validation, document, result }) => <details key={validation.id} open={Boolean(result)}><summary>Project tests / {validation.status}</summary>
        <p className="fine-print path">{document.stage.root}<br /><code>{document.command}</code></p><p className="fine-print">Decision: {validation.decision?.actor ?? "not supplied"}. Dispatched: {String(validation.dispatched)}. Exit: {result?.exitCode ?? "unreported"}. Candidate unchanged: {result ? String(result.candidateUnchanged) : "unreported"}.</p>
        {result && <pre>{result.text}</pre>}{validation.diagnostic && <Alert as="p" tone="warning" className="settings-warning">{validation.diagnostic}</Alert>}</details>)}
      {review && <section className="candidate-binding" aria-label="Exact compound staging and test review">
        <h3 ref={reviewHeading} tabIndex={-1}>Review exact candidate staging and host tests</h3>
        <h4>Plan</h4><pre>{review.document.proposal.plan}</pre><h4>Architecture</h4><pre>{review.document.proposal.architecture}</pre>
        <p className="fine-print path">Source unchanged: {review.document.source.root}<br />Owned candidate: {review.document.stage.root}</p>
        {review.document.proposal.patch.edits.map((edit) => <details key={edit.path} open><summary>{edit.path} / original base {edit.baseDigest}</summary><pre>{edit.text}</pre></details>)}
        <Alert as="p" tone="warning" className="settings-warning">This executes project code on the Local host, not in Sandbox. No automatic dependency install. Hard denials and folder restrictions still win.</Alert>
        <pre>{review.document.command}</pre><p className="fine-print">Deadline: {review.document.timeoutMs} ms. Only these bytes and this exact configured command are proposed. Passing tests and critic advice do not accept source changes.</p>
        <label className="check-setting"><SettingsInput aria-label="Reviewed compound staging and test" type="checkbox" checked={testReviewed} disabled={Boolean(busy) || !ownRunning} onChange={(event) => setTestReviewed(event.target.checked)} />I reviewed the exact candidate bytes, owned root and host command. Approve this staging/test only, not source application.</label>
        <div className="button-row"><button className="primary" disabled={Boolean(busy) || !ownRunning || !testReviewed} onClick={() => void run("Approving exact staging and project tests", async () => {
          setTestReviewed(false); focusNext.current = true;
          await sdk.compound.review(value.workflow.id, review.validationId, value.workflow.revision, review.digest, true);
        })} aria-label="Stage and test using reviewed project script">Stage and test</button>
          <button disabled={Boolean(busy) || !ownRunning} onClick={() => void run("Declining exact staging and tests", async () => {
            setTestReviewed(false); focusNext.current = true;
            await sdk.compound.review(value.workflow.id, review.validationId, value.workflow.revision, review.digest, false);
          })} aria-label="Decline staging and tests">Decline</button></div>
      </section>}
      {value.workflow.status === "proposed" && value.workflow.selectedCandidateId && <button onClick={() => onSelectCandidate(value.workflow.selectedCandidateId!)} aria-label="View candidate recommended by workflow">View candidate</button>}
    </div>}
  </section>;
}

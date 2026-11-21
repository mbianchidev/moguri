import { SettingsHelp, SettingsInput, SettingsTextarea } from "./SettingsFields.tsx";
import { useEffect, useRef, useState } from "react";
import { envLabel, activeCompound, candidateRootBase, candidateRootLabel, type CandidateWorkspace, type CompoundInput, type CompoundResponse, type MoguriSdk, type Session, type Snapshot } from "../../../packages/sdk/src/index.ts";
import { Alert } from "./Alert.tsx";

type Read = Extract<CompoundResponse, { type: "compound.read" }>;
type Preview = Extract<CompoundResponse, { type: "compound.preview" }>["preview"];
export function CompoundPanel({ sdk, snapshot, session, envStages = [], repositoryReady, draftDirty, onDirty, onSelectCandidate }: {
  sdk: MoguriSdk; snapshot: Snapshot; session?: Session; envStages?: CandidateWorkspace[]; repositoryReady: boolean; draftDirty: boolean; onDirty: (dirty: boolean) => void; onSelectCandidate: (id: string) => void;
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
  const local = Boolean(repositoryReady && session?.projectId && session.controls.modelId === "kupo" &&
    snapshot.settings.values.kupo.enabled && snapshot.settings.values.kupo.workflow === "compound" && snapshot.policy.allowedEnvs.includes(session.controls.env));
  const writable = local && session?.kind === "agent" && session.mode === "agent" && session.pendingMode !== "read-only" && session.status !== "archived" && !session.turnId && !draftDirty;
  const ownRunning = Boolean(selected && session && selected.sessionId === session.id && selected.id === session.turnId && activeCompound(selected));
  const stages = session?.controls.env === "Local" ? snapshot.managedWorkspaces.filter((workspace) => workspace.projectId === session?.projectId && workspace.id !== session?.workspaceId && workspace.status === "ready").map((stage) => ({ id: stage.id, label: stage.branch })) :
    envStages.filter((stage) => stage.status === "ready").map((stage) => ({ id: stage.id, label: `${stage.name} / ${envLabel(stage.boundary.env)}` }));
  useEffect(() => { onDirty(dirty || Boolean(busy)); return () => onDirty(false); }, [dirty, busy, onDirty]);
  useEffect(() => { setPreview(null); setCostReviewed(false); }, [inputScope]);
  useEffect(() => { setTestReviewed(false); }, [selected?.id, selected?.revision, snapshot.settings.permissionRevision, snapshot.policy.revision]);
  useEffect(() => {
    const generation = ++readGeneration.current;
    if (!selected) { setRead(null); return; }
    void sdk.compound.read(selected.id).then((value) => { if (generation === readGeneration.current) setRead(value); })
      .catch((error: unknown) => { if (generation === readGeneration.current) setError(error instanceof Error ? error.message : "Couldn't read this workflow."); });
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
    catch (error) { setError(error instanceof Error ? error.message : "The workflow action wasn't confirmed. Your input, reviews and results were kept."); }
    finally { pending.current = false; setBusy(""); }
  };
  const reset = () => {
    setTask(""); setPlan(""); setArchitecture(""); setPaths(""); setNewPaths(""); setDraftId(""); setAlternateId(""); setScriptId(""); setTimeout("10000");
    setInputOwner(null); setBaseline(""); setPreview(null); setCostReviewed(false); setError("");
  };
  return <section className="candidate-section" aria-label="Public compound workflows" aria-busy={Boolean(busy)}>
    <SettingsHelp label="More about this setting" target={<h3>Cascade / Critique</h3>}>Model roles and your project's test script run in the chat's environment; Local and SSH aren't isolated. You approve tests and applying changes separately.</SettingsHelp>
    <p className="fine-print">Passing tests and critic feedback don't approve a change; you apply it yourself.</p>

    {error && <Alert as="p" className="inline-error" role="alert">{error}</Alert>}{notice && <Alert as="p" className="fine-print" role="status">{notice}</Alert>}
    {busy && <p className="fine-print" role="status">{busy}</p>}
    {!local && <Alert as="p" tone="warning" className="settings-warning">To use this, open a chat in a Git project, set Kupo routing to Compound and select kupo as the chat's model. This panel doesn't change the chat's environment, model, autonomy or budget.</Alert>}
    {changedOwner && <Alert as="p" tone="warning" className="settings-warning">The chat's project or environment changed. Your task is kept but can't be sent here; copy or discard it.</Alert>}
    <SettingsHelp label="More about this setting" target={<details open={!selected || dirty}>
      <summary>Prepare a workflow</summary>
      <label className="setting-field">Current task<SettingsTextarea aria-label="Compound task" value={task} disabled={Boolean(busy) || !writable || changedOwner} maxLength={4096} onChange={(event) => edit(() => setTask(event.target.value))} /></label>
      <label className="setting-field">Plan (optional)<SettingsTextarea aria-label="Compound request plan" value={plan} disabled={Boolean(busy) || !writable || changedOwner} maxLength={8192} onChange={(event) => edit(() => setPlan(event.target.value))} /></label>
      <label className="setting-field">Architecture notes (optional)<SettingsTextarea aria-label="Compound request architecture" value={architecture} disabled={Boolean(busy) || !writable || changedOwner} maxLength={8192} onChange={(event) => edit(() => setArchitecture(event.target.value))} /></label>
      <label className="setting-field">Existing files, one relative path per line<SettingsTextarea aria-label="Compound source paths" value={paths} disabled={Boolean(busy) || !writable || changedOwner} spellCheck={false} onChange={(event) => edit(() => setPaths(event.target.value))} /></label>
      <label className="setting-field">New files, one relative path per line<SettingsTextarea aria-label="Compound new paths" value={newPaths} disabled={Boolean(busy) || !writable || changedOwner} spellCheck={false} onChange={(event) => edit(() => setNewPaths(event.target.value))} /></label>
      <label className="setting-field">Draft stage<select aria-label={session?.controls.env === "Local" ? "Compound draft worktree" : "Compound draft stage"} value={draftId} disabled={Boolean(busy) || !writable || changedOwner} onChange={(event) => edit(() => setDraftId(event.target.value))}>
        <option value="">Choose a clean stage</option>{stages.map((stage) => <option key={stage.id} value={stage.id}>{stage.label}</option>)}</select></label>
      <label className="setting-field">Alternate / revision stage<select aria-label={session?.controls.env === "Local" ? "Compound alternate worktree" : "Compound alternate stage"} value={alternateId} disabled={Boolean(busy) || !writable || changedOwner} onChange={(event) => edit(() => setAlternateId(event.target.value))}>
        <option value="">Choose another clean stage</option>{stages.map((stage) => <option key={stage.id} value={stage.id} disabled={stage.id === draftId}>{stage.label}</option>)}</select></label>
      <label className="setting-field">Test script<select aria-label="Compound validation script" value={scriptId} disabled={Boolean(busy) || !writable || changedOwner} onChange={(event) => edit(() => setScriptId(event.target.value))}>
        <option value="">Choose a project script</option>{configuration?.values.scripts.map((script) => <option key={script.id} value={script.id}>{script.name}</option>)}</select></label>
      <label className="setting-field">Test timeout (ms)<SettingsInput aria-label="Compound test deadline" type="number" min={100} max={120000} value={timeout} disabled={Boolean(busy) || !writable || changedOwner} onChange={(event) => edit(() => setTimeout(event.target.value))} /></label>
      <div className="button-row"><button disabled={Boolean(busy) || !writable || changedOwner || !task.trim() || !draftId || !alternateId || draftId === alternateId || !scriptId || !paths && !newPaths}
        onClick={() => void run("Reviewing input", async (current) => {
          if (!session) throw new Error("Choose a chat first.");
          const selectedPaths = paths.split(/\r?\n/).filter((path) => path.length), files: Array<{ path: string; baseDigest: string }> = [];
          if (selectedPaths.length) {
            const source = await sdk.candidates.source(session.id, selectedPaths);
            for (const file of source.files) {
              if (file.text === null) throw new Error("One of the existing files is missing in this environment. List it under New files instead.");
              files.push({ path: file.path, baseDigest: file.baseDigest });
            }
          }
          for (const path of newPaths.split(/\r?\n/).filter((path) => path.length)) files.push({ path, baseDigest: "absent" });
          const input: CompoundInput = { sessionId: session.id, draftWorkspaceId: draftId, alternateWorkspaceId: alternateId, input: { task, files },
            requestPlan: plan || null, requestArchitecture: architecture || null, validationScriptId: scriptId, validationTimeoutMs: Number(timeout) };
          const result = await sdk.compound.preview(input);
          if (current()) setPreview({ input, value: result.preview, scope: inputScope });
        })} aria-label="Review compound input">Review</button>
        <button disabled={Boolean(busy) || !dirty && !changedOwner} onClick={reset} aria-label="Discard compound input">Discard</button></div>
      {preview && preview.scope === inputScope && <section className="candidate-binding" aria-label="Exact compound input review">
        <p className="fine-print path">{candidateRootLabel(preview.value.document.source)}<br />Source: {preview.value.document.source.root}<br />Draft: {preview.value.document.draft.root.root}<br />Alternate: {preview.value.document.alternate.root.root}<br />Base: {candidateRootBase(preview.value.document.source)}</p>

        {preview.value.document.task.files.map((file) => <details key={file.path} open><summary className="path">{file.path} / base {file.baseDigest}</summary><pre className="workspace-file-content">{file.text ?? "(New file)"}</pre></details>)}
        <SettingsHelp label="More about this setting" target={<details><summary>Routes, limits and system prompts</summary><pre>{JSON.stringify(preview.value.document, null, 2)}</pre></details>} descriptionFirst>Every model role is a call that may be billed, and cost estimates are approximate. Starting doesn't run tests or change files.</SettingsHelp>
        <label className="check-setting"><SettingsInput aria-label="Reviewed compound input and model cost" type="checkbox" checked={costReviewed} onChange={(event) => setCostReviewed(event.target.checked)} />I reviewed the files, models, privacy settings and possible cost. Tests and applying changes need separate approval.</label>
        <button className="primary" disabled={Boolean(busy) || !writable || !costReviewed} onClick={() => void run("Starting workflow", async () => {
          const captured = preview; setPreview(null); setCostReviewed(false); focusNext.current = true;
          const created = await sdk.compound.start(captured.input, captured.value.digest, true);
          if (!created.id) throw new Error("The workflow didn't start. Check the workflow list before trying again.");
          setSelectedId(created.id); setBaseline(fields);
        })} aria-label="Start reviewed compound">Start</button>
      </section>}
    </details>}>Up to 20 files. Both stages must be clean and on the same base. Composer drafts and attachments aren't included.</SettingsHelp>
    <label className="setting-field">Workflow<select aria-label="Retained compound workflow" value={selected?.id ?? ""} disabled={Boolean(busy)} onChange={(event) => setSelectedId(event.target.value)}>
      {!workflows.length && <option value="">No workflows yet</option>}{workflows.map((workflow) => <option key={workflow.id} value={workflow.id}>{snapshot.artifacts.find((artifact) => artifact.id === workflow.id)?.name ?? workflow.id} / {workflow.status}</option>)}</select></label>
    {value && <div className="candidate-section">
      <h4 ref={outcomeHeading} tabIndex={-1}>Workflow {value.workflow.status}</h4>
      <p className="fine-print">Phase: {value.workflow.phase} · route: {value.workflow.route ? value.workflow.route.pattern : "none chosen"}</p>
      {value.workflow.diagnostic && <Alert as="p" className="settings-warning" role="alert">{value.workflow.diagnostic}</Alert>}
      {ownRunning && <button disabled={Boolean(busy)} onClick={() => void run("Stopping workflow", async () => { await sdk.compound.stop(value.workflow.id); })} aria-label="Stop this compound workflow">Stop</button>}
      {value.roles.map(({ step, input, result }) => <details key={step.planId}><summary>{step.role} / {step.modelId} / {step.state}</summary>
        <p className="fine-print">Model output. It can't answer for you or approve anything.</p>{input && <details><summary>Model input</summary><pre>{input}</pre></details>}{result && <pre>{result}</pre>}</details>)}
      {value.validations.map(({ validation, document, result }) => <details key={validation.id} open={Boolean(result)}><summary>Project tests / {validation.status}</summary>
        <p className="fine-print path">{document.stage.root}<br /><code>{document.command}</code></p><p className="fine-print">Approved by: {validation.decision?.actor ?? "no one yet"} · started: {String(validation.dispatched)} · exit code: {result?.exitCode ?? "not reported"} · files unchanged by tests: {result ? String(result.candidateUnchanged) : "not reported"}</p>
        {result && <pre>{result.text}</pre>}{validation.diagnostic && <Alert as="p" tone="warning" className="settings-warning">{validation.diagnostic}</Alert>}</details>)}
      {review && <section className="candidate-binding" aria-label="Exact compound staging and test review">
        <h4 ref={reviewHeading} tabIndex={-1}>Review staging and tests</h4>
        <h5>Plan</h5><pre>{review.document.proposal.plan}</pre><h5>Architecture</h5><pre>{review.document.proposal.architecture}</pre>
        <p className="fine-print path">Source (unchanged): {review.document.source.root}<br />Staging: {review.document.stage.root}</p>
        {review.document.proposal.patch.edits.map((edit) => <details key={edit.path} open><summary>{edit.path} / base {edit.baseDigest}</summary><pre>{edit.text}</pre></details>)}
        <Alert as="p" tone="warning" className="settings-warning">This runs project code {review.document.stage.env === "Sandbox" ? "in the Sandbox VM's copy, not your local repository" : review.document.stage.env === "Remote" ? "on the SSH host, which isn't isolated" : "on this Mac, outside Sandbox"}. Dependencies aren't installed automatically, and denied commands and folder rules still apply.</Alert>
        <pre>{review.document.command}</pre><p className="fine-print">Timeout: {review.document.timeoutMs} ms. Passing tests don't apply the change.</p>
        <label className="check-setting"><SettingsInput aria-label="Reviewed compound staging and test" type="checkbox" checked={testReviewed} disabled={Boolean(busy) || !ownRunning} onChange={(event) => setTestReviewed(event.target.checked)} />I reviewed the changes, staging folder and command. Stage and test only; don't apply to my project.</label>
        <div className="button-row"><button className="primary" disabled={Boolean(busy) || !ownRunning || !testReviewed} onClick={() => void run("Staging and testing", async () => {
          setTestReviewed(false); focusNext.current = true;
          await sdk.compound.review(value.workflow.id, review.validationId, value.workflow.revision, review.digest, true);
        })} aria-label="Stage and test using reviewed project script">Stage and test</button>
          <button disabled={Boolean(busy) || !ownRunning} onClick={() => void run("Declining", async () => {
            setTestReviewed(false); focusNext.current = true;
            await sdk.compound.review(value.workflow.id, review.validationId, value.workflow.revision, review.digest, false);
          })} aria-label="Decline staging and tests">Decline</button></div>
      </section>}
      {value.workflow.status === "proposed" && value.workflow.selectedCandidateId && <button onClick={() => onSelectCandidate(value.workflow.selectedCandidateId!)} aria-label="View candidate recommended by workflow">View candidate</button>}
    </div>}
  </section>;
}

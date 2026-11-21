import { useCallback, useEffect, useRef, useState } from "react";
import { isModelReadinessReportCurrent, modelReadinessTargetsMatch,
  type ModelInfo, type ModelReadinessMode, type ModelReadinessReport, type ModelReadinessTarget,
  type ModelRuntimePreview, type MoguriSdk, type Session, type Snapshot } from "../../../packages/sdk/src/index.ts";
import { ModelReadinessPanel, type ModelReadinessPanelProbe } from "./ModelReadinessPanel.tsx";
import { envLabel } from "../../../packages/protocol/src/controls.ts";
import { Alert } from "./Alert.tsx";

interface RuntimeReviewState {
  key: string; busy: boolean; preview: ModelRuntimePreview | null; report: ModelReadinessReport | null; message: string; error: string;
}
const emptyReview = (key: string): RuntimeReviewState => ({ key, busy: false, preview: null, report: null, message: "", error: "" });

export function ModelReadinessView({ sdk, session, model, snapshot }: {
  sdk: MoguriSdk; session: Session; model: ModelInfo; snapshot: Snapshot;
}) {
  const [mode, setMode] = useState<ModelReadinessMode>("informational"), [reload, setReload] = useState(0);
  const [state, setState] = useState<{ scope: string; target: ModelReadinessTarget | null; error: string }>({ scope: "", target: null, error: "" });
  const scope = JSON.stringify([sdk.profileId, sdk.connection.pid, session.id, session.controls.env, session.controls.modelId,
    session.workspaceId, session.sandboxWorkspaceId, session.turnId, model, snapshot.settings.revision, snapshot.policy.revision, reload]);
  const runtimeKey = JSON.stringify([scope, mode]), runtimeOwner = useRef(runtimeKey), runtimeOperation = useRef(0);
  runtimeOwner.current = runtimeKey;
  const runtimeAbort = useRef<AbortController | null>(null);
  const [runtime, setRuntime] = useState<RuntimeReviewState>(() => emptyReview(runtimeKey));
  useEffect(() => {
    runtimeOperation.current++; runtimeAbort.current?.abort(); runtimeAbort.current = null;
    setRuntime(emptyReview(runtimeKey));
    return () => { runtimeOperation.current++; runtimeAbort.current?.abort(); runtimeAbort.current = null; };
  }, [runtimeKey]);
  useEffect(() => {
    const abort = new AbortController();
    setState({ scope, target: null, error: "" });
    void sdk.models.readinessTarget(session.id, model.id, abort.signal).then(({ target }) => {
      if (!abort.signal.aborted) setState({ scope, target, error: "" });
    }).catch((error: unknown) => {
      if (!abort.signal.aborted) setState({ scope, target: null, error: error instanceof Error ? error.message :
        "The original runtime-readiness owner could not be resolved. No another-machine or Local evidence was substituted." });
    });
    return () => abort.abort();
  }, [sdk, scope, session.id, model.id]);
  const probe = useCallback<ModelReadinessPanelProbe>(async ({ target, mode, signal }) => {
    if (state.scope !== scope || !state.target || !modelReadinessTargetsMatch(target, state.target)) {
      throw new Error("Readiness no longer belongs to this exact original profile, session and model.");
    }
    return (await sdk.models.readiness(session.id, model.id, mode, signal)).readiness;
  }, [sdk, session.id, model.id, scope, state.scope, state.target]);
  const current = state.scope === scope;
  const currentRuntime = runtime.key === runtimeKey, runtimeBusy = currentRuntime && runtime.busy;
  const cancelRuntime = () => {
    runtimeOperation.current++; runtimeAbort.current?.abort(); runtimeAbort.current = null;
    setRuntime({ ...emptyReview(runtimeKey), message: "The version review/probe was cancelled. No fresh report or automatic retry; any original issued review/consumption remains retained." });
  };
  const version = async (approve: boolean) => {
    if (runtimeAbort.current) return;
    const target = current ? state.target : null;
    if (!target) { setRuntime({ ...emptyReview(runtimeKey), error: "Resolve this exact execution owner before reviewing a runtime command." }); return; }
    const capturedPreview = currentRuntime ? runtime.preview : null, capturedMode = mode;
    const operation = ++runtimeOperation.current, abort = new AbortController();
    runtimeAbort.current = abort;
    setRuntime({ ...emptyReview(runtimeKey), busy: true, preview: capturedPreview,
      message: approve ? "Retaining the actual-user review, then attempting its exact fixed version command..." : "Reading exact runtime identity without executing its version command..." });
    const owned = () => runtimeOperation.current === operation && runtimeOwner.current === runtimeKey && !abort.signal.aborted;
    try {
      if (!approve) {
        const { preview } = await sdk.models.runtimePreview(session.id, model.id, abort.signal);
        if (!owned()) return;
        if (!modelReadinessTargetsMatch(preview.target, target)) throw new Error("The runtime preview belongs to a changed owner. Reload this exact readiness binding.");
        setRuntime({ ...emptyReview(runtimeKey), preview, message: "Exact command preview ready. Review all source/byte fields before approving." });
      } else {
        if (!capturedPreview || !modelReadinessTargetsMatch(capturedPreview.target, target)) throw new Error("Review this exact current runtime preview before approval; no substitute was authorized.");
        const receipt = await sdk.models.reviewRuntime(session.id, model.id, capturedPreview.digest);
        if (!owned()) return;
        if (!receipt.id) throw new Error("The runtime review has no canonical retained receipt. No attempt or automatic retry was sent.");
        const { readiness } = await sdk.models.readinessWithRuntimeReview(session.id, model.id, receipt.id, capturedMode, abort.signal);
        if (!owned()) return;
        if (readiness.mode !== capturedMode || !isModelReadinessReportCurrent(readiness, target)) throw new Error("The reviewed runtime result is stale or belongs to another owner/mode. No report was adopted.");
        setRuntime({ ...emptyReview(runtimeKey), report: readiness,
          message: "The exact reviewed attempt returned. See observed/unknown fields below; this is not inference, loaded-model health or permission. No automatic retry." });
      }
    } catch (error) {
      if (owned()) setRuntime({ ...emptyReview(runtimeKey), error: error instanceof Error ? error.message :
        "The original runtime review/attempt failed. No fresh report, substitute or automatic retry was produced." });
    } finally {
      if (runtimeOperation.current === operation) {
        runtimeAbort.current = null; setRuntime((value) => value.key === runtimeKey ? { ...value, busy: false } : value);
      }
    }
  };
  return <section aria-label="Execution-machine model readiness">
    <p className="fine-print">Installed runtime and hardware observations belong to the selected execution machine, not automatically to an API server.
      No model, server, download, permission or inference is started.</p>
    <label className="setting-field">Readiness check mode<select aria-label="Readiness check mode" value={mode} disabled={runtimeBusy}
      onChange={(event) => {
        const value = event.target.value;
        if (value !== "required" && value !== "informational") { setState((current) => ({ ...current, error: "Unsupported readiness mode. No preflight changed; reload the exact owner." })); return; }
        setMode(value);
      }}>
      <option value="informational">Informational observations</option><option value="required">Required preflight, without changing model policy</option>
    </select></label>
    {!current || !state.target && !state.error ? <p role="status">Resolving the original execution owner...</p> : null}
    {current && state.error && <Alert as="p" className="inline-error" role="alert">{state.error}</Alert>}
    {current && state.target && <>
      <ModelReadinessPanel target={state.target} onProbe={probe} mode={mode} initialReport={currentRuntime ? runtime.report ?? undefined : undefined} />
      <button type="button" className="quiet" disabled={runtimeBusy} onClick={() => void version(false)}>Review runtime version command</button>
      <button type="button" className="quiet" disabled={!runtimeBusy && !(currentRuntime && runtime.preview)} onClick={cancelRuntime}>Cancel version review/probe</button>
      <p className="fine-print" role="status" aria-atomic="true">{currentRuntime ? runtime.message : ""}</p>
      {currentRuntime && runtime.error && <Alert as="p" className="inline-error" role="alert">{runtime.error}</Alert>}
      {currentRuntime && runtime.preview && <fieldset className="model-runtime-review">
        <legend>Exact runtime version review</legend>
        <dl><dt>Execution Env</dt><dd>{envLabel(runtime.preview.target.env)}</dd>
          <dt>Exact fixed program, no shell</dt><dd><code>{runtime.preview.program.executablePath} --version</code></dd>
          <dt>Working directory</dt><dd>{runtime.preview.program.cwd}</dd>
          <dt>Executable SHA-256</dt><dd>{runtime.preview.executableSha256}</dd>
          <dt>Executable filesystem identity</dt><dd>{runtime.preview.executableIdentityDigest}</dd>
          <dt>Execution root binding</dt><dd>{runtime.preview.target.rootDigest}</dd>
          <dt>Exact preview digest</dt><dd>{runtime.preview.digest}</dd></dl>
        <p className="fine-print">{runtime.preview.warning}</p>
        <button type="button" disabled={runtimeBusy} onClick={() => void version(true)}>Approve once and read version</button>
      </fieldset>}
    </>}
    <button type="button" className="quiet" onClick={() => setReload((value) => value + 1)}>Reload readiness owner</button>
  </section>;
}

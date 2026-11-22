import { useState } from "react";
import { defaultKupoWorkflows, kupoModes, kupoPriceCategory, modelLab, type AutomaticKupoSettings, type KupoWorkflowSettings, type ModelInfo, type Snapshot } from "../../../packages/sdk/src/index.ts";
import { GroupedModelList, modelListItems } from "./GroupedModelList.tsx";
import { SettingsHelp, SettingsInput } from "./SettingsFields.tsx";

type CascadeClass = "economy" | "standard" | "frontier" | "excluded";
const classNames: Record<CascadeClass, string> = { economy: "Economy", standard: "Standard", frontier: "Frontier", excluded: "Not in Cascade" };

/**
 * Automatic Kupo's everyday settings (D56): preferences, the workflows Kupo may choose and each workflow's own options, and
 * the model pool. Every choice saves immediately through `save`, which patches the automatic policy.
 */
export function KupoWorkflowSettings({ snapshot, policy, models, disabled, save, openStartupDefaults }: {
  snapshot: Snapshot; policy: AutomaticKupoSettings; models: ModelInfo[]; disabled: boolean;
  save: (patch: Partial<AutomaticKupoSettings>) => void; openStartupDefaults: () => void;
}) {
  const workflows: KupoWorkflowSettings = policy.workflows ?? defaultKupoWorkflows();
  const setWorkflows = (next: Partial<KupoWorkflowSettings>) => save({ workflows: { ...workflows, ...next } });
  const [pairLeft, setPairLeft] = useState(""), [pairRight, setPairRight] = useState("");
  const labs = [...new Map(models.map(modelLab).filter((lab) => lab.known).map((lab) => [lab.id, lab]))].map(([, lab]) => lab).sort((a, b) => a.name.localeCompare(b.name));
  const labName = (id: string) => labs.find((lab) => lab.id === id)?.name ?? id;
  const detected = (model: ModelInfo): { category: Exclude<CascadeClass, "excluded"> | null; basis: string } => {
    const profile = policy.modelProfiles?.find((entry) => entry.modelId === model.id);
    if (profile) return { category: profile.category, basis: "reviewed profile" };
    if (model.source === "local" && model.endpointBoundary === "loopback") return { category: "economy", basis: "local, no API fee" };
    const price = snapshot.modelPrices?.[model.id];
    return price ? { category: kupoPriceCategory(price.outputUsdPerMillion), basis: `$${price.outputUsdPerMillion}/1M output` } : { category: null, basis: "no known price" };
  };
  const pooled = policy.approvedModelIds.length > 0;
  const items = modelListItems(snapshot, models);
  return <>
    <SettingsHelp label="About Kupo preferences" target={<h3>Preferences</h3>}>Each chat picks a preference in the composer. Kupo then chooses the workflow and models for every request by its complexity.</SettingsHelp>
    <dl className="facts kupo-preferences">{kupoModes.map((mode) => <div key={mode.id}><dt>{mode.name}</dt><dd>{mode.id === "savings" ? "Cheaper models and workflows: Single or Cascade, no frontier models." :
      mode.id === "balanced" ? "Whatever fits best, avoiding frontier models on long, heavy tasks." : mode.id === "performance" ? "Frontier models only for the task, at their highest supported effort: Single, Critique or Council. The classifier may be any model." :
        "Picks Savings, Balanced or Performance for each request from its complexity."}</dd></div>)}</dl>
    <button type="button" className="quiet" onClick={openStartupDefaults}>Choose the default for new chats</button>

    <SettingsHelp label="About Kupo workflows" target={<h3>Workflows</h3>}>Kupo only picks workflows that are on, within the chat's preference. Single is always available. Unpriced models without a reviewed profile run under Balanced rules and need a class override to join Cascade.</SettingsHelp>
    <div className="kupo-workflow"><div className="kupo-workflow-head"><strong>Single</strong><span className="fine-print">One model answers. Always on.</span></div></div>

    <div className="kupo-workflow">
      <label className="check-setting kupo-workflow-head"><SettingsInput type="checkbox" aria-label="Enable Cascade" checked={workflows.cascade.enabled} disabled={disabled}
        onChange={(event) => setWorkflows({ cascade: { ...workflows.cascade, enabled: event.target.checked } })} />
        <span><strong>Cascade</strong><small>A cheaper class drafts; Kupo escalates to a pricier class only if a check finds the draft lacking.</small></span></label>
      {workflows.cascade.enabled && <details><summary>Model classes</summary>
        <p className="fine-print">Classes come from a reviewed profile, local models (economy) or the published output price: up to $5 per million tokens is economy, $20 or more frontier. Override a class or leave a model out of Cascade.</p>
        <GroupedModelList label="Cascade model classes" items={items} emptyText="No enabled models." row={(item) => {
          const found = detected(item.model), chosen = workflows.cascade.classes?.[item.model.id];
          return <label className="setting-field kupo-class-row"><span>{item.model.name}<small>{found.category ? `${classNames[found.category]} (${found.basis})` : `Unclassed (${found.basis})`}</small></span>
            <select aria-label={`Cascade class for ${item.model.name}`} value={chosen ?? ""} disabled={disabled} onChange={(event) => {
              const { [item.model.id]: _previous, ...rest } = workflows.cascade.classes ?? {};
              setWorkflows({ cascade: { ...workflows.cascade, classes: event.target.value ? { ...rest, [item.model.id]: event.target.value as CascadeClass } : rest } });
            }}><option value="">Automatic{found.category ? ` (${classNames[found.category]})` : ""}</option>
              {(Object.keys(classNames) as CascadeClass[]).map((id) => <option key={id} value={id}>{classNames[id]}</option>)}</select></label>;
        }} />
      </details>}
    </div>

    <div className="kupo-workflow">
      <label className="check-setting kupo-workflow-head"><SettingsInput type="checkbox" aria-label="Enable Critique" checked={workflows.critique.enabled} disabled={disabled}
        onChange={(event) => setWorkflows({ critique: { ...workflows.critique, enabled: event.target.checked } })} />
        <span><strong>Critique</strong><small>A model from a different AI lab reviews the draft read-only; the drafter revises if asked.</small></span></label>
      {workflows.critique.enabled && <details><summary>Allowed AI lab pairs</summary>
        <p className="fine-print">{workflows.critique.labPairs.length ? "Only these pairs can critique each other, in either direction." : "Any two different AI labs can critique each other. Add pairs to narrow this."} Labs come from model names and IDs; they don't prove independent training.</p>
        {workflows.critique.labPairs.map(([left, right]) => <div className="button-row" key={`${left}:${right}`}><span>{labName(left)} and {labName(right)}</span>
          <button type="button" disabled={disabled} aria-label={`Remove pair ${labName(left)} and ${labName(right)}`}
            onClick={() => setWorkflows({ critique: { ...workflows.critique, labPairs: workflows.critique.labPairs.filter(([a, b]) => a !== left || b !== right) } })}>Remove</button></div>)}
        <div className="button-row">
          <select aria-label="First AI lab" value={pairLeft} disabled={disabled} onChange={(event) => setPairLeft(event.target.value)}><option value="">First lab</option>{labs.map((lab) => <option key={lab.id} value={lab.id}>{lab.name}</option>)}</select>
          <select aria-label="Second AI lab" value={pairRight} disabled={disabled} onChange={(event) => setPairRight(event.target.value)}><option value="">Second lab</option>{labs.filter((lab) => lab.id !== pairLeft).map((lab) => <option key={lab.id} value={lab.id}>{lab.name}</option>)}</select>
          <button type="button" disabled={disabled || !pairLeft || !pairRight || pairLeft === pairRight ||
            workflows.critique.labPairs.some(([a, b]) => a === pairLeft && b === pairRight || a === pairRight && b === pairLeft)}
            onClick={() => { setWorkflows({ critique: { ...workflows.critique, labPairs: [...workflows.critique.labPairs, [pairLeft, pairRight]] } }); setPairLeft(""); setPairRight(""); }}>Add pair</button>
        </div>
      </details>}
    </div>

    <div className="kupo-workflow">
      <label className="check-setting kupo-workflow-head"><SettingsInput type="checkbox" aria-label="Enable Council" checked={workflows.council.enabled} disabled={disabled}
        onChange={(event) => setWorkflows({ council: { ...workflows.council, enabled: event.target.checked } })} />
        <span><strong>Council</strong><small>Models from at least three AI labs review one draft; the drafter revises with every critique.</small></span></label>
      {workflows.council.enabled && <details><summary>Council members</summary>
        <label className="setting-field">Council size<select aria-label="Council size" value={workflows.council.size} disabled={disabled}
          onChange={(event) => setWorkflows({ council: { ...workflows.council, size: Number(event.target.value) } })}>
          {[3, 4, 5].map((size) => <option key={size} value={size}>{size} models from {size} labs</option>)}</select></label>
        {labs.length < workflows.council.size && <p className="fine-print" role="status">Your enabled models cover {labs.length} AI lab{labs.length === 1 ? "" : "s"}, so Council can't run yet. Enable models from more labs.</p>}
        <p className="fine-print">{workflows.council.labs.length ? "Only checked labs can sit on the council." : "Every lab can sit on the council. Check labs to narrow it."}</p>
        <div className="kupo-lab-list" role="group" aria-label="Council labs">{labs.map((lab) => <label className="check-setting" key={lab.id}>
          <SettingsInput type="checkbox" aria-label={`Council lab ${lab.name}`} checked={workflows.council.labs.includes(lab.id)} disabled={disabled}
            onChange={(event) => setWorkflows({ council: { ...workflows.council, labs: event.target.checked ? [...workflows.council.labs, lab.id] : workflows.council.labs.filter((id) => id !== lab.id) } })} />{lab.name}</label>)}</div>
      </details>}
    </div>

    <SettingsHelp label="About the Kupo model pool" target={<h3>Models</h3>}>Kupo rechecks every model's Env, context and output limits before each call.</SettingsHelp>
    <label className="check-setting"><SettingsInput type="checkbox" aria-label="Use every enabled model" checked={!pooled} disabled={disabled}
      onChange={(event) => save({ approvedModelIds: event.target.checked ? [] : models.map((model) => model.id) })} />Use every enabled model, including ones you add later</label>
    {pooled && <GroupedModelList label="Kupo models" items={items} emptyText="No enabled models." row={(item) =>
      <label className="check-setting"><SettingsInput type="checkbox" aria-label={`Kupo can use ${item.model.name}`} checked={policy.approvedModelIds.includes(item.model.id)}
        disabled={disabled || policy.approvedModelIds.length === 1 && policy.approvedModelIds.includes(item.model.id)}
        onChange={(event) => save({ approvedModelIds: event.target.checked ? [...policy.approvedModelIds, item.model.id] : policy.approvedModelIds.filter((id) => id !== item.model.id) })} /><span>{item.model.name}<small className="path">{item.model.id}</small></span></label>} />}
  </>;
}

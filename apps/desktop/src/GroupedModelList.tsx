import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { modelLab, type ModelInfo, type ModelLab, type ModelPrice, type ModelProvider, type Snapshot } from "../../../packages/sdk/src/index.ts";
import { Icon } from "./Icon.tsx";
import { ProviderLogo, providerLogoId } from "./ProviderLogo.tsx";

/** One model row in a grouped list: the same model may appear under each provider that offers it. */
export interface GroupedModelItem { key: string; model: ModelInfo; provider: Pick<ModelProvider, "id" | "name" | "scope"> | null; price: ModelPrice | null }
export const modelPriceText = (price: ModelPrice | null) => !price ? "Price unknown" : price.inputUsdPerMillion === 0 && price.outputUsdPerMillion === 0 ?
  price.basis === "local-no-api-fee" ? "Free (local)" : "Free" :
  `$${price.inputUsdPerMillion} in / $${price.outputUsdPerMillion} out per 1M${price.basis === "published-api-equivalent" ? " (API equivalent)" : ""}`;
/** Free first, then priced (cheapest output, then input), then unknown. */
const priceRank = (price: ModelPrice | null) => !price ? [2, 0, 0] : price.inputUsdPerMillion === 0 && price.outputUsdPerMillion === 0 ? [0, 0, 0] :
  [1, price.outputUsdPerMillion, price.inputUsdPerMillion];
const byPrice = (a: GroupedModelItem, b: GroupedModelItem) => {
  const [x, y] = [priceRank(a.price), priceRank(b.price)];
  return x[0]! - y[0]! || x[1]! - y[1]! || x[2]! - y[2]! || a.model.name.localeCompare(b.model.name);
};
const byName = (a: GroupedModelItem, b: GroupedModelItem) => a.model.name.localeCompare(b.model.name) || a.model.id.localeCompare(b.model.id);
const providerKey = (item: GroupedModelItem) => item.provider?.id ?? "unknown";

/** Exact offered prices and providers for model lists, from the shared snapshot (D59). */
export function modelListItems(snapshot: Snapshot, models: ModelInfo[]): GroupedModelItem[] {
  const providers = snapshot.provider.catalogue?.providers ?? [];
  return models.map((model) => {
    const provider = providers.find((entry) => entry.id === model.providerId) ??
      (model.source === "copilot" || !model.providerId && !model.source ? providers.find((entry) => entry.scope === "copilot") ?? { id: "github-copilot", name: "GitHub Copilot", scope: "copilot" as const } : null);
    return { key: model.id, model, provider, price: snapshot.modelPrices?.[model.id] ?? null };
  });
}

function FilterMenu({ label, options, selected, onChange }: {
  label: string; options: Array<{ id: string; name: string; count: number }>; selected: string[]; onChange: (next: string[]) => void;
}) {
  const [shown, setShown] = useState(false);
  return <div className="model-filter-menu">
    <button type="button" aria-expanded={shown} aria-label={`Filter by ${label.toLowerCase()}${selected.length ? `, ${selected.length} selected` : ""}`}
      className={selected.length ? "active" : undefined} onClick={() => setShown(!shown)}><Icon name="Filter" />{label}{selected.length ? ` (${selected.length})` : ""}</button>
    {shown && <div className="model-filter-options" role="group" aria-label={label}>
      {options.map((option) => <label className="check-setting" key={option.id}><input type="checkbox" checked={selected.includes(option.id)}
        onChange={(event) => onChange(event.target.checked ? [...selected, option.id] : selected.filter((id) => id !== option.id))} />
        <span>{option.name}<small>{option.count}</small></span></label>)}
      {selected.length > 0 && <button type="button" className="quiet" onClick={() => onChange([])}>Clear {label.toLowerCase()}</button>}
    </div>}
  </div>;
}

/**
 * Model lists grouped by provider, then by AI lab when a provider offers several labs. Every group starts collapsed unless
 * `defaultOpen`; a search or filter opens the groups that match. Order by price puts free models first, then priced, then unknown.
 */
export function GroupedModelList({ label, items, row, query = "", defaultOpen = false, emptyText = "No models.", priceInRow = false }: {
  label: string; items: GroupedModelItem[]; row: (item: GroupedModelItem) => ReactNode; query?: string; defaultOpen?: boolean; emptyText?: string;
  /** The row renders `modelPriceText` itself, for example before its own switch. */
  priceInRow?: boolean;
}) {
  const rendered = (item: GroupedModelItem) => <div key={item.key} className="model-group-row" data-price-in-row={priceInRow || undefined}>{row(item)}
    {!priceInRow && <span className="model-price">{modelPriceText(item.price)}</span>}</div>;
  const [priceOrder, setPriceOrder] = useState(false), [providers, setProviders] = useState<string[]>([]), [labs, setLabs] = useState<string[]>([]);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const labOf = useMemo(() => new Map(items.map((item) => [item.key, modelLab(item.model)])), [items]);
  const lab = (item: GroupedModelItem): ModelLab => labOf.get(item.key)!;
  const providerOptions = [...new Map(items.map((item) => [providerKey(item), item.provider?.name ?? "Other provider"]))]
    .map(([id, name]) => ({ id, name, count: items.filter((item) => providerKey(item) === id).length })).sort((a, b) => a.name.localeCompare(b.name));
  const labOptions = [...new Map(items.map((item) => [lab(item).id, lab(item).name]))]
    .map(([id, name]) => ({ id, name, count: items.filter((item) => lab(item).id === id).length })).sort((a, b) => a.name.localeCompare(b.name));
  const visible = items.filter((item) => (!providers.length || providers.includes(providerKey(item))) && (!labs.length || labs.includes(lab(item).id)));
  const filtering = Boolean(query.trim()) || providers.length > 0 || labs.length > 0;
  const expanded = (key: string) => open[key] ?? (defaultOpen || filtering);
  const toggle = (key: string) => setOpen((current) => ({ ...current, [key]: !expanded(key) }));
  // A row that moves to another provider (for example after choosing its source) stays visible: its new groups open.
  const placement = useRef(new Map<string, string>());
  useEffect(() => {
    const reveal: string[] = [];
    for (const item of items) {
      const group = `provider:${providerKey(item)}`, before = placement.current.get(item.key);
      if (before && before !== group && expanded(before)) reveal.push(group, `${group}:lab:${lab(item).id}`);
      placement.current.set(item.key, group);
    }
    if (reveal.length) setOpen((current) => ({ ...current, ...Object.fromEntries(reveal.map((key) => [key, true])) }));
  });
  const sorted = (list: GroupedModelItem[]) => [...list].sort(priceOrder ? byPrice : byName);
  const groups = providerOptions.map((option) => ({ ...option, items: visible.filter((item) => providerKey(item) === option.id) })).filter((group) => group.items.length);
  const header = (key: string, title: ReactNode, count: number, depth: "provider" | "lab") =>
    <button type="button" className={`model-group-toggle ${depth}`} aria-expanded={expanded(key)} onClick={() => toggle(key)}>
      <Icon name={expanded(key) ? "Down" : "ChevronRight"} />{title}<small>{count}</small>
    </button>;
  return <div className="grouped-model-list" role="group" aria-label={label}>
    <div className="model-list-toolbar">
      <button type="button" className="model-price-order" aria-pressed={priceOrder} onClick={() => setPriceOrder(!priceOrder)}
        title="Free first, then priced from cheapest, then unknown"><Icon name="PriceSort" />Order by price</button>
      <FilterMenu label="Providers" options={providerOptions} selected={providers} onChange={setProviders} />
      <FilterMenu label="AI labs" options={labOptions} selected={labs} onChange={setLabs} />
    </div>
    {groups.map((group) => {
      const provider = group.items[0]!.provider, groupKey = `provider:${group.id}`;
      const labGroups = [...new Set(group.items.map((item) => lab(item).id))];
      return <section className="model-group" key={group.id} aria-label={`${group.name} models`}>
        {header(groupKey, <><ProviderLogo logo={provider ? providerLogoId(provider) : null} fallback="House" /><strong>{group.name}</strong></>, group.items.length, "provider")}
        {expanded(groupKey) && (labGroups.length > 1 ? labGroups.map((id) => labOptions.find((option) => option.id === id)!)
          .sort((a, b) => a.name.localeCompare(b.name)).map((labOption) => {
            const labKey = `${groupKey}:lab:${labOption.id}`, labItems = sorted(group.items.filter((item) => lab(item).id === labOption.id));
            return <div className="model-lab-group" key={labOption.id} role="group" aria-label={`${group.name} ${labOption.name} models`}>
              {header(labKey, <span>{labOption.name}</span>, labItems.length, "lab")}
              {expanded(labKey) && <div className="model-group-rows">{labItems.map(rendered)}</div>}
            </div>;
          }) : <div className="model-group-rows">{sorted(group.items).map(rendered)}</div>)}
      </section>;
    })}
    {!groups.length && <p className="fine-print">{filtering ? "No models match these filters." : emptyText}</p>}
  </div>;
}

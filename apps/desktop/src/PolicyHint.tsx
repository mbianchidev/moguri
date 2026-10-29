import { createContext, useContext, type ReactNode } from "react";
import type { SettingsTab } from "./settings-catalog.ts";
import { InfoTip } from "./Tooltip.tsx";

export type PolicyTarget = "environments" | "tools" | "profile-budget" | "global-budget" | "decisions" | "kupo";
export interface PolicyFocusRequest { target: PolicyTarget; id: string }
export const policyLocations: Record<PolicyTarget, { tab: SettingsTab; heading: string; label: string }> = {
  environments: { tab: "permissions", heading: "policy-environments", label: "Open execution policy" },
  tools: { tab: "permissions", heading: "policy-tools", label: "Open tool policy" },
  "profile-budget": { tab: "budgets", heading: "policy-profile-budget", label: "Open profile budget policy" },
  "global-budget": { tab: "budgets", heading: "policy-global-budget", label: "Open global budget policy" },
  decisions: { tab: "decisions", heading: "policy-decisions", label: "Open decision provider settings" },
  kupo: { tab: "kupo", heading: "policy-kupo", label: "Open Kupo settings" },
};
export const PolicyNavigationContext = createContext<((target: PolicyTarget, prepare?: () => void) => void) | null>(null);

export function PolicyHint({ label, target, children, beforeNavigate, navigationBlocked }: { label: string; target: PolicyTarget; children: ReactNode; beforeNavigate?: () => void; navigationBlocked?: string }) {
  const navigate = useContext(PolicyNavigationContext);
  return <InfoTip label={label} action={navigate && !navigationBlocked ? { label: policyLocations[target].label, select: () => navigate(target, beforeNavigate) } : undefined}>
    {children}{navigationBlocked && <><br /><br />{navigationBlocked}</>}
  </InfoTip>;
}

import { Icon } from "./Icon.tsx";

export type LocationAction = "show-folder" | "open-remote";
export function LocationActions({ open, unavailable = {}, run, announce }: {
  open: (action: LocationAction) => Promise<{ opened: boolean; location: string }>;
  unavailable?: Partial<Record<LocationAction, string>>;
  run: (operation: () => Promise<unknown>) => Promise<void>;
  announce: (message: string) => void;
}) {
  return <>{([{ action: "show-folder", label: "Show local folder", icon: "Files" }, { action: "open-remote", label: "Open remote", icon: "Link" }] as const).map(({ action, label, icon }) =>
    <button key={action} type="button" role="menuitem" disabled={Boolean(unavailable[action])} title={unavailable[action]}
      onClick={() => void run(async () => {
        const { opened, location } = await open(action);
        announce(opened ? `Opened ${location}.` : `Verified ${location} without opening it.`);
      })}><Icon name={icon} />{label}</button>)}</>;
}

import { createContext, forwardRef, useContext, useEffect, useImperativeHandle, useRef, useState, type ComponentPropsWithoutRef, type ReactElement, type ReactNode, type RefObject } from "react";
import { Icon } from "./Icon.tsx";
import { InfoTip, Tooltip } from "./Tooltip.tsx";

const SettingsContext = createContext(false);
export function SettingsFieldsProvider({ children }: { children: ReactNode }) {
  return <SettingsContext.Provider value>{children}</SettingsContext.Provider>;
}
export function SettingsHelp({ label, children, target, descriptionFirst = false }: { label: string; children: ReactNode; target: ReactElement; descriptionFirst?: boolean }) {
  const active = useContext(SettingsContext);
  if (!children) return target;
  const description = active ? <InfoTip label={label}>{children}</InfoTip> : <p className="fine-print">{children}</p>;
  return active ? <div className="settings-help-row">{target}{description}</div> :
    <>{descriptionFirst && description}{target}{!descriptionFirst && description}</>;
}
export function SettingsAction({ label, icon, className = "", ...props }: Omit<ComponentPropsWithoutRef<"button">, "children" | "aria-label"> & { label: string; icon: string }) {
  return <Tooltip content={label}><button {...props} type={props.type ?? "button"} className={`icon-button ${className}`} aria-label={label}><Icon name={icon} /></button></Tooltip>;
}

function CopyField({ input, name, multiline = false, children }: {
  input: RefObject<HTMLInputElement | HTMLTextAreaElement | null>; name?: string; multiline?: boolean; children: ReactNode;
}) {
  const [label, setLabel] = useState(name ?? "field value"), [copied, setCopied] = useState(false), [error, setError] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    setLabel(name ?? input.current?.labels?.[0]?.textContent?.trim() ?? "field value");
  }, [name, input]);
  useEffect(() => () => clearTimeout(timer.current), []);
  const copy = async () => {
    setError(""); setCopied(false);
    try {
      if (!input.current) throw new Error("The field is no longer available to copy.");
      await window.moguri.copyText(input.current.value); setCopied(true);
      clearTimeout(timer.current); timer.current = setTimeout(() => setCopied(false), 2000);
    } catch (error) { setError(error instanceof Error ? error.message : "Copy failed. The field was not changed."); }
  };
  return <span className={`copy-field${multiline ? " multiline" : ""}`}>{children}
    <span className="copy-field-action"><Tooltip content={copied ? "Copied" : "Copy value"}>
      <button type="button" className="icon-button" aria-label={`Copy ${label}`} onClick={(event) => { event.preventDefault(); void copy(); }}><Icon name={copied ? "Check" : "Copy"} /></button>
    </Tooltip></span>
    <span className="sr-only" aria-live="polite" aria-atomic="true">{copied ? `Copied ${label}` : ""}</span>
    {error && <span className="inline-error copy-field-error" role="alert">{error}</span>}
  </span>;
}

export const SettingsInput = forwardRef<HTMLInputElement, ComponentPropsWithoutRef<"input">>(function SettingsInput({ type = "text", ...props }, ref) {
  const active = useContext(SettingsContext);
  const input = useRef<HTMLInputElement>(null);
  useImperativeHandle(ref, () => input.current!, []);
  const field = <input {...props} type={type} role={props.role ?? (active && type === "checkbox" ? "switch" : undefined)} ref={input} />;
  return active && ["text", "search", "url", "email", "tel", "number", "date", "time", "datetime-local"].includes(type) ?
    <CopyField input={input} name={props["aria-label"] ?? props.name}>{field}</CopyField> : field;
});

export const SettingsTextarea = forwardRef<HTMLTextAreaElement, ComponentPropsWithoutRef<"textarea">>(function SettingsTextarea(props, ref) {
  const active = useContext(SettingsContext);
  const input = useRef<HTMLTextAreaElement>(null);
  useImperativeHandle(ref, () => input.current!, []);
  const field = <textarea {...props} ref={input} />;
  return active ? <CopyField input={input} name={props["aria-label"] ?? props.name} multiline>{field}</CopyField> : field;
});

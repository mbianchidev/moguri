import { Children, isValidElement, useState, type HTMLAttributes, type ReactNode } from "react";
import { Icon } from "./Icon.tsx";

type Tone = "info" | "warning" | "error";
interface AlertProps extends HTMLAttributes<HTMLElement> {
  as?: "div" | "p" | "span";
  role?: "alert" | "status";
  tone?: Tone;
  dismissKey?: string | number;
  onDismiss?: () => void;
}
const messageText = (children: ReactNode): string => Children.toArray(children).map((child): string =>
  typeof child === "string" || typeof child === "number" ? String(child) :
    isValidElement<{ children?: ReactNode }>(child) ? messageText(child.props.children) : "").join("");

function restoreFocus(button: HTMLButtonElement) {
  const alert = button.closest(".app-alert");
  if (!alert?.contains(document.activeElement)) return;
  const scope = alert.closest("dialog, [role='dialog']") ?? document;
  const controls = [...scope.querySelectorAll<HTMLElement>("button, input, select, textarea, a[href], [tabindex]")].filter((element) =>
    !alert.contains(element) && element.tabIndex >= 0 && !element.matches(":disabled") && !element.closest("[hidden], [inert]") && element.getClientRects().length > 0);
  const next = controls.find((element) => alert.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING) ?? controls.at(-1);
  next?.focus({ preventScroll: true });
}
function DismissibleAlert({ as: Tag = "div", role, tone, className = "", children, onDismiss, ...props }: Omit<AlertProps, "dismissKey">) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;
  const severity = tone ?? (className.split(/\s+/).includes("settings-warning") ? "warning" : role === "alert" ? "error" : "info");
  const Content = Tag === "div" ? "div" : "span";
  return <Tag {...props} className={`app-alert ${className}`} data-alert-tone={severity} role={role ?? (severity === "error" ? "alert" : "status")}>
    <Content className="app-alert-content">{children}</Content>
    <button type="button" className="icon-button app-alert-dismiss" aria-label="Dismiss alert" title="Dismiss" onClick={(event) => {
      event.preventDefault(); event.stopPropagation(); restoreFocus(event.currentTarget); setDismissed(true); onDismiss?.();
    }}><Icon name="Close" /></button>
  </Tag>;
}
export function Alert({ dismissKey, ...props }: AlertProps) {
  return <DismissibleAlert key={`${props.tone ?? props.role ?? "info"}:${props.className ?? ""}:${dismissKey ?? messageText(props.children)}`} {...props} />;
}

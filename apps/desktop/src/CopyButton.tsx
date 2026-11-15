import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icon.tsx";
import { Tooltip } from "./Tooltip.tsx";
import { Alert } from "./Alert.tsx";
import { sessionShortId } from "../../../packages/sdk/src/index.ts";

export function useCopyFeedback(source: string, operation: () => Promise<void>) {
  const [copied, setCopied] = useState(false), [pending, setPending] = useState(false), [error, setError] = useState("");
  const current = useRef({ source, operation }); current.current = { source, operation };
  const alive = useRef(true), busy = useRef(false), timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => { alive.current = true; return () => { alive.current = false; clearTimeout(timer.current); }; }, []);
  useEffect(() => { clearTimeout(timer.current); setCopied(false); setError(""); }, [source]);
  const copy = async () => {
    if (busy.current) return;
    const original = current.current;
    busy.current = true; setPending(true); setCopied(false); setError(""); clearTimeout(timer.current);
    try {
      await original.operation();
      if (!alive.current || current.current.source !== original.source) return;
      setCopied(true); timer.current = setTimeout(() => { if (alive.current) setCopied(false); }, 2000);
    } catch (error) {
      if (alive.current && current.current.source === original.source) setError(error instanceof Error ? error.message : "Copy failed. Nothing was confirmed.");
    } finally { busy.current = false; if (alive.current) setPending(false); }
  };
  return { copy, copied, pending, error };
}

export function CopyButton({ label, text, source, title = label, className = "", disabled = false }: {
  label: string; text: string | (() => string); source?: string; title?: string; className?: string; disabled?: boolean;
}) {
  const feedback = useCopyFeedback(source ?? (typeof text === "string" ? text : label),
    () => window.moguri.copyText(typeof text === "string" ? text : text()));
  return <>
    <Tooltip content={feedback.copied ? "Copied" : title}><button type="button" className={`icon-button ${className}`} aria-label={label}
      disabled={disabled} aria-busy={feedback.pending || undefined} onClick={(event) => {
        event.preventDefault(); event.stopPropagation(); void feedback.copy();
      }}><Icon name={feedback.copied ? "Check" : "Copy"} /></button></Tooltip>
    <span className="sr-only" role="status">{feedback.copied ? "Copied." : ""}</span>
    {feedback.error && <Alert as="span" className="inline-error" role="alert">{feedback.error}</Alert>}
  </>;
}

export function SessionIdChip({ id }: { id: string }) {
  const short = sessionShortId(id), feedback = useCopyFeedback(id, () => window.moguri.copyText(id));
  return <><Tooltip content={feedback.copied ? "Copied full session ID" : `Session ${id}. Click to copy it, or mention :${short} to attach its reviewed snapshot.`}>
    <button type="button" className="session-id-chip" aria-label={`Copy session ID ${short}`} aria-busy={feedback.pending || undefined}
      onClick={(event) => { event.preventDefault(); event.stopPropagation(); void feedback.copy(); }}><code>{short}</code></button></Tooltip>
    <span className="sr-only" role="status">{feedback.copied ? "Copied." : ""}</span>
    {feedback.error && <Alert as="span" className="inline-error" role="alert">{feedback.error}</Alert>}</>;
}

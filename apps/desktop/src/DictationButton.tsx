import { useEffect, useRef } from "react";
import type { CaptureState } from "./dictation.ts";
import { Icon } from "./Icon.tsx";

export function DictationButton({ state, pushToTalk, recording, disabled, label, title, start, finish, cancel, toggle }: {
  state: CaptureState; pushToTalk: boolean; recording: boolean; disabled: boolean; label: string; title: string;
  start: () => Promise<void>; finish: () => Promise<void>; cancel: (reason?: string) => Promise<void>; toggle: () => void;
}) {
  const held = useRef<number | string | null>(null);
  useEffect(() => { if (state.phase === "idle" || state.phase === "failed") held.current = null; }, [state.phase]);
  const press = (owner: number | string) => {
    if (held.current !== null || disabled || state.cleanupPending || state.phase !== "idle" && state.phase !== "failed") return false;
    held.current = owner; void start(); return true;
  };
  const release = (owner: number | string) => {
    if (held.current !== owner) return;
    held.current = null; void finish();
  };
  const discard = (owner: number | string) => {
    if (held.current !== owner) return;
    held.current = null; void cancel("Push-to-talk was interrupted before release. Raw audio was discarded; inserted words were preserved.");
  };
  return <button className={`icon-button composer-mic ${recording ? "recording" : ""}`} type="button" aria-label={label}
    aria-pressed={state.phase === "recording"} disabled={disabled} title={pushToTalk ? `Hold to record; release to finish. ${title}` : `Click to start or stop recording. ${title}`}
    onPointerDown={(event) => {
      if (!pushToTalk || event.button !== 0) return;
      event.preventDefault();
      if (press(event.pointerId)) event.currentTarget.setPointerCapture(event.pointerId);
    }}
    onPointerUp={(event) => {
      if (!pushToTalk) return;
      event.preventDefault(); release(event.pointerId);
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    }}
    onPointerCancel={(event) => discard(event.pointerId)}
    onLostPointerCapture={(event) => discard(event.pointerId)}
    onKeyDown={(event) => {
      if (!pushToTalk || ![" ", "Enter"].includes(event.key) || event.ctrlKey || event.metaKey || event.altKey || event.nativeEvent.isComposing) return;
      event.preventDefault(); if (!event.repeat) press(event.key);
    }}
    onKeyUp={(event) => {
      if (!pushToTalk || ![" ", "Enter"].includes(event.key)) return;
      event.preventDefault(); release(event.key);
    }}
    onBlur={() => { if (typeof held.current === "string") discard(held.current); }}
    onClick={(event) => { if (!pushToTalk || event.detail === 0) toggle(); }}>
    <Icon name={recording ? "Stop" : "Mic"} />
  </button>;
}

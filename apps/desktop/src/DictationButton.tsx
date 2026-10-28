import type { CaptureState } from "./dictation.ts";
import { Icon } from "./Icon.tsx";

export function DictationButton({ state, recording, disabled, label, title, toggle }: {
  state: CaptureState; recording: boolean; disabled: boolean; label: string; title: string; toggle: () => void;
}) {
  return <button className={`icon-button composer-mic ${recording || state.phase === "recording" ? "recording" : ""}`} type="button" aria-label={label}
    aria-pressed={state.phase === "recording"} disabled={disabled} title={title}
    onKeyDown={(event) => {
      if (event.repeat && [" ", "Enter"].includes(event.key)) event.preventDefault();
    }}
    onClick={toggle}>
    <Icon name="Mic" />
  </button>;
}

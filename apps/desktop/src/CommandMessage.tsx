import { useEffect, useState } from "react";
import type { CommandExecution, MoguriSdk, SlashResult } from "../../../packages/sdk/src/index.ts";
import { Alert } from "./Alert.tsx";
import { CopyButton } from "./CopyButton.tsx";
import { Icon } from "./Icon.tsx";

const response = (result: SlashResult) => result.kind === "text" ? result.text : result.kind === "ok" ? result.message : JSON.stringify(result, null, 2);

export function CommandMessage({ sdk, execution, stop }: { sdk: MoguriSdk; execution: CommandExecution; stop(): void }) {
  const [retry, setRetry] = useState(0);
  const key = JSON.stringify([sdk.profileId, execution.id, execution.revision, execution.resultDigest, retry]);
  const [read, setRead] = useState<{ key: string; input: string; text: string | null; error: string | null }>({ key: "", input: "", text: null, error: null });
  useEffect(() => {
    let current = true;
    const abort = new AbortController();
    void sdk.commands.read(execution.id, abort.signal).then((saved) => {
      if (!current) return;
      if (saved.execution.id !== execution.id || saved.execution.sessionId !== execution.sessionId ||
        saved.execution.profileId !== sdk.profileId || saved.execution.resultDigest !== execution.resultDigest) {
        throw new Error("The original command response changed or belongs to another source. Read its current record again.");
      }
      setRead({ key, input: saved.item.text, text: saved.result ? response(saved.result) : null, error: null });
    }).catch((error: unknown) => {
      if (current) setRead({ key, input: "", text: null, error: error instanceof Error ? error.message : "The original command response could not be read. Its record was preserved." });
    });
    return () => { current = false; abort.abort(); };
  }, [sdk, key]);
  const current = read.key === key, active = ["running", "waiting-client", "claimed"].includes(execution.status);
  return <article className={`message command-message command-${execution.status}`} aria-label={`Command /${execution.name}`} data-command-id={execution.id}>
    <header><Icon name="Terminal" /><strong>/{execution.name}</strong>
      <time>{new Date(execution.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time>
      <span className="outcome" role="status">{execution.status === "waiting-client" ? `Waiting for a compatible ${execution.client} view` : execution.status}</span>
      {current && read.text !== null && <CopyButton className="message-copy" label={`Copy /${execution.name} command response`} text={read.text} />}
    </header>
    {current && read.input && <code className="command-input">{read.input}</code>}
    {execution.diagnostic && <Alert as="p" className={["failed", "partial"].includes(execution.status) ? "inline-error" : "fine-print"}
      role={["failed", "partial"].includes(execution.status) ? "alert" : "status"}>{execution.diagnostic}</Alert>}
    {!current ? <p className="fine-print" role="status">Reading saved response...</p> : read.error ?
      <><Alert as="p" className="inline-error" role="alert">{read.error}</Alert><button type="button" className="quiet" onClick={() => setRetry((value) => value + 1)}>Read saved response again</button></> :
      read.text !== null ? <pre className="command-response" tabIndex={0}>{read.text}</pre> :
        <p className="fine-print">{active ? "No response has been retained yet." : "No response content was retained for this command."}</p>}
    {active && <button type="button" className="quiet" onClick={stop}>Stop command</button>}
  </article>;
}

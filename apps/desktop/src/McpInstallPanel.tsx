import { useState } from "react";
import type { McpServerConfig } from "../../../packages/sdk/src/index.ts";
import { Alert } from "./Alert.tsx";

const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 100) || "server";
const describe = (server: McpServerConfig) => server.transport.type === "stdio" ? [server.transport.command, ...server.transport.args].join(" ") :
  `${server.transport.url}${server.transport.auth === "none" ? "" : ` (${server.transport.auth === "oauth" ? "OAuth" : "bearer token"})`}`;

/**
 * Install, switch and remove MCP servers (D59). Shared by Capabilities / MCP and Settings / MCP gateway. Switches and removal
 * save immediately; a new server is a written value and saves with Add server. Credentials, OAuth and tool discovery stay in
 * Settings / MCP gateway; adding a server grants no tool permission.
 */
export function McpInstallPanel({ servers, disabled, save, openSettings }: {
  servers: McpServerConfig[]; disabled: boolean; save: (next: McpServerConfig[]) => Promise<void>; openSettings?: () => void;
}) {
  const [name, setName] = useState(""), [kind, setKind] = useState<"stdio" | "http">("stdio"), [command, setCommand] = useState(""), [args, setArgs] = useState("");
  const [url, setUrl] = useState(""), [auth, setAuth] = useState<"none" | "bearer" | "oauth">("none"), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const run = async (next: McpServerConfig[], after?: () => void) => {
    setBusy(true); setError("");
    try { await save(next); after?.(); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "The MCP servers weren't saved. Nothing else changed."); }
    finally { setBusy(false); }
  };
  const add = () => {
    let id = slug(name);
    for (let index = 2; servers.some((server) => server.id === id); index++) id = `${slug(name)}-${index}`;
    const transport: McpServerConfig["transport"] = kind === "stdio" ? { type: "stdio", command: command.trim(), args: args.split("\n").map((value) => value.trim()).filter(Boolean) } :
      { type: "http", url: url.trim(), auth };
    void run([...servers, { id, name: name.trim(), enabled: true, transport }], () => { setName(""); setCommand(""); setArgs(""); setUrl(""); setAuth("none"); });
  };
  const ready = name.trim() && (kind === "stdio" ? command.trim() : url.trim());
  const locked = disabled || busy;
  return <section className="mcp-install" aria-label="MCP servers">
    {servers.length ? <ul className="mcp-server-list">{servers.map((server) => <li key={server.id}>
      <label className="check-setting"><input type="checkbox" role="switch" aria-label={`Enable MCP server ${server.name}`} checked={server.enabled} disabled={locked}
        onChange={(event) => void run(servers.map((entry) => entry.id === server.id ? { ...entry, enabled: event.target.checked } : entry))} />
        <span><strong>{server.name}</strong><small className="path">{describe(server)}</small></span></label>
      <button type="button" disabled={locked} aria-label={`Remove MCP server ${server.name}`} onClick={() => void run(servers.filter((entry) => entry.id !== server.id))}>Remove</button>
    </li>)}</ul> : <p className="fine-print">No MCP servers yet.</p>}
    <fieldset className="mcp-add" disabled={locked}><legend>Add a server</legend>
      <label className="setting-field">Name<input aria-label="MCP server name" value={name} maxLength={120} onChange={(event) => setName(event.target.value)} placeholder="GitHub tools" /></label>
      <label className="setting-field">Runs as<select aria-label="MCP server type" value={kind} onChange={(event) => setKind(event.target.value as "stdio" | "http")}>
        <option value="stdio">A command on this Mac (stdio)</option><option value="http">A remote URL (Streamable HTTP)</option></select></label>
      {kind === "stdio" ? <>
        <label className="setting-field">Command<input aria-label="MCP server command" value={command} maxLength={4096} onChange={(event) => setCommand(event.target.value)} placeholder="npx" /></label>
        <label className="setting-field">Arguments, one per line<textarea aria-label="MCP server arguments" rows={3} value={args} onChange={(event) => setArgs(event.target.value)} placeholder={"-y\n@scope/mcp-server"} /></label>
      </> : <>
        <label className="setting-field">URL<input aria-label="MCP server URL" type="url" value={url} maxLength={2048} onChange={(event) => setUrl(event.target.value)} placeholder="https://example.com/mcp" /></label>
        <label className="setting-field">Sign-in<select aria-label="MCP server sign-in" value={auth} onChange={(event) => setAuth(event.target.value as "none" | "bearer" | "oauth")}>
          <option value="none">None</option><option value="bearer">Bearer token</option><option value="oauth">OAuth</option></select></label>
      </>}
      <div className="button-row"><button type="button" className="primary" disabled={!ready} onClick={add}>Add server</button>
        {openSettings && <button type="button" onClick={openSettings}>Credentials and tools in Settings</button>}</div>
    </fieldset>
    <p className="fine-print">Servers run only when a chat uses them, and every tool call still needs your normal approval. Store tokens and sign in from Settings / MCP gateway.</p>
    {error && <Alert as="p" className="inline-error" role="alert">{error}</Alert>}
  </section>;
}

import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import { MoguriClient } from "../../../packages/client/src/index.ts";
import "./styles.css";

const root = createRoot(document.getElementById("root")!);
try {
  const connection = await window.moguri.connection();
  const client = new MoguriClient(connection, () => window.moguri.connection());
  root.render(<App client={client} />);
  await client.connect();
} catch (error) {
  root.render(<main className="startup-error"><h1>Moguri could not connect</h1><p>{error instanceof Error ? error.message : "Inspect the local service log, then reopen Moguri."}</p></main>);
}

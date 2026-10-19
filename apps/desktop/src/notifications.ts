import type { Attention, Snapshot, StoredEvent } from "../../../packages/protocol/src/index.ts";

export interface Banner { id: string; sessionId: string; title: string; body: string; kind: Attention["kind"] }
const bounded = (text: string, limit: number) => Array.from(text.replace(/[\x00-\x1f\x7f]/g, " ")).slice(0, limit).join("");
export class AttentionNotifier {
  private cursor: number;
  constructor(baseline: number) { this.cursor = baseline; }
  observe(snapshot: Snapshot, events: StoredEvent[], focused: boolean, show: (banner: Banner) => void): void {
    for (const event of events) {
      if (event.seq <= this.cursor || event.seq > snapshot.seq) continue;
      this.cursor = event.seq;
      if (event.event_type !== "attention.raised") continue;
      const attention = snapshot.attention.find((entry) => entry.id === event.payload.attention.id);
      if (!attention) continue;
      if (!snapshot.settings.values.notifications.os || focused || !attention.active || attention.acknowledged) continue;
      const session = snapshot.sessions.find((session) => session.id === attention.sessionId);
      const generic = attention.kind === "question" ? "A session may be asking a question." : attention.kind === "done" ? "Agent done and waiting." : attention.reason === "approval" ? "A session needs your approval." : "Work needs inspection.";
      show({ id: attention.id, sessionId: attention.sessionId, kind: attention.kind, title: "Moguri", body: snapshot.settings.values.notifications.previewContent && session ? `${bounded(session.title, 100)}: ${bounded(session.messages.findLast((message) => message.role === "assistant")?.text ?? generic, 160)}` : generic });
    }
  }
}

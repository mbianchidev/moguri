import type { Attention, Snapshot, StoredEvent } from "../../../packages/protocol/src/index.ts";

export interface Banner { id: string; sessionId: string; title: string; body: string; kind: Attention["kind"] }
export interface NotificationTone { sessionId: string; kind: "needs-input" | "completed"; soundId: string }
const bounded = (text: string, limit: number) => Array.from(text.replace(/[\x00-\x1f\x7f]/g, " ")).slice(0, limit).join("");
export class AttentionNotifier {
  private cursor: number;
  constructor(baseline: number) { this.cursor = baseline; }
  observe(snapshot: Snapshot, events: StoredEvent[], focused: boolean, show: (banner: Banner) => void, play?: (sound: NotificationTone) => void): void {
    const lastFinished = new Map<string, number>();
    for (const event of events) if (event.seq <= snapshot.seq && event.event_type === "turn.finished" && event.session_id) lastFinished.set(event.session_id, event.seq);
    for (const event of events) {
      if (event.seq <= this.cursor || event.seq > snapshot.seq) continue;
      this.cursor = event.seq;
      const preferences = snapshot.settings.values.notifications;
      if (event.event_type === "turn.finished" && event.payload.outcome === "completed" && event.session_id && lastFinished.get(event.session_id) === event.seq) {
        const session = snapshot.sessions.find((session) => session.id === event.session_id), sound = preferences.completedSound ?? { enabled: true, id: "default" };
        if (sound.enabled && (!focused || preferences.soundWhileFocused) && session?.status === "completed" && !session.turnId && session.kind !== "subagent" && !session.queue.some((item) => !item.held && item.delivery !== "steer")) play?.({ sessionId: session.id, kind: "completed", soundId: sound.id });
      }
      if (event.event_type !== "attention.raised") continue;
      const attention = snapshot.attention.find((entry) => entry.id === event.payload.attention.id);
      if (!attention) continue;
      const inputSession = snapshot.sessions.find((session) => session.id === attention.sessionId);
      const inputSound = preferences.needsInputSound ?? { enabled: true, id: "default" };
      const actualInput = inputSession?.turnId && (attention.reason === "approval" && inputSession.pendingApproval?.id === attention.messageId ||
        attention.reason === "question" && snapshot.questions.some((question) => question.id === attention.messageId && question.id === inputSession.pendingQuestionId && question.status === "open" && question.turnId === inputSession.turnId));
      if (attention.source === "state" && attention.active && !attention.acknowledged && actualInput && inputSound.enabled && (!focused || preferences.soundWhileFocused)) play?.({ sessionId: attention.sessionId, kind: "needs-input", soundId: inputSound.id });
      if (!snapshot.settings.values.notifications.os || focused || !attention.active || attention.acknowledged) continue;
      const session = snapshot.sessions.find((session) => session.id === attention.sessionId);
      const generic = attention.kind === "question" ? "A session may be asking a question." : attention.kind === "done" ? "Agent done and waiting." : attention.reason === "approval" ? "A session needs your approval." : "Work needs inspection.";
      show({ id: attention.id, sessionId: attention.sessionId, kind: attention.kind, title: "Moguri", body: snapshot.settings.values.notifications.previewContent && session ? `${bounded(session.title, 100)}: ${bounded(session.messages.findLast((message) => message.role === "assistant")?.text ?? generic, 160)}` : generic });
    }
  }
}

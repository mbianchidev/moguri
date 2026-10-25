import type { Attention, Snapshot, StoredEvent } from "../../../packages/protocol/src/index.ts";

export interface Banner { id: string; sessionId: string; title: string; body: string; kind: Attention["kind"] }
export type NotificationTone = { sessionId: string; kind: "completed"; soundId: string } |
  { sessionId: string; kind: "needs-input"; soundId: string; attentionId: string };
const bounded = (text: string, limit: number) => Array.from(text.replace(/[\x00-\x1f\x7f]/g, " ")).slice(0, limit).join("");
export function notificationToneAllowed(snapshot: Snapshot, tone: NotificationTone, focused: boolean): boolean {
  const preferences = snapshot.settings.values.notifications;
  const choice = (tone.kind === "completed" ? preferences.completedSound : preferences.needsInputSound) ?? { enabled: true, id: "default" };
  if (!choice.enabled || choice.id !== tone.soundId || focused && !(preferences.soundWhileFocused ?? true)) return false;
  const session = snapshot.sessions.find((session) => session.id === tone.sessionId);
  if (!session || session.kind === "subagent") return false;
  if (tone.kind === "completed") return session.status === "completed" && !session.turnId && !session.queue.some((item) => !item.held && item.delivery !== "steer");
  const attention = snapshot.attention.find((entry) => entry.id === tone.attentionId && entry.sessionId === session.id);
  if (!attention || attention.source !== "state" || !attention.active || attention.acknowledged) return false;
  if (attention.reason === "failed") return !session.turnId && ["failed", "partial"].includes(session.status);
  return Boolean(session.turnId && (attention.reason === "approval" && session.pendingApproval?.id === attention.messageId ||
    attention.reason === "question" && snapshot.questions.some((question) => question.id === attention.messageId && question.id === session.pendingQuestionId && question.status === "open" && question.turnId === session.turnId)));
}
export class AttentionNotifier {
  private cursor: number;
  constructor(baseline: number) { this.cursor = baseline; }
  synchronize(baseline: number): void { this.cursor = Math.max(this.cursor, baseline); }
  observe(snapshot: Snapshot, events: StoredEvent[], focused: boolean, show: (banner: Banner) => void, play?: (sound: NotificationTone) => void): void {
    const lastFinished = new Map<string, number>();
    for (const event of events) if (event.seq <= snapshot.seq && event.event_type === "turn.finished" && event.session_id) lastFinished.set(event.session_id, event.seq);
    for (const event of events) {
      if (event.seq <= this.cursor || event.seq > snapshot.seq) continue;
      this.cursor = event.seq;
      const preferences = snapshot.settings.values.notifications;
      if (event.event_type === "turn.finished" && event.payload.outcome === "completed" && event.session_id && lastFinished.get(event.session_id) === event.seq) {
        const tone: NotificationTone = { sessionId: event.session_id, kind: "completed", soundId: preferences.completedSound?.id ?? "default" };
        if (notificationToneAllowed(snapshot, tone, focused)) play?.(tone);
      }
      if (event.event_type !== "attention.raised") continue;
      const attention = snapshot.attention.find((entry) => entry.id === event.payload.attention.id);
      if (!attention) continue;
      const tone: NotificationTone = { sessionId: attention.sessionId, kind: "needs-input", soundId: preferences.needsInputSound?.id ?? "default", attentionId: attention.id };
      if (notificationToneAllowed(snapshot, tone, focused)) play?.(tone);
      if (!snapshot.settings.values.notifications.os || focused || !attention.active || attention.acknowledged) continue;
      const session = snapshot.sessions.find((session) => session.id === attention.sessionId);
      const generic = attention.kind === "question" ? "A session may be asking a question." : attention.kind === "done" ? "Agent done and waiting." : attention.reason === "approval" ? "A session needs your approval." : "Work needs inspection.";
      show({ id: attention.id, sessionId: attention.sessionId, kind: attention.kind, title: "Moguri", body: snapshot.settings.values.notifications.previewContent && session ? `${bounded(session.title, 100)}: ${bounded(session.messages.findLast((message) => message.role === "assistant")?.text ?? generic, 160)}` : generic });
    }
  }
}

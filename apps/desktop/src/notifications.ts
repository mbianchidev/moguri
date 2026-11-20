import type { Attention, Snapshot, StoredEvent } from "../../../packages/protocol/src/index.ts";
import { scriptReviewNeedsApproval } from "../../../packages/protocol/src/script-reviews.ts";

export interface Banner { id: string; sessionId: string | null; itemId?: string; inbox?: true; suggestions?: true; title: string; body: string; kind: Attention["kind"] }
export type NotificationTone = { sessionId: string; kind: "completed"; soundId: string } |
  { sessionId: string | null; kind: "needs-input"; soundId: string; attentionId: string };
const bounded = (text: string, limit: number) => Array.from(text.replace(/[\x00-\x1f\x7f]/g, " ")).slice(0, limit).join("");
export function notificationToneAllowed(snapshot: Snapshot, tone: NotificationTone, focused: boolean): boolean {
  const preferences = snapshot.settings.values.notifications;
  const choice = (tone.kind === "completed" ? preferences.completedSound : preferences.needsInputSound) ?? { enabled: true, id: "default" };
  if (!choice.enabled || choice.id !== tone.soundId || focused && !(preferences.soundWhileFocused ?? true)) return false;
  const inbox = tone.kind === "needs-input" ? snapshot.attention.find((entry) => entry.id === tone.attentionId &&
    entry.reason === "my-work" && entry.sessionId === tone.sessionId) : undefined;
  if (inbox) {
    const refresh = snapshot.myWorkRefreshes.find((record) => record.id === inbox.myWork?.refreshId);
    const summary = refresh?.attention.find((entry) => entry.itemId === inbox.messageId && entry.fingerprint === inbox.myWork?.fingerprint);
    return Boolean(inbox.source === "state" && inbox.active && !inbox.acknowledged && summary &&
      refresh?.status !== "running" && refresh?.revision === inbox.myWork?.revision &&
      summary.sourceIds.some((id) => snapshot.myWorkSources.some((source) => source.id === id && source.enabled &&
        source.binding.policyRevision === snapshot.policy.revision && source.binding.permissionRevision === snapshot.settings.permissionRevision)));
  }
  const session = snapshot.sessions.find((session) => session.id === tone.sessionId);
  if (!session || session.kind === "subagent") return false;
  if (tone.kind === "completed") return session.status === "completed" && !session.turnId && !session.queue.some((item) => !item.held && item.delivery !== "steer");
  const attention = snapshot.attention.find((entry) => entry.id === tone.attentionId && entry.sessionId === session.id);
  if (!attention || attention.source !== "state" || !attention.active || attention.acknowledged) return false;
  if (attention.reason === "ci") {
    const operation = snapshot.githubOperations.find((operation) => operation.id === attention.messageId);
    return Boolean(operation?.ci && operation.originSessionId === session.id && operation.status !== "running" &&
      operation.revision === attention.operationRevision);
  }
  if (attention.reason === "failed") return !session.turnId && ["failed", "partial"].includes(session.status);
  if (attention.reason === "script-review") return snapshot.scriptReviews.some((review) => review.id === attention.messageId &&
    review.sessionId === session.id && scriptReviewNeedsApproval(review));
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
      if (event.event_type === "capability.proposed" && event.payload.proposal.actor === "model") {
        if (!preferences.os || focused) continue;
        const proposal = event.payload.proposal;
        show({ id: `proposal:${proposal.id}`, sessionId: null, suggestions: true, kind: "bell", title: "Moguri",
          body: `Suggested ${proposal.kind} improvement: ${bounded(proposal.name, 80)}. Review it in Suggestions.` });
        continue;
      }
      if (event.event_type !== "attention.raised") continue;
      const attention = snapshot.attention.find((entry) => entry.id === event.payload.attention.id);
      if (!attention) continue;
      const tone: NotificationTone = { sessionId: attention.sessionId, kind: "needs-input", soundId: preferences.needsInputSound?.id ?? "default", attentionId: attention.id };
      if (notificationToneAllowed(snapshot, tone, focused)) play?.(tone);
      if (!snapshot.settings.values.notifications.os || focused || !attention.active || attention.acknowledged) continue;
      const session = snapshot.sessions.find((session) => session.id === attention.sessionId);
      const operation = attention.reason === "ci" ? snapshot.githubOperations.find((operation) => operation.id === attention.messageId) : undefined;
      const script = attention.reason === "script-review" ? snapshot.scriptReviews.find((review) => review.id === attention.messageId) : undefined;
      const summary = attention.myWork ? snapshot.myWorkRefreshes.find((record) => record.id === attention.myWork?.refreshId)?.attention.find((entry) => entry.itemId === attention.messageId) : undefined;
      const generic = attention.reason === "tool-suggestion" ? `A repeated request could become the script tool ${bounded(attention.messageId ?? "", 64)}. Review it in Skills / Tools.` :
        attention.reason === "my-work" ? "The GitHub inbox needs attention." : attention.reason === "ci" ? "A PR CI watch needs inspection." :
        attention.reason === "script-review" ? "Repository script assessments need your review." : attention.kind === "question" ? "A session may be asking a question." : attention.kind === "done" ? "Agent done and waiting." : attention.reason === "approval" ? "A session needs your approval." : "Work needs inspection.";
      const preview = summary ? `${summary.repository}#${summary.number}: ${summary.categories.join(", ")}; head ${summary.headSha.slice(0, 12)}.` :
        script?.advice ? `${script.source.path}: ${script.advice.verdict}. ${script.advice.summary}` :
        operation?.ci ? `PR #${operation.ci.target.number} at ${operation.ci.target.headSha.slice(0, 12)}: watch ${operation.status}, CI ${operation.ci.state ?? "unobserved"}.` :
        session?.messages.findLast((message) => message.role === "assistant")?.text ?? generic;
      show({ id: attention.id, sessionId: attention.sessionId, ...(summary ? { itemId: summary.itemId } : {}),
        ...(script || attention.reason === "tool-suggestion" ? { inbox: true } : {}), kind: attention.kind, title: "Moguri",
        body: snapshot.settings.values.notifications.previewContent && (session || summary) ? `${session ? `${bounded(session.title, 100)}: ` : ""}${bounded(preview, 160)}` : generic });
    }
  }
}

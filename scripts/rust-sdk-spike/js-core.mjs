export class JsCore {
  constructor(profile, protocol) {
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(profile) || profile === "_global") throw new Error("profile_scope");
    this.profile = profile; this.protocol = protocol; this.after = 0; this.generation = 1;
    this.status = "connecting"; this.snapshot = null; this.events = []; this.refresh = false; this.calls = {};
  }
  acceptSnapshot(snapshot) {
    const record = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
    if (!snapshot || snapshot.protocolVersion !== this.protocol || snapshot.profileId !== this.profile ||
      !Number.isSafeInteger(snapshot.seq) || snapshot.seq < 0 || !Array.isArray(snapshot.projects) ||
      !Array.isArray(snapshot.sessions) || !record(snapshot.provider) || !record(snapshot.policy)) throw new Error("invalid_snapshot");
    const projects = new Set(snapshot.projects.map((p) => p.id)), sessions = new Set(snapshot.sessions.map((s) => s.id));
    this.events = this.events.filter((e) => (!e.project_id || projects.has(e.project_id)) && (!e.session_id || sessions.has(e.session_id)));
    this.snapshot = snapshot;
  }
  applyJson(frame, generation) { return this.applyValue(JSON.parse(frame), generation); }
  applyValue(frame, generation) {
    if (this.status === "disposed") throw new Error("disposed");
    if (generation !== this.generation) throw new Error("stale_attachment");
    if (frame.type === "ready") {
      this.acceptSnapshot(frame.snapshot); this.after = frame.snapshot.seq; this.status = "connected"; this.refresh = false;
    } else if (frame.type === "snapshot") { this.acceptSnapshot(frame.snapshot); this.refresh = false; }
    else if (frame.type === "event") {
      const event = frame.event;
      if (!event || event.schema_version !== 1 || event.profile_id !== this.profile ||
        !Number.isSafeInteger(event.seq) || event.seq < 0 || typeof event.event_type !== "string" ||
        !event.payload || typeof event.payload !== "object" || Array.isArray(event.payload)) throw new Error("invalid_or_foreign_event");
      this.after = Math.max(this.after, event.seq);
      const session = event.event_type === "session.deleted" ? event.payload.deletedSessionId : null;
      const project = event.event_type === "project.removed" ? event.payload.deletedProjectId : null;
      this.events = [...this.events.filter((old) => (!session || old.session_id !== session) && (!project || old.project_id !== project)).slice(-199), event];
      this.refresh = this.status === "connected";
    } else if (frame.type === "invalidate") this.refresh = true;
    else throw new Error("invalid_frame");
    return this.after;
  }
  controlJson(input) {
    const value = JSON.parse(input), id = value.commandId, state = this.calls[id];
    if (value.action === "reconnect") {
      this.generation++; this.status = "connecting"; return JSON.stringify({ generation: this.generation, after: this.after, dispatches: [] });
    }
    if (value.action === "disconnect") this.status = "disconnected";
    else if (value.action === "dispose") { this.status = "disposed"; this.events = []; this.snapshot = null; }
    else if (value.action === "dispatch") {
      if (this.status !== "connected") throw new Error("disconnected");
      if (state) throw new Error("no_implicit_replay");
      this.calls[id] = "dispatched"; return JSON.stringify({ commandId: id, dispatch: true });
    } else {
      const next = value.action === "unknown" && ["dispatched", "stop_requested"].includes(state) ? "unknown" :
        value.action === "acknowledge" && state === "dispatched" ? "acknowledged" :
          value.action === "fail" && state === "dispatched" ? "failed" :
            value.action === "stop" && ["dispatched", "unknown"].includes(state) ? "stop_requested" :
              value.action === "stopped" && state === "stop_requested" ? "stopped" : null;
      if (!next) throw new Error("invalid_call_transition");
      this.calls[id] = next;
    }
    return "{}";
  }
  summaryJson() {
    return JSON.stringify({ profileId: this.profile, protocol: this.protocol, after: this.after, generation: this.generation,
      status: this.status, events: this.events.length, refresh: this.refresh, calls: this.calls, sessions: this.snapshot?.sessions.length ?? 0 });
  }
  stateValue() { return { snapshot: this.snapshot, status: this.status, events: this.events, error: null }; }
  stateJson() { return JSON.stringify(this.stateValue()); }
  free() {}
}

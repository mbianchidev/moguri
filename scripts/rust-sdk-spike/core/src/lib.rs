use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::collections::BTreeMap;

const MAX_SAFE: u64 = 9_007_199_254_740_991;

fn integer(value: &Value) -> Result<u64, String> {
    value.as_u64().filter(|n| *n <= MAX_SAFE).or_else(|| {
        value.as_f64().filter(|n| n.is_finite() && n.fract() == 0.0 && *n >= 0.0 && *n <= MAX_SAFE as f64)
            .map(|n| n as u64)
    }).ok_or_else(|| "invalid_safe_integer".to_owned())
}

#[derive(Clone, Copy, Serialize)]
#[serde(rename_all = "snake_case")]
enum Status {
    Connecting,
    Connected,
    Disconnected,
    Disposed,
}

#[derive(Clone, Copy, Serialize)]
#[serde(rename_all = "snake_case")]
enum Call {
    Dispatched,
    Unknown,
    Acknowledged,
    Failed,
    StopRequested,
    Stopped,
}

pub struct Engine {
    profile: String,
    protocol: u64,
    after: u64,
    generation: u32,
    status: Status,
    snapshot: Value,
    events: Vec<Value>,
    refresh: bool,
    calls: BTreeMap<String, Call>,
}

#[derive(Serialize)]
pub struct StateView<'a> {
    snapshot: &'a Value,
    status: Status,
    events: &'a [Value],
    error: Option<&'a str>,
}

impl Engine {
    pub fn new(profile: String, protocol: u64) -> Result<Self, String> {
        if profile.is_empty() || profile == "_global" || profile.len() > 128 ||
            !profile.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-') {
            return Err("profile_scope".to_owned());
        }
        Ok(Self { profile, protocol, after: 0, generation: 1, status: Status::Connecting,
            snapshot: Value::Null, events: vec![], refresh: false, calls: BTreeMap::new() })
    }

    fn snapshot(&mut self, snapshot: Value) -> Result<(), String> {
        if !snapshot.is_object() || snapshot["protocolVersion"] != self.protocol ||
            snapshot["profileId"] != self.profile || !snapshot["projects"].is_array() ||
            !snapshot["sessions"].is_array() || !snapshot["provider"].is_object() ||
            !snapshot["policy"].is_object() {
            return Err("invalid_snapshot".to_owned());
        }
        integer(&snapshot["seq"])?;
        self.events.retain(|event| {
            let project = event["project_id"].as_str();
            let session = event["session_id"].as_str();
            project.is_none_or(|id| snapshot["projects"].as_array().is_some_and(|p| p.iter().any(|p| p["id"] == id))) &&
            session.is_none_or(|id| snapshot["sessions"].as_array().is_some_and(|s| s.iter().any(|s| s["id"] == id)))
        });
        self.snapshot = snapshot;
        Ok(())
    }

    pub fn apply_json(&mut self, frame: &str, generation: u32) -> Result<u64, String> {
        let value = serde_json::from_str(frame).map_err(|e| format!("invalid_json:{e}"))?;
        self.apply_value(value, generation)
    }

    pub fn apply_value(&mut self, mut value: Value, generation: u32) -> Result<u64, String> {
        if matches!(self.status, Status::Disposed) { return Err("disposed".to_owned()); }
        if generation != self.generation { return Err("stale_attachment".to_owned()); }
        match value["type"].as_str() {
            Some("ready") => {
                self.snapshot(value["snapshot"].take())?;
                self.after = integer(&self.snapshot["seq"])?;
                self.status = Status::Connected;
                self.refresh = false;
            }
            Some("snapshot") => { self.snapshot(value["snapshot"].take())?; self.refresh = false; }
            Some("event") => {
                let event = value["event"].take();
                if !event.is_object() || event["schema_version"] != 1 || event["profile_id"] != self.profile ||
                    !event["event_type"].is_string() || !event["payload"].is_object() {
                    return Err("invalid_or_foreign_event".to_owned());
                }
                self.after = self.after.max(integer(&event["seq"])?);
                let deleted_session = if event["event_type"] == "session.deleted" {
                    event["payload"]["deletedSessionId"].as_str()
                } else { None };
                let deleted_project = if event["event_type"] == "project.removed" {
                    event["payload"]["deletedProjectId"].as_str()
                } else { None };
                self.events.retain(|old| deleted_session.is_none_or(|id| old["session_id"] != id) &&
                    deleted_project.is_none_or(|id| old["project_id"] != id));
                if self.events.len() == 200 { self.events.remove(0); }
                self.events.push(event);
                self.refresh = matches!(self.status, Status::Connected);
            }
            Some("invalidate") => { self.refresh = true; }
            _ => return Err("invalid_frame".to_owned()),
        }
        Ok(self.after)
    }

    pub fn control(&mut self, input: &Value) -> Result<Value, String> {
        match input["action"].as_str() {
            Some("reconnect") => {
                self.generation = self.generation.checked_add(1).ok_or("generation_limit")?;
                self.status = Status::Connecting;
                Ok(json!({"generation":self.generation,"after":self.after,"dispatches":[]}))
            }
            Some("disconnect") => { self.status = Status::Disconnected; Ok(json!({})) }
            Some("dispose") => {
                self.status = Status::Disposed; self.events.clear(); self.snapshot = Value::Null;
                Ok(json!({}))
            }
            Some("dispatch") => {
                if !matches!(self.status, Status::Connected) { return Err("disconnected".to_owned()); }
                let id = input["commandId"].as_str().ok_or("missing_command")?;
                if self.calls.contains_key(id) { return Err("no_implicit_replay".to_owned()); }
                self.calls.insert(id.to_owned(), Call::Dispatched);
                Ok(json!({"commandId":id,"dispatch":true}))
            }
            Some("unknown") | Some("acknowledge") | Some("fail") | Some("stop") | Some("stopped") => {
                let id = input["commandId"].as_str().ok_or("missing_command")?;
                let call = self.calls.get_mut(id).ok_or("unknown_command")?;
                *call = match input["action"].as_str().unwrap_or("") {
                    "unknown" if matches!(call, Call::Dispatched | Call::StopRequested) => Call::Unknown,
                    "acknowledge" if matches!(call, Call::Dispatched) => Call::Acknowledged,
                    "fail" if matches!(call, Call::Dispatched) => Call::Failed,
                    "stop" if matches!(call, Call::Dispatched | Call::Unknown) => Call::StopRequested,
                    "stopped" if matches!(call, Call::StopRequested) => Call::Stopped,
                    _ => return Err("invalid_call_transition".to_owned()),
                };
                Ok(json!({}))
            }
            _ => Err("invalid_control".to_owned()),
        }
    }

    pub fn summary(&self) -> Value {
        json!({"profileId":self.profile,"protocol":self.protocol,"after":self.after,"generation":self.generation,
            "status":self.status,"events":self.events.len(),"refresh":self.refresh,"calls":self.calls,
            "sessions":self.snapshot["sessions"].as_array().map_or(0, Vec::len)})
    }

    pub fn state(&self) -> Value {
        json!({"snapshot":self.snapshot,"status":self.status,"events":self.events,"error":null})
    }

    pub fn state_view(&self) -> StateView<'_> {
        StateView { snapshot: &self.snapshot, status: self.status, events: &self.events, error: None }
    }
    pub fn state_json(&self) -> String {
        serde_json::to_string(&self.state_view()).expect("retained JSON state is serializable")
    }
}

pub struct SchemaValidator(jsonschema::Validator);
impl SchemaValidator {
    pub fn new(schema: &str) -> Result<Self, String> {
        let schema: Value = serde_json::from_str(schema).map_err(|e| e.to_string())?;
        jsonschema::validator_for(&schema).map(Self).map_err(|e| e.to_string())
    }
    pub fn check_json(&self, value: &str) -> Result<bool, String> {
        let value: Value = serde_json::from_str(value).map_err(|e| e.to_string())?;
        Ok(self.0.is_valid(&value))
    }
    pub fn check_value(&self, value: &Value) -> bool { self.0.is_valid(value) }
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Draft {
    pub revision: u64,
    pub text: String,
    pub attachments: Value,
}

pub struct DraftMachine {
    revision: u64,
    latest: Draft,
    text: String,
    attachments: Value,
    dirty: bool,
    conflict: bool,
    error: Option<String>,
    pending: Option<(String, Value)>,
}

impl DraftMachine {
    pub fn new(draft: Draft) -> Self {
        Self { revision: draft.revision, text: draft.text.clone(), attachments: draft.attachments.clone(),
            latest: draft, dirty: false, conflict: false, error: None, pending: None }
    }
    pub fn apply(&mut self, input: Value) -> Result<Value, String> {
        let mut effect = Value::Null;
        match input["action"].as_str() {
            Some("edit") => {
                self.text = input["text"].as_str().ok_or("missing_text")?.to_owned();
                if input.get("attachments").is_some() { self.attachments = input["attachments"].clone(); }
                self.dirty = true;
                if !self.conflict { self.error = None; }
            }
            Some("receive") => {
                self.latest = serde_json::from_value(input["draft"].clone()).map_err(|e| e.to_string())?;
                self.receive();
            }
            Some("begin") => {
                if self.conflict { return Err("revision_conflict".to_owned()); }
                if self.pending.is_none() && self.dirty {
                    self.pending = Some((self.text.clone(), self.attachments.clone()));
                    effect = json!({"expectedRevision":self.revision,"text":self.text,"attachments":self.attachments});
                    self.error = None;
                }
            }
            Some("acknowledge") => {
                let (text, attachments) = self.pending.take().ok_or("no_pending_save")?;
                self.revision = integer(&input["revision"])?;
                self.dirty = text != self.text || attachments != self.attachments;
                if !self.dirty { self.receive(); }
            }
            Some("fail") => {
                self.pending.take().ok_or("no_pending_save")?;
                self.conflict = input["code"] == "revision_conflict";
                self.error = Some(if self.conflict { "revision_conflict" } else { "save_failed" }.to_owned());
                self.receive();
            }
            Some("reload") if self.pending.is_none() => {
                self.revision = self.latest.revision; self.text = self.latest.text.clone();
                self.attachments = self.latest.attachments.clone(); self.dirty = false;
                self.conflict = false; self.error = None;
            }
            Some("keep") if self.pending.is_none() => {
                self.revision = self.latest.revision; self.dirty = true; self.conflict = false; self.error = None;
            }
            _ => return Err("invalid_draft_action".to_owned()),
        }
        Ok(json!({"state":self.state(),"effect":effect}))
    }
    fn receive(&mut self) {
        if self.pending.is_some() || self.latest.revision <= self.revision { return; }
        if self.dirty { self.conflict = true; self.error = Some("revision_conflict".to_owned()); }
        else {
            self.revision = self.latest.revision; self.text = self.latest.text.clone();
            self.attachments = self.latest.attachments.clone(); self.conflict = false; self.error = None;
        }
    }
    pub fn state(&self) -> Value {
        json!({"text":self.text,"attachments":self.attachments,"dirty":self.dirty,
            "saving":self.pending.is_some(),"conflict":self.conflict,"error":self.error})
    }
}

pub fn splice_utf16(text: &str, pasted: &str, start: usize, end: usize) -> Result<String, String> {
    let before = text.encode_utf16().collect::<Vec<_>>();
    if start > end || end > before.len() { return Err("paste_selection".to_owned()); }
    let units = before[..start].iter().copied().chain(pasted.encode_utf16())
        .chain(before[end..].iter().copied()).collect::<Vec<_>>();
    String::from_utf16(&units).map_err(|_| "surrogate_split_requires_wtf16_or_explicit_contract".to_owned())
}

#[cfg(test)]
mod tests {
    use super::*;
    fn ready() -> String {
        json!({"type":"ready","snapshot":{"protocolVersion":43,"seq":1,"profileId":"default",
            "projects":[{"id":"p"}],"sessions":[{"id":"s"}],"provider":{},"policy":{}}}).to_string()
    }
    #[test]
    fn uncertain_work_never_redispatches_on_reconnect() {
        let mut core = Engine::new("default".to_owned(), 43).unwrap();
        core.apply_json(&ready(), 1).unwrap();
        core.control(&json!({"action":"dispatch","commandId":"original"})).unwrap();
        core.control(&json!({"action":"unknown","commandId":"original"})).unwrap();
        let reconnect = core.control(&json!({"action":"reconnect"})).unwrap();
        assert_eq!(reconnect["dispatches"], json!([]));
        assert!(core.apply_json(&ready(), 1).is_err());
        core.apply_json(&ready(), 2).unwrap();
        assert!(core.control(&json!({"action":"dispatch","commandId":"original"})).is_err());
        assert_eq!(core.summary()["calls"]["original"], "unknown");
    }
    #[test]
    fn cancellation_is_not_success() {
        let mut core = Engine::new("default".to_owned(), 43).unwrap();
        core.apply_json(&ready(), 1).unwrap();
        core.control(&json!({"action":"dispatch","commandId":"original"})).unwrap();
        core.control(&json!({"action":"stop","commandId":"original"})).unwrap();
        assert!(core.control(&json!({"action":"acknowledge","commandId":"original"})).is_err());
        core.control(&json!({"action":"stopped","commandId":"original"})).unwrap();
        assert_eq!(core.summary()["calls"]["original"], "stopped");
    }
    #[test]
    fn conflicting_draft_preserves_unsent_text() {
        let mut draft = DraftMachine::new(Draft { revision: 0, text: String::new(), attachments: json!([]) });
        draft.apply(json!({"action":"edit","text":"Generated local"})).unwrap();
        draft.apply(json!({"action":"receive","draft":{"revision":1,"text":"Generated other","attachments":[]}})).unwrap();
        assert_eq!(draft.state()["text"], "Generated local");
        assert_eq!(draft.state()["conflict"], true);
        assert!(draft.apply(json!({"action":"begin"})).is_err());
        draft.apply(json!({"action":"keep"})).unwrap();
        let effect = draft.apply(json!({"action":"begin"})).unwrap();
        assert_eq!(effect["effect"]["expectedRevision"], 1);
    }
    #[test]
    fn utf16_offsets_are_not_rust_byte_or_scalar_offsets() {
        assert_eq!(splice_utf16("A\u{1f34a}B", "X", 3, 3).unwrap(), "A\u{1f34a}XB");
        assert!(splice_utf16("A\u{1f34a}B", "X", 2, 2).is_err());
    }
}

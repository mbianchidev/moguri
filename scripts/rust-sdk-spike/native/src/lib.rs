use napi::{Error, Result};
use napi_derive::napi;
use sdk_study_core::{Draft, DraftMachine, Engine, SchemaValidator};

fn error(message: String) -> Error { Error::from_reason(message) }

#[napi]
pub struct NativeCore { core: Engine }
#[napi]
impl NativeCore {
    #[napi(constructor)]
    pub fn new(profile: String, protocol: u32) -> Result<Self> {
        Engine::new(profile, protocol.into()).map(|core| Self { core }).map_err(error)
    }
    #[napi]
    pub fn apply_json(&mut self, frame: String, generation: u32) -> Result<f64> {
        self.core.apply_json(&frame, generation).map(|n| n as f64).map_err(error)
    }
    #[napi]
    pub fn apply_value(&mut self, frame: serde_json::Value, generation: u32) -> Result<f64> {
        self.core.apply_value(frame, generation).map(|n| n as f64).map_err(error)
    }
    #[napi]
    pub fn state_json(&self) -> String { self.core.state_json() }
    #[napi]
    pub fn state_value(&self) -> serde_json::Value { self.core.state() }
    #[napi]
    pub fn summary_json(&self) -> String { self.core.summary().to_string() }
    #[napi]
    pub fn control_json(&mut self, input: String) -> Result<String> {
        let input = serde_json::from_str(&input).map_err(|e| error(e.to_string()))?;
        self.core.control(&input).map(|v| v.to_string()).map_err(error)
    }
}

#[napi]
pub struct NativeValidator { validator: SchemaValidator }
#[napi]
impl NativeValidator {
    #[napi(constructor)]
    pub fn new(schema: String) -> Result<Self> {
        SchemaValidator::new(&schema).map(|validator| Self { validator }).map_err(error)
    }
    #[napi]
    pub fn check_json(&self, value: String) -> Result<bool> { self.validator.check_json(&value).map_err(error) }
    #[napi]
    pub fn check_value(&self, value: serde_json::Value) -> bool { self.validator.check_value(&value) }
}

#[napi]
pub struct NativeDraft { draft: DraftMachine }
#[napi]
impl NativeDraft {
    #[napi(constructor)]
    pub fn new(value: String) -> Result<Self> {
        let draft: Draft = serde_json::from_str(&value).map_err(|e| error(e.to_string()))?;
        Ok(Self { draft: DraftMachine::new(draft) })
    }
    #[napi]
    pub fn action_json(&mut self, value: String) -> Result<String> {
        let value = serde_json::from_str(&value).map_err(|e| error(e.to_string()))?;
        self.draft.apply(value).map(|v| v.to_string()).map_err(error)
    }
    #[napi]
    pub fn state_json(&self) -> String { self.draft.state().to_string() }
}

#[napi]
pub fn splice_utf16(text: String, pasted: String, start: u32, end: u32) -> Result<String> {
    sdk_study_core::splice_utf16(&text, &pasted, start as usize, end as usize).map_err(error)
}

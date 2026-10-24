use serde::Serialize;
use sdk_study_core::{Draft, DraftMachine, Engine, SchemaValidator};
use wasm_bindgen::prelude::*;

fn error(message: String) -> JsValue { JsValue::from_str(&message) }

#[wasm_bindgen]
pub struct WasmCore { core: Engine }
#[wasm_bindgen]
impl WasmCore {
    #[wasm_bindgen(constructor)]
    pub fn new(profile: String, protocol: u32) -> Result<Self, JsValue> {
        Engine::new(profile, protocol.into()).map(|core| Self { core }).map_err(error)
    }
    #[wasm_bindgen(js_name = applyJson)]
    pub fn apply_json(&mut self, frame: &str, generation: u32) -> Result<f64, JsValue> {
        self.core.apply_json(frame, generation).map(|n| n as f64).map_err(error)
    }
    #[wasm_bindgen(js_name = applyValue)]
    pub fn apply_value(&mut self, frame: JsValue, generation: u32) -> Result<f64, JsValue> {
        let frame = serde_wasm_bindgen::from_value(frame).map_err(|e| error(e.to_string()))?;
        self.core.apply_value(frame, generation).map(|n| n as f64).map_err(error)
    }
    #[wasm_bindgen(js_name = stateJson)]
    pub fn state_json(&self) -> String { self.core.state_json() }
    #[wasm_bindgen(js_name = stateValue)]
    pub fn state_value(&self) -> Result<JsValue, JsValue> {
        self.core.state_view().serialize(&serde_wasm_bindgen::Serializer::json_compatible())
            .map_err(|e| error(e.to_string()))
    }
    #[wasm_bindgen(js_name = summaryJson)]
    pub fn summary_json(&self) -> String { self.core.summary().to_string() }
    #[wasm_bindgen(js_name = controlJson)]
    pub fn control_json(&mut self, input: &str) -> Result<String, JsValue> {
        let input = serde_json::from_str(input).map_err(|e| error(e.to_string()))?;
        self.core.control(&input).map(|v| v.to_string()).map_err(error)
    }
}

#[wasm_bindgen]
pub struct WasmValidator { validator: SchemaValidator }
#[wasm_bindgen]
impl WasmValidator {
    #[wasm_bindgen(constructor)]
    pub fn new(schema: &str) -> Result<Self, JsValue> {
        SchemaValidator::new(schema).map(|validator| Self { validator }).map_err(error)
    }
    #[wasm_bindgen(js_name = checkJson)]
    pub fn check_json(&self, value: &str) -> Result<bool, JsValue> {
        self.validator.check_json(value).map_err(error)
    }
    #[wasm_bindgen(js_name = checkValue)]
    pub fn check_value(&self, value: JsValue) -> Result<bool, JsValue> {
        let value = serde_wasm_bindgen::from_value(value).map_err(|e| error(e.to_string()))?;
        Ok(self.validator.check_value(&value))
    }
}

#[wasm_bindgen]
pub struct WasmDraft { draft: DraftMachine }
#[wasm_bindgen]
impl WasmDraft {
    #[wasm_bindgen(constructor)]
    pub fn new(value: &str) -> Result<Self, JsValue> {
        let draft: Draft = serde_json::from_str(value).map_err(|e| error(e.to_string()))?;
        Ok(Self { draft: DraftMachine::new(draft) })
    }
    #[wasm_bindgen(js_name = actionJson)]
    pub fn action_json(&mut self, value: &str) -> Result<String, JsValue> {
        let value = serde_json::from_str(value).map_err(|e| error(e.to_string()))?;
        self.draft.apply(value).map(|v| v.to_string()).map_err(error)
    }
    #[wasm_bindgen(js_name = stateJson)]
    pub fn state_json(&self) -> String { self.draft.state().to_string() }
}

#[wasm_bindgen(js_name = spliceUtf16)]
pub fn splice_utf16(text: &str, pasted: &str, start: u32, end: u32) -> Result<String, JsValue> {
    sdk_study_core::splice_utf16(text, pasted, start as usize, end as usize).map_err(error)
}

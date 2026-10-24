use sdk_study_core::{Engine, SchemaValidator};
use serde_json::{Value, json};
use std::{io::{self, BufRead}, time::Instant};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mut core = Engine::new("default".to_owned(), 43)?;
    println!("{}", json!({"type":"ready"}));
    for line in io::stdin().lock().lines() {
        let input: Value = serde_json::from_str(&line?)?;
        let result: Result<Value, String> = match input["action"].as_str() {
            Some("frame") => core.apply_value(input["frame"].clone(), input["generation"].as_u64().unwrap_or(1) as u32)
                .map(|_| json!({"summary":core.summary(),"state":core.state()})),
            Some("state") => Ok(json!({"summary":core.summary(),"state":core.state()})),
            Some("control") => core.control(&input["input"]),
            Some("bench") => bench(&input),
            Some("quit") => { println!("{}", json!({"id":input["id"],"ok":true})); break; }
            _ => Err("invalid_action".to_owned()),
        };
        println!("{}", match result {
            Ok(value) => json!({"id":input["id"],"ok":true,"result":value}),
            Err(error) => json!({"id":input["id"],"ok":false,"error":error}),
        });
    }
    Ok(())
}

fn bench(input: &Value) -> Result<Value, String> {
    let dataset: Value = serde_json::from_str(&std::fs::read_to_string(input["path"].as_str().ok_or("path")?)
        .map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    let repetitions = input["repetitions"].as_u64().unwrap_or(10) as usize;
    let rounds = input["rounds"].as_u64().unwrap_or(9) as usize;
    let frames = dataset["frames"].as_array().ok_or("frames")?.iter().map(Value::to_string).collect::<Vec<_>>();
    let queries = dataset["queries"].as_array().ok_or("queries")?;
    let schema = dataset["querySchema"].to_string();
    let start = Instant::now();
    let validator = SchemaValidator::new(&schema)?;
    let compile_ms = start.elapsed().as_secs_f64() * 1000.0;
    let mut frame_times = vec![];
    let mut query_times = vec![];
    let mut checks = 0u64;
    for round in 0..=rounds {
        let start = Instant::now();
        for _ in 0..repetitions {
            let mut core = Engine::new("default".to_owned(), 43)?;
            for frame in &frames { checks = checks.wrapping_add(core.apply_json(frame, 1)?); }
            std::hint::black_box(core.summary());
        }
        if round > 0 { frame_times.push(start.elapsed().as_secs_f64() * 1000.0); }
        let start = Instant::now();
        for _ in 0..repetitions {
            for query in queries { checks += u64::from(validator.check_value(query)); }
        }
        if round > 0 { query_times.push(start.elapsed().as_secs_f64() * 1000.0); }
    }
    Ok(json!({"frameBatchMs":frame_times,"queryBatchMs":query_times,"compileMs":compile_ms,
        "checksum":checks,"frameCount":frames.len(),"queryCount":queries.len(),"repetitions":repetitions}))
}

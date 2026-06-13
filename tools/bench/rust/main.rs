//! bench-rust — in-process throughput benchmark for validator-rust.
//!
//! Mirrors bench-js.js / bench-php.php / bench-go: parse the spec once via the
//! same `parse_spec` the CLI uses, build the `Validator` once per spec, then
//! loop `validate(input)` N times. Process startup, spec parse, and fixture I/O
//! all happen BEFORE timing — the measured window is validate-only.
//!
//! stdout: one JSON line per spec (same shape as the other drivers).
//!
//! Build/run with `cargo run --release` (debug codegen would mismeasure).
//! Args: --iters N, --warmup N, --spec NAME, --fixtures DIR.

use formspec_validator::{convert_input, parse_spec, Validator};
use serde_json::Value;
use std::fs;
use std::path::Path;
use std::time::Instant;

struct Report {
    spec: String,
    iters: usize,
    ms: f64,
    ops_sec: i64,
    avg_us: f64,
    valid: bool,
    error: Option<String>,
    field: Option<String>,
}

fn load_fixture(dir: &str, name: &str) -> (Value, Value) {
    let spec_path = Path::new(dir).join(format!("{}.spec.json", name));
    let input_path = Path::new(dir).join(format!("{}.input.json", name));
    let spec: Value =
        serde_json::from_str(&fs::read_to_string(spec_path).expect("read spec")).expect("parse spec");
    let input: Value = serde_json::from_str(&fs::read_to_string(input_path).expect("read input"))
        .expect("parse input");
    (spec, input)
}

fn bench_spec(dir: &str, name: &str, iters: usize, warmup: usize) -> Report {
    let (spec_value, raw_input) = load_fixture(dir, name);
    let parsed = parse_spec(&spec_value);
    let validator_input = convert_input(parsed.is_group, &raw_input);

    // Build the validator once; reuse across iterations. `validate` takes
    // &mut self, so the instance is rebuilt-free but mutated in place.
    let mut v = Validator::new(parsed.spec);

    // Warmup.
    for _ in 0..warmup {
        let _ = v.validate(&validator_input);
    }

    let start = Instant::now();
    for _ in 0..iters {
        let _ = v.validate(&validator_input);
    }
    let elapsed = start.elapsed();

    let ns = elapsed.as_nanos() as f64;
    let ms = ns / 1e6;
    let ops_sec = ((iters as f64 / ns) * 1e9) as i64;
    let avg_us = ns / 1000.0 / iters as f64;

    let result = v.validate(&validator_input);
    let (error, field) = if !result.is_valid && !result.errors.is_empty() {
        (
            Some(result.errors[0].rule.clone()),
            Some(result.errors[0].field.clone()),
        )
    } else {
        (None, None)
    };

    Report {
        spec: name.to_string(),
        iters,
        ms: (ms * 1000.0).round() / 1000.0,
        ops_sec,
        avg_us: (avg_us * 10000.0).round() / 10000.0,
        valid: result.is_valid,
        error,
        field,
    }
}

fn json_opt(v: &Option<String>) -> String {
    match v {
        Some(s) => format!("{:?}", s),
        None => "null".to_string(),
    }
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let mut iters = 50000usize;
    let mut warmup = 5000usize;
    let mut spec: Option<String> = None;
    let mut fixtures = "../fixtures".to_string();
    let mut i = 1;
    while i < args.len() {
        match args[i].as_str() {
            "--iters" => {
                iters = args[i + 1].parse().unwrap();
                i += 1;
            }
            "--warmup" => {
                warmup = args[i + 1].parse().unwrap();
                i += 1;
            }
            "--spec" => {
                spec = Some(args[i + 1].clone());
                i += 1;
            }
            "--fixtures" => {
                fixtures = args[i + 1].clone();
                i += 1;
            }
            _ => {}
        }
        i += 1;
    }

    let specs: Vec<String> = match spec {
        Some(s) => vec![s],
        None => vec!["contact".to_string(), "large-form".to_string()],
    };

    for name in &specs {
        let r = bench_spec(&fixtures, name, iters, warmup);
        println!(
            "{{\"lang\":\"rust\",\"spec\":{:?},\"iters\":{},\"ms\":{},\"opsSec\":{},\"avgUs\":{},\"valid\":{},\"error\":{},\"field\":{}}}",
            r.spec,
            r.iters,
            r.ms,
            r.ops_sec,
            r.avg_us,
            r.valid,
            json_opt(&r.error),
            json_opt(&r.field)
        );
    }
}

//! rust-api: a Rust HTTP API server for form validation.
//!
//! This example mirrors examples/go-api: it loads form specs from YAML files
//! and validates form data with the shared `formspec-validator` crate.
//!
//! Canonical API contract (shared by node-api / php-api / go-api / rust-api):
//!
//!   GET  /api/specs        -> 200 {"specs": ["contact", ...]}
//!   GET  /api/specs/{name} -> 200 {"name": "...", "spec": {...}} | 404 {"error": "..."}
//!   POST /api/validate     -> body {"spec": {...}, "data": {...}}
//!                             always 200 {"valid": bool, "errors": [{"field","rule","message"}]}
//!   Server errors only use 4xx/5xx with {"error": "..."}.
//!   CORS: Access-Control-Allow-Origin * + OPTIONS preflight.
//!   GET  /health           -> 200 {"status": "ok"}
//!
//! The HTTP layer uses only the standard library (TcpListener) to keep the
//! dependency surface minimal: validator + serde_json + serde_yaml.

use std::collections::BTreeMap;
use std::env;
use std::fs;
use std::io::{BufRead, BufReader, Read, Write};
use std::net::{TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::thread;

use formspec_validator::{parse_spec, Validator};
use serde_json::{json, Value};

/// Config holds server configuration resolved from the environment.
struct Config {
    port: String,
    specs_dir: PathBuf,
}

/// A parsed HTTP request: just what the router needs.
struct Request {
    method: String,
    path: String,
    body: Vec<u8>,
}

/// Program entry point. Resolves Config from PORT / SPECS_DIR, binds a
/// TcpListener, and serves connections one thread apiece until the process is
/// killed. Exits the process with status 1 if the bind fails.
fn main() {
    let port = env::var("PORT").unwrap_or_else(|_| "8080".to_string());
    let specs_dir = match env::var("SPECS_DIR") {
        Ok(d) => PathBuf::from(d),
        Err(_) => resolve_default_specs_dir(),
    };

    let config = Config { port, specs_dir };

    println!(
        "Form Validator API server running on port {}",
        config.port
    );
    println!("Specs directory: {}", config.specs_dir.display());
    println!();
    println!("Available endpoints:");
    println!("  GET  /api/specs        - List all form specs");
    println!("  GET  /api/specs/:name  - Get form spec by name");
    println!("  POST /api/validate     - Validate data against spec");
    println!("  GET  /health           - Health check");

    let addr = format!("0.0.0.0:{}", config.port);
    let listener = TcpListener::bind(&addr).unwrap_or_else(|e| {
        eprintln!("Server failed to bind {}: {}", addr, e);
        std::process::exit(1);
    });

    // One thread per connection. An example server, not a load target; this
    // keeps the request lifecycle obvious and dependency-free.
    let specs_dir = config.specs_dir;
    for stream in listener.incoming() {
        match stream {
            Ok(stream) => {
                let dir = specs_dir.clone();
                thread::spawn(move || handle_connection(stream, &dir));
            }
            Err(e) => eprintln!("Connection error: {}", e),
        }
    }
}

/// resolve_default_specs_dir mirrors go-api: prefer a `specs` directory next to
/// the executable, fall back to `./specs` when run from the crate root.
fn resolve_default_specs_dir() -> PathBuf {
    if let Ok(exe) = env::current_exe() {
        if let Some(dir) = exe.parent() {
            let candidate = dir.join("specs");
            if candidate.is_dir() {
                return candidate;
            }
        }
    }
    PathBuf::from("./specs")
}

/// handle_connection drives one client socket end to end: read the request,
/// then route it. A request line that cannot be parsed is answered with 400 and
/// the socket is closed.
fn handle_connection(stream: TcpStream, specs_dir: &Path) {
    let mut stream = stream;
    let req = match read_request(&mut stream) {
        Some(r) => r,
        None => {
            // Malformed request line: close without a body.
            let _ = write_response(&mut stream, 400, &json!({"error": "Bad request"}));
            return;
        }
    };

    route(&mut stream, &req, specs_dir);
}

/// read_request parses the request line, headers, and (for Content-Length
/// bodies) the body. Returns None on a malformed request line.
fn read_request(stream: &mut TcpStream) -> Option<Request> {
    let mut reader = BufReader::new(stream.try_clone().ok()?);

    let mut request_line = String::new();
    if reader.read_line(&mut request_line).ok()? == 0 {
        return None;
    }

    let mut parts = request_line.split_whitespace();
    let method = parts.next()?.to_string();
    let raw_path = parts.next()?.to_string();
    // Strip any query string; the router only matches on the path.
    let path = raw_path.split('?').next().unwrap_or("").to_string();

    let mut content_length = 0usize;
    loop {
        let mut line = String::new();
        if reader.read_line(&mut line).ok()? == 0 {
            break;
        }
        let trimmed = line.trim_end_matches(['\r', '\n']);
        if trimmed.is_empty() {
            break;
        }
        if let Some((name, value)) = trimmed.split_once(':') {
            if name.trim().eq_ignore_ascii_case("content-length") {
                content_length = value.trim().parse().unwrap_or(0);
            }
        }
    }

    let mut body = vec![0u8; content_length];
    if content_length > 0 {
        reader.read_exact(&mut body).ok()?;
    }

    Some(Request {
        method,
        path,
        body,
    })
}

/// route applies CORS, answers OPTIONS preflight, and dispatches exactly like
/// go-api's ServeHTTP.
fn route(stream: &mut TcpStream, req: &Request, specs_dir: &Path) {
    if req.method == "OPTIONS" {
        let _ = write_raw(stream, 204, "No Content", "", &[]);
        return;
    }

    let path = req.path.as_str();
    if path == "/api/validate" {
        handle_validate(stream, req);
    } else if path == "/api/specs" {
        handle_list_specs(stream, req, specs_dir);
    } else if path.starts_with("/api/specs/") {
        handle_get_spec(stream, req, specs_dir);
    } else if path == "/health" {
        let _ = write_response(stream, 200, &json!({"status": "ok"}));
    } else {
        let _ = write_response(stream, 404, &json!({"error": "Endpoint not found"}));
    }
}

/// handle_validate handles POST /api/validate.
///
/// Validation failure is NOT an HTTP error: always 200 with {valid, errors}.
fn handle_validate(stream: &mut TcpStream, req: &Request) {
    if req.method != "POST" {
        let _ = write_response(stream, 405, &json!({"error": "Method not allowed"}));
        return;
    }

    let body: Value = match serde_json::from_slice(&req.body) {
        Ok(v) => v,
        Err(e) => {
            let _ = write_response(
                stream,
                400,
                &json!({"error": format!("Invalid JSON: {}", e)}),
            );
            return;
        }
    };

    let spec = match body.get("spec") {
        Some(Value::Null) | None => {
            let _ = write_response(
                stream,
                400,
                &json!({"error": "Missing or invalid field: spec"}),
            );
            return;
        }
        Some(s) => s,
    };

    // A valid form spec is a group with a properties object. Reject any other
    // shape with 400 instead of returning a misleading valid:true. Keeps the
    // four backends aligned: malformed specs are a client error.
    if !is_valid_spec_shape(spec) {
        let _ = write_response(
            stream,
            400,
            &json!({"error": "Invalid spec: expected a group with a properties object"}),
        );
        return;
    }

    let data = match body.get("data") {
        Some(Value::Null) | None => {
            let _ = write_response(
                stream,
                400,
                &json!({"error": "Missing or invalid field: data"}),
            );
            return;
        }
        Some(d) => d,
    };

    let parsed = parse_spec(spec);
    let mut validator = Validator::new(parsed.spec);
    let result = validator.validate(data);

    let errors: Vec<Value> = result
        .errors
        .iter()
        .map(|e| {
            json!({
                "field": e.field,
                "rule": e.rule,
                "message": e.message,
            })
        })
        .collect();

    let _ = write_response(
        stream,
        200,
        &json!({
            "valid": result.is_valid,
            "errors": errors,
        }),
    );
}

/// handle_list_specs handles GET /api/specs.
fn handle_list_specs(stream: &mut TcpStream, req: &Request, specs_dir: &Path) {
    if req.method != "GET" {
        let _ = write_response(stream, 405, &json!({"error": "Method not allowed"}));
        return;
    }

    let entries = match fs::read_dir(specs_dir) {
        Ok(e) => e,
        Err(e) => {
            let _ = write_response(
                stream,
                500,
                &json!({"error": format!("Error listing specs: {}", e)}),
            );
            return;
        }
    };

    // BTreeMap dedups a name that exists as both .yaml and .yml and yields a
    // deterministic, sorted listing.
    let mut names: BTreeMap<String, ()> = BTreeMap::new();
    for entry in entries.flatten() {
        if entry.path().is_dir() {
            continue;
        }
        let file_name = entry.file_name();
        let file_name = file_name.to_string_lossy();
        if let Some(stripped) = file_name
            .strip_suffix(".yaml")
            .or_else(|| file_name.strip_suffix(".yml"))
        {
            names.insert(stripped.to_string(), ());
        }
    }

    let specs: Vec<String> = names.into_keys().collect();
    let _ = write_response(stream, 200, &json!({"specs": specs}));
}

/// handle_get_spec handles GET /api/specs/{name}.
fn handle_get_spec(stream: &mut TcpStream, req: &Request, specs_dir: &Path) {
    if req.method != "GET" {
        let _ = write_response(stream, 405, &json!({"error": "Method not allowed"}));
        return;
    }

    let name = req.path.trim_start_matches("/api/specs/");
    if name.is_empty() {
        let _ = write_response(stream, 400, &json!({"error": "Spec name is required"}));
        return;
    }

    // Reject path traversal before touching the filesystem.
    if name.contains('/') || name.contains("..") {
        let _ = write_response(
            stream,
            404,
            &json!({"error": format!("Spec not found: {}", name)}),
        );
        return;
    }

    match load_spec_raw(specs_dir, name) {
        Some(raw) => {
            let _ = write_response(stream, 200, &json!({"name": name, "spec": raw}));
        }
        None => {
            let _ = write_response(
                stream,
                404,
                &json!({"error": format!("Spec not found: {}", name)}),
            );
        }
    }
}

/// load_spec_raw reads name.yaml or name.yml and parses it into a Value.
fn load_spec_raw(specs_dir: &Path, name: &str) -> Option<Value> {
    for ext in ["yaml", "yml"] {
        let path = specs_dir.join(format!("{}.{}", name, ext));
        if path.is_file() {
            let content = fs::read_to_string(&path).ok()?;
            let value: Value = serde_yaml::from_str(&content).ok()?;
            return Some(value);
        }
    }
    None
}

/// is_valid_spec_shape reports whether a raw spec has the canonical form-spec
/// shape: a group whose `properties` is an object. Mirrors go-api.
fn is_valid_spec_shape(raw: &Value) -> bool {
    let obj = match raw.as_object() {
        Some(o) => o,
        None => return false,
    };
    if obj.get("type").and_then(Value::as_str) != Some("group") {
        return false;
    }
    obj.get("properties").map(Value::is_object).unwrap_or(false)
}

/// write_response serializes `body` as JSON with CORS headers.
fn write_response(stream: &mut TcpStream, status: u16, body: &Value) -> std::io::Result<()> {
    let payload = serde_json::to_string(body).unwrap_or_else(|_| "{}".to_string());
    let headers = [("Content-Type", "application/json")];
    write_raw(stream, status, status_text(status), &payload, &headers)
}

/// write_raw writes a full HTTP/1.1 response with the canonical CORS headers
/// applied to every response.
fn write_raw(
    stream: &mut TcpStream,
    status: u16,
    reason: &str,
    body: &str,
    headers: &[(&str, &str)],
) -> std::io::Result<()> {
    let mut response = format!("HTTP/1.1 {} {}\r\n", status, reason);
    response.push_str("Access-Control-Allow-Origin: *\r\n");
    response.push_str("Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n");
    response.push_str("Access-Control-Allow-Headers: Content-Type\r\n");
    response.push_str("Connection: close\r\n");
    for (name, value) in headers {
        response.push_str(&format!("{}: {}\r\n", name, value));
    }
    response.push_str(&format!("Content-Length: {}\r\n", body.len()));
    response.push_str("\r\n");
    response.push_str(body);

    stream.write_all(response.as_bytes())?;
    stream.flush()
}

/// status_text maps an HTTP status code to its reason phrase for the response
/// line. Only the codes this server emits are listed; anything else falls back
/// to "OK".
fn status_text(status: u16) -> &'static str {
    match status {
        200 => "OK",
        204 => "No Content",
        400 => "Bad Request",
        404 => "Not Found",
        405 => "Method Not Allowed",
        500 => "Internal Server Error",
        _ => "OK",
    }
}

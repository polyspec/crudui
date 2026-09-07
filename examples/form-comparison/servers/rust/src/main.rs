//! Parse, validate and persist form comparison requests with the Rust libraries.
mod form;
mod json;
mod repository;

use axum::{
    extract::{DefaultBodyLimit, FromRequest, Multipart, Path, Request, State},
    http::{Method, StatusCode},
    response::{IntoResponse, Response},
    routing::any,
    Router,
};
use crudui_validator::validate::{validate, ValidateOptions};
use repository::{load_data, read_object, Repository};
use serde_json::{json, Value};
use std::{path::PathBuf, sync::Arc};

const SOURCE: &str = env!("FORM_SOURCE");
const COMMIT: &str = env!("FORM_SOURCE_COMMIT");
const MAX_BYTES: usize = 2 * 1024 * 1024;

type Result<T> = std::result::Result<T, Error>;
#[derive(Debug)]
struct Error {
    status: StatusCode,
    message: String,
}
fn bad(message: impl Into<String>) -> Error {
    Error {
        status: StatusCode::BAD_REQUEST,
        message: message.into(),
    }
}
impl From<std::io::Error> for Error {
    fn from(error: std::io::Error) -> Self {
        Self {
            status: StatusCode::INTERNAL_SERVER_ERROR,
            message: error.to_string(),
        }
    }
}
impl IntoResponse for Error {
    fn into_response(self) -> Response {
        let body = json::encode(&json!({"error":self.message,"server":"rust"}))
            .expect("error response contains valid strings");
        (
            self.status,
            [
                ("Content-Type", "application/json; charset=utf-8"),
                ("Cache-Control", "no-store"),
            ],
            body,
        )
            .into_response()
    }
}
fn reply(status: StatusCode, mut body: Value) -> Result<Response> {
    body["server"] = json!("rust");
    Ok((
        status,
        [
            ("Content-Type", "application/json; charset=utf-8"),
            ("Cache-Control", "no-store"),
        ],
        json::encode(&body)?,
    )
        .into_response())
}

struct Server {
    data: PathBuf,
    specs: PathBuf,
}

async fn parse_native(request: Request, kind: &str) -> Result<Value> {
    let mut result = json!({});
    if kind == "multipart/form-data" {
        let mut multipart = Multipart::from_request(request, &())
            .await
            .map_err(|e| Error {
                status: e.status(),
                message: e.to_string(),
            })?;
        let mut count = 0;
        while let Some(field) = multipart.next_field().await.map_err(|e| Error {
            status: e.status(),
            message: e.to_string(),
        })? {
            count += 1;
            if count > 10000 {
                return Err(bad("Too many native form fields"));
            }
            if field.file_name().is_some() {
                return Err(bad("File uploads are not part of this form"));
            }
            let name = field
                .name()
                .ok_or_else(|| bad("Missing native field name"))?
                .to_string();
            let bytes = field.bytes().await.map_err(|e| Error {
                status: e.status(),
                message: e.to_string(),
            })?;
            let value = String::from_utf8(bytes.to_vec()).map_err(|e| bad(e.to_string()))?;
            form::insert_native(&mut result, &name, value)?;
        }
    } else if kind == "application/x-www-form-urlencoded" {
        let bytes = axum::body::to_bytes(request.into_body(), MAX_BYTES)
            .await
            .map_err(|e| Error {
                status: StatusCode::PAYLOAD_TOO_LARGE,
                message: e.to_string(),
            })?;
        for (i, (name, value)) in form_urlencoded::parse(&bytes).enumerate() {
            if i >= 10000 {
                return Err(bad("Too many native form fields"));
            }
            form::insert_native(&mut result, &name, value.into_owned())?;
        }
    } else {
        return Err(Error {
            status: StatusCode::UNSUPPORTED_MEDIA_TYPE,
            message: "Expected a native form".into(),
        });
    }
    Ok(result)
}

async fn handle(
    State(server): State<Arc<Server>>,
    Path((action, mode, framework)): Path<(String, String, String)>,
    request: Request,
) -> Result<Response> {
    let revision = if mode == "original-keyed" {
        "original"
    } else {
        &mode
    };
    if revision != SOURCE
        || !["react", "vue", "svelte"].contains(&framework.as_str())
        || !["load", "save", "validate", "reset"].contains(&action.as_str())
    {
        return Err(Error {
            status: StatusCode::NOT_FOUND,
            message: "Unknown endpoint".into(),
        });
    }
    let expected = if action == "load" {
        Method::GET
    } else {
        Method::POST
    };
    if request.method() != expected {
        return Err(Error {
            status: StatusCode::METHOD_NOT_ALLOWED,
            message: "Method not allowed".into(),
        });
    }
    let mode_data = if mode == "original" {
        "original"
    } else {
        "keyed"
    };
    let repo = Repository {
        file: server.data.join(format!("rust-{mode}-{framework}.json")),
        fixtures: server.specs.join("records.json"),
    };
    let kind = request
        .headers()
        .get("Content-Type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .split(';')
        .next()
        .unwrap_or("")
        .trim()
        .to_ascii_lowercase();
    if action == "load" || action == "reset" {
        let storage = if action == "load" {
            repo.read()?
        } else {
            let fields = parse_native(request, &kind).await?;
            let fixture = match fields.get("fixture") {
                None => "default",
                Some(value) => value.as_str().ok_or_else(|| bad("Expected fixture name"))?,
            };
            repo.reset(fixture)?
        };
        let data = load_data(&storage, mode_data)?;
        return reply(StatusCode::OK, json!({"storage":storage,"data":data}));
    }
    let received = match kind.as_str() {
        "application/json" => {
            let bytes = axum::body::to_bytes(request.into_body(), MAX_BYTES)
                .await
                .map_err(|e| Error {
                    status: StatusCode::PAYLOAD_TOO_LARGE,
                    message: e.to_string(),
                })?;
            let data = json::decode(&bytes)?
                .get("form")
                .cloned()
                .ok_or_else(|| bad("Expected form object"))?;
            form::check_json_shape(&data, mode_data)?;
            data
        }
        "multipart/form-data" | "application/x-www-form-urlencoded" => {
            let fields = parse_native(request, &kind).await?;
            if fields.get("_form_complete").and_then(Value::as_str) != Some("1") {
                return Err(bad("Incomplete native form submission"));
            }
            let mut data = fields.get("form").cloned().unwrap_or_else(|| json!({}));
            if !data.is_object() {
                return Err(bad("Expected form object"));
            }
            if mode_data == "original" {
                form::native_arrays(&mut data, 0)?;
            }
            data
        }
        _ => {
            return Err(Error {
                status: StatusCode::UNSUPPORTED_MEDIA_TYPE,
                message: "Expected a form or JSON request".into(),
            })
        }
    };
    let data = form::normalize(&received, mode_data)?;
    let spec = read_object(&server.specs.join(format!("spec-{mode_data}.json")))?;
    let validation =
        validate(&spec, &data, &ValidateOptions::default()).map_err(|e| Error {
            status: StatusCode::INTERNAL_SERVER_ERROR,
            message: e.to_string(),
        })?;
    let errors: Vec<Value> = validation
        .errors
        .iter()
        .map(|error| error.to_value())
        .collect();
    let mut result = json!({"transport":kind,"jsonProcessor":"ordered-json","validatorSource":SOURCE,"received":received,"normalized":data,"validation":{"valid":validation.valid,"errors":errors}});
    if action == "validate" {
        return reply(StatusCode::OK, result);
    }
    if !validation.valid {
        return reply(StatusCode::UNPROCESSABLE_ENTITY, result);
    }
    let saved = repo.save(&data, mode_data)?;
    for (key, value) in saved.as_object().expect("repository result is an object") {
        result[key] = value.clone();
    }
    reply(StatusCode::OK, result)
}

#[tokio::main]
async fn main() -> std::result::Result<(), Box<dyn std::error::Error>> {
    let args: Vec<String> = std::env::args().collect();
    if args.len() != 4 {
        return Err("Expected arguments: address data-directory spec-directory".into());
    }
    let server = Arc::new(Server {
        data: PathBuf::from(&args[2]),
        specs: PathBuf::from(&args[3]),
    });
    let app = Router::new().route("/api/health",any(|| async {reply(StatusCode::OK,json!({"status":"ok","validatorSource":SOURCE,"commit":COMMIT,"storage":"JSON files","jsonProcessor":"ordered-json"}))}))
        .route("/api/{action}/{mode}/{framework}",any(handle)).with_state(server).layer(DefaultBodyLimit::max(MAX_BYTES));
    let listener = tokio::net::TcpListener::bind(&args[1]).await?;
    axum::serve(listener, app).await?;
    Ok(())
}

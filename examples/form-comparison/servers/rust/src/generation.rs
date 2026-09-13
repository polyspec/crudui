use crate::{
    bad, json as codec, reply,
    repository::{load_data, read_object, Repository},
    Error, Result, Server, COMMIT, MAX_BYTES,
};
use axum::{
    extract::Request,
    http::{Method, StatusCode},
    response::{IntoResponse, Response},
};
use crudui_generator::{
    compile_form, render_form, BindOptions, CompileOptions, Form, FormTemplate,
};
use crudui_validator::compose::{ComposeResult, FileLoader, LoadedDoc, MemoryLoader};
use serde_json::{json, Map, Value};
use std::cell::Cell;

pub fn provenance() -> Value {
    json!({"runtime":"rust","commit":COMMIT})
}

fn object<'a>(request: &'a Value, name: &str) -> Result<&'a Value> {
    request
        .get(name)
        .filter(|value| value.is_object())
        .ok_or_else(|| bad(format!("Expected {name} object")))
}

fn string_option(options: &Map<String, Value>, name: &str) -> Result<Option<String>> {
    options
        .get(name)
        .map(|value| {
            value
                .as_str()
                .map(str::to_owned)
                .ok_or_else(|| bad(format!("Expected string option: {name}")))
        })
        .transpose()
}

struct CountingLoader {
    loader: MemoryLoader,
    reads: Cell<usize>,
}

impl FileLoader for CountingLoader {
    fn normalize(&self, path: &str, basepath: &str) -> String {
        self.loader.normalize(path, basepath)
    }

    fn load(&self, key: &str) -> ComposeResult<LoadedDoc> {
        self.reads.set(self.reads.get() + 1);
        self.loader.load(key)
    }
}

fn compile(request: &Value, options: &Map<String, Value>) -> Result<Value> {
    let files = match options.get("files") {
        Some(value) => value
            .as_object()
            .cloned()
            .ok_or_else(|| bad("Expected composition files object"))?,
        None => Map::new(),
    };
    let loader = CountingLoader {
        loader: MemoryLoader::new(files),
        reads: Cell::new(0),
    };
    let template = compile_form(
        object(request, "spec")?,
        &CompileOptions {
            loader: Some(&loader),
            basepath: string_option(options, "basepath")?.unwrap_or_default(),
            key_prefix: string_option(options, "keyPrefix")?,
            ..Default::default()
        },
    )
    .map_err(|error| bad(error.to_string()))?;
    Ok(json!({"template":template,"generator":provenance(),"referenceReads":loader.reads.get()}))
}

fn render(request: &Value, options: &Map<String, Value>) -> Result<Value> {
    for name in ["files", "loader", "basepath"] {
        if options.contains_key(name) {
            return Err(bad(format!(
                "Composition option is not valid for rendering: {name}"
            )));
        }
    }
    let template: FormTemplate = serde_json::from_value(object(request, "template")?.clone())
        .map_err(|error| bad(error.to_string()))?;
    // An absent option is null so the generator applies its default.
    let option = |name| -> Result<Value> {
        Ok(string_option(options, name)?.map_or(Value::Null, Value::String))
    };
    let binding = BindOptions {
        key_prefix: option("keyPrefix")?,
        id_prefix: option("idPrefix")?,
        language: option("language")?,
        unsupported: option("unsupported")?,
    };
    let form = Form::new(template, object(request, "data")?, binding)
        .map_err(|error| bad(error.to_string()))?;
    let html = render_form(&form).map_err(|error| bad(error.to_string()))?;
    Ok(
        json!({"data":form.get_data(),"fields":form.fields(),"html":html,"revision":form.revision(),"generator":provenance()}),
    )
}

pub async fn handle(
    server: &Server,
    action: &str,
    rendering_path: &str,
    framework: &str,
    request: Request,
) -> Result<Response> {
    let expected = if action == "ssr" {
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
    if action == "ssr" {
        return document(server, rendering_path, framework, request.uri().query());
    }
    let kind = request
        .headers()
        .get("Content-Type")
        .and_then(|value| value.to_str().ok())
        .unwrap_or("")
        .split(';')
        .next()
        .unwrap_or("")
        .trim();
    if !kind.eq_ignore_ascii_case("application/json") {
        return Err(Error {
            status: StatusCode::UNSUPPORTED_MEDIA_TYPE,
            message: "Expected a JSON generation request".into(),
        });
    }
    let bytes = axum::body::to_bytes(request.into_body(), MAX_BYTES)
        .await
        .map_err(|error| Error {
            status: StatusCode::PAYLOAD_TOO_LARGE,
            message: error.to_string(),
        })?;
    let body = codec::decode(&bytes)?;
    if !body.is_object() {
        return Err(bad("Expected request object"));
    }
    let options = match body.get("options") {
        Some(value) => value
            .as_object()
            .cloned()
            .ok_or_else(|| bad("Expected options object"))?,
        None => Map::new(),
    };
    let response = if action == "compile" {
        compile(&body, &options)?
    } else {
        render(&body, &options)?
    };
    reply(StatusCode::OK, response)
}

fn escape(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&#39;")
}

fn document(
    server: &Server,
    rendering_path: &str,
    framework: &str,
    query: Option<&str>,
) -> Result<Response> {
    let language = form_urlencoded::parse(query.unwrap_or("").as_bytes())
        .find(|(name, _)| name == "language")
        .map(|(_, value)| value.into_owned())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| "ko".into());
    if !["ko", "en"].contains(&language.as_str()) {
        return Err(bad("Expected language ko or en"));
    }
    let spec = read_object(&server.specs.join("spec.json"))?;
    let template = compile_form(
        &spec,
        &CompileOptions {
            key_prefix: Some("form".into()),
            ..Default::default()
        },
    )
    .map_err(|error| Error {
        status: StatusCode::INTERNAL_SERVER_ERROR,
        message: error.to_string(),
    })?;
    let repository = Repository {
        file: server
            .data
            .join(format!("rust-{rendering_path}-{framework}.json")),
        fixtures: server.specs.join("records.json"),
    };
    let data = load_data(&repository.read()?)?;
    let form = Form::new(
        template,
        &data,
        BindOptions {
            language: Value::String(language.clone()),
            ..Default::default()
        },
    )
    .map_err(|error| Error {
        status: StatusCode::INTERNAL_SERVER_ERROR,
        message: error.to_string(),
    })?;
    let markup = render_form(&form).map_err(|error| Error {
        status: StatusCode::INTERNAL_SERVER_ERROR,
        message: error.to_string(),
    })?;
    let interactive = if language == "ko" {
        "입력 화면 열기"
    } else {
        "Open interactive form"
    };
    let document = format!(
        r#"<!doctype html><html lang="{language}" data-language="{language}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>CRUDUI</title><link rel="stylesheet" href="/crudui.css"><link rel="stylesheet" href="/comparison.css"></head><body class="frame"><header><h1>CRUDUI</h1><a href="/frames/{rendering_path}-{framework}/?server=rust&amp;lang={language}&amp;initialization=ssr">{interactive}</a></header><form id="form" method="post" action="/api/rust/save/{rendering_path}/{framework}" data-generator-runtime="rust" data-generator-commit="{commit}"><div id="view">{markup}</div></form></body></html>"#,
        commit = escape(COMMIT)
    );
    Ok((
        StatusCode::OK,
        [
            ("Content-Type", "text/html; charset=utf-8"),
            ("Cache-Control", "no-store"),
        ],
        document,
    )
        .into_response())
}

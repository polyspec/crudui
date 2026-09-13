use super::*;
use axum::body::{to_bytes, Body};
use std::fs;
use tower::ServiceExt;

fn spec() -> Value {
    json!({"type":"group","properties":{"companies":{"type":"group","multiple":true,"properties":{
        "name":{"type":"text","label":{"en":"Company","ko":"회사"},"validate":{"required":true}},
        "stores":{"type":"group","multiple":true,"properties":{
            "name":{"type":"text","validate":{"required":true}},
            "enabled":{"type":"checkbox","default":"1"},
            "detail":{"type":"textarea","design":{"show":".enabled"}},
            "title":{"type":"text","lang":{"only":["ko","en"]}},
            "departments":{"type":"group","multiple":true,"properties":{"name":{"type":"text","validate":{"required":true}}}}
        }}
    }}},
    "buttons":[{"type":"submit","name":"_form_complete","value":"1","text":{"en":"Save","ko":"저장"}}]})
}

fn fixture() -> (tempfile::TempDir, Arc<Server>) {
    let directory = tempfile::tempdir().unwrap();
    let data = directory.path().join("data");
    let specs = directory.path().join("specs");
    fs::create_dir_all(&data).unwrap();
    fs::create_dir_all(&specs).unwrap();
    fs::write(
        specs.join("records.json"),
        include_str!("../../../fixtures/records.json"),
    )
    .unwrap();
    fs::write(specs.join("spec.json"), json::encode(&spec()).unwrap()).unwrap();
    (directory, Arc::new(Server { data, specs }))
}

async fn request(
    app: &Router,
    method: &str,
    path: &str,
    content_type: &str,
    body: String,
) -> Response {
    app.clone()
        .oneshot(
            Request::builder()
                .method(method)
                .uri(path)
                .header("Content-Type", content_type)
                .body(Body::from(body))
                .unwrap(),
        )
        .await
        .unwrap()
}

async fn decoded(response: Response) -> Value {
    let bytes = to_bytes(response.into_body(), MAX_BYTES * 10)
        .await
        .unwrap();
    json::decode(&bytes).unwrap()
}

async fn post(app: &Router, operation: &str, body: Value) -> Value {
    let response = request(
        app,
        "POST",
        &format!("/api/{operation}/createForm/react"),
        "application/json",
        json::encode(&body).unwrap(),
    )
    .await;
    let status = response.status();
    let value = decoded(response).await;
    assert_eq!(status, StatusCode::OK, "{operation}: {value}");
    value
}

#[tokio::test]
async fn compilation_and_cached_rendering_use_rust_and_preserve_order() {
    assert_eq!(
        SOURCE, "current",
        "Current server tests require FORM_SOURCE=current"
    );
    let (_directory, server) = fixture();
    let app = application(server.clone());
    // Fields come by reference; root declarations such as buttons stay on the form root.
    let compiled = post(&app, "compile", json!({"spec":{"type":"group","buttons":spec()["buttons"],"properties":{"$ref":"fields.json"}},"options":{"keyPrefix":"form","files":{"fields.json":{"type":"group","properties":spec()["properties"]}}}})).await;
    assert_eq!(
        compiled["generator"],
        json!({"runtime":"rust","commit":COMMIT})
    );
    assert_eq!(compiled["referenceReads"], 1);
    let direct = post(&app, "compile", json!({"spec":spec()})).await;
    assert_eq!(direct["referenceReads"], 0);
    assert_eq!(
        fs::read_dir(&server.data).unwrap().count(),
        0,
        "Compilation must not access record storage"
    );
    let records = json::decode(include_bytes!("../../../fixtures/records.json")).unwrap();
    let data = load_data(&records["nonsequential"]).unwrap();
    let input = json!({"template":compiled["template"],"data":data,"options":{"idPrefix":"scope:'한글","language":"en"}});
    let initial = post(&app, "render", input.clone()).await;
    let repeated = post(&app, "render", input).await;
    assert_eq!(initial, repeated);
    assert_eq!(initial["data"], data);
    assert_eq!(
        initial["data"]["companies"]
            .as_object()
            .unwrap()
            .keys()
            .map(String::as_str)
            .collect::<Vec<_>>(),
        [
            "__0000000000005__",
            "__0000000000007__",
            "__0000000000001__"
        ]
    );
    assert_eq!(initial["revision"], 0);
    assert_eq!(initial["generator"], compiled["generator"]);
    assert!(initial["fields"].is_array());
    let html = initial["html"].as_str().unwrap();
    assert!(html.contains("form[companies][__0000000000005__][stores][__0000000000005__][name]"));
    assert!(html.contains("id=\"scope%3A&#x27;"));
    let empty = post(
        &app,
        "render",
        json!({"template":compiled["template"],"data":{"companies":{}}}),
    )
    .await;
    assert_eq!(empty["data"], json!({"companies":{}}));
    assert!(empty["html"]
        .as_str()
        .unwrap()
        .contains("data-crudui-action=\"add-row\""));
    let generated = post(
        &app,
        "render",
        json!({"template":compiled["template"],"data":{}}),
    )
    .await;
    let keys = generated["data"]["companies"]
        .as_object()
        .unwrap()
        .keys()
        .collect::<Vec<_>>();
    assert_eq!(keys.len(), 1);
    assert!(form::valid_key(keys[0]));
    let restored = post(
        &app,
        "render",
        json!({"template":compiled["template"],"data":generated["data"]}),
    )
    .await;
    assert_eq!(
        restored, generated,
        "Returned default rows must make subsequent binding identical"
    );
}

#[tokio::test]
async fn generation_rejects_invalid_requests_without_storage_changes() {
    let (_directory, server) = fixture();
    let app = application(server.clone());
    let compiled = post(&app, "compile", json!({"spec":spec()})).await;
    for body in [
        json!({"template":compiled["template"],"data":{},"options":{"files":{}}}),
        json!({"template":compiled["template"],"data":[],"options":{}}),
        json!({"template":compiled["template"],"data":null}),
        json!({"template":compiled["template"],"data":{},"options":{"language":42}}),
        json!({"template":{},"data":{}}),
    ] {
        let response = request(
            &app,
            "POST",
            "/api/render/createForm/react",
            "application/json",
            json::encode(&body).unwrap(),
        )
        .await;
        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    }
    for (method, path, media, body, expected) in [
        (
            "GET",
            "/api/compile/createForm/react",
            "application/json",
            "{}",
            StatusCode::METHOD_NOT_ALLOWED,
        ),
        (
            "POST",
            "/api/compile/createForm/react",
            "text/plain",
            "{}",
            StatusCode::UNSUPPORTED_MEDIA_TYPE,
        ),
        (
            "POST",
            "/api/compile/createForm/react",
            "application/json",
            "{}{}",
            StatusCode::BAD_REQUEST,
        ),
        (
            "POST",
            "/api/compile/createForm/react",
            "application/json",
            "{\"spec\":1e999}",
            StatusCode::BAD_REQUEST,
        ),
        (
            "POST",
            "/api/compile/createForm/react",
            "application/json",
            "[]",
            StatusCode::BAD_REQUEST,
        ),
        (
            "GET",
            "/api/ssr/createForm/react?language=de",
            "",
            "",
            StatusCode::BAD_REQUEST,
        ),
        (
            "POST",
            "/api/compile/keyed/react",
            "application/json",
            "{}",
            StatusCode::NOT_FOUND,
        ),
    ] {
        let response = request(&app, method, path, media, body.into()).await;
        assert_eq!(response.status(), expected, "{method} {path} {body}");
    }
    let response = request(
        &app,
        "POST",
        "/api/compile/createForm/react",
        "application/json",
        " ".repeat(MAX_BYTES + 1),
    )
    .await;
    assert_eq!(response.status(), StatusCode::PAYLOAD_TOO_LARGE);
    assert_eq!(fs::read_dir(&server.data).unwrap().count(), 0);
}

fn native_fields(value: &Value, name: &str, output: &mut Vec<(String, String)>) {
    match value {
        Value::Object(members) => {
            for (key, value) in members {
                native_fields(value, &format!("{name}[{key}]"), output);
            }
        }
        Value::String(value) => output.push((name.into(), value.clone())),
        _ => panic!("The fixture contains only objects and string controls"),
    }
}

#[tokio::test]
async fn server_html_uses_framework_storage_and_native_submission() {
    let (_directory, server) = fixture();
    let app = application(server.clone());
    let repo = Repository {
        file: server.data.join("rust-createForm-react.json"),
        fixtures: server.specs.join("records.json"),
    };
    let state = repo.reset("nonsequential").unwrap();
    let response = request(
        &app,
        "GET",
        "/api/ssr/createForm/react?language=en",
        "",
        String::new(),
    )
    .await;
    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(
        response.headers()["content-type"],
        "text/html; charset=utf-8"
    );
    let html = String::from_utf8(
        to_bytes(response.into_body(), MAX_BYTES)
            .await
            .unwrap()
            .to_vec(),
    )
    .unwrap();
    assert!(html.contains("data-generator-runtime=\"rust\""));
    assert!(html.contains(&format!("data-generator-commit=\"{COMMIT}\"")));
    assert!(html.contains("action=\"/api/rust/save/createForm/react\""));
    assert!(
        html.contains("/frames/createForm-react/?server=rust&amp;lang=en&amp;initialization=ssr")
    );
    assert_eq!(html.matches("type=\"submit\"").count(), 1);
    assert!(html.contains(
        "<button type=\"submit\" class=\"crudui-action crudui-action--text\" name=\"_form_complete\" value=\"1\">Save</button>"
    ));
    assert!(!html.contains("type=\"hidden\""));
    assert!(!html.contains("[company_seq]"));
    assert!(html.find("Company 5").unwrap() < html.find("Company 7").unwrap());
    assert!(html.find("Company 7").unwrap() < html.find("Company 1").unwrap());
    let mut data = load_data(&state).unwrap();
    data["companies"]["__0000000000005__"]["name"] = json!("Native update");
    let mut fields = Vec::new();
    native_fields(&data, "form", &mut fields);
    fields.push(("_form_complete".into(), "1".into()));
    let body = form_urlencoded::Serializer::new(String::new())
        .extend_pairs(fields)
        .finish();
    let response = request(
        &app,
        "POST",
        "/api/save/createForm/react",
        "application/x-www-form-urlencoded",
        body,
    )
    .await;
    assert_eq!(response.status(), StatusCode::OK);
    let native = decoded(response).await;
    assert_eq!(native["validation"]["valid"], true);
    assert_eq!(native["data"], data);
    repo.reset("nonsequential").unwrap();
    let json_save = post(&app, "save", json!({"form":data})).await;
    assert_eq!(native["storage"], json_save["storage"]);
    let before = fs::read(&repo.file).unwrap();
    let response = request(
        &app,
        "POST",
        "/api/save/createForm/react",
        "application/x-www-form-urlencoded",
        "form[companies][__0000000000005__][name]=Invalid".into(),
    )
    .await;
    assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    assert_eq!(fs::read(&repo.file).unwrap(), before);
    data["companies"]["__0000000000005__"]["name"] = json!("");
    let response = request(
        &app,
        "POST",
        "/api/save/createForm/react",
        "application/json",
        json::encode(&json!({"form":data})).unwrap(),
    )
    .await;
    assert_eq!(response.status(), StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(decoded(response).await["validation"]["valid"], false);
    assert_eq!(fs::read(&repo.file).unwrap(), before);
    let response = request(
        &app,
        "GET",
        "/api/ssr/createForm/vue?language=ko",
        "",
        String::new(),
    )
    .await;
    let vue_html = String::from_utf8(
        to_bytes(response.into_body(), MAX_BYTES)
            .await
            .unwrap()
            .to_vec(),
    )
    .unwrap();
    assert!(vue_html.contains("Company A"));
    assert!(!vue_html.contains("Native update"));
}

#[test]
fn ordered_json_retains_member_order_and_rejects_unrepresentable_numbers() {
    let input = r#"{"5":{"__0000000000007__":{}},"7":[],"1":null}"#;
    let decoded = json::decode(input.as_bytes()).unwrap();
    assert_eq!(json::encode(&decoded).unwrap(), input);
    for invalid in [
        r#"{"a":1}false"#,
        r#"{"a":1e999}"#,
        r#"{"a":9007199254740992}"#,
    ] {
        assert!(json::decode(invalid.as_bytes()).is_err());
    }
}

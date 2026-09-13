use super::*;
use serde_json::{json, Value};

fn template() -> FormTemplate {
    compile_form(&json!({"type":"group","properties":{
        "enabled":{"type":"checkbox"},
        "memo":{"type":"textarea","default":"initial","design":{"show":".enabled"}},
        "companies":{"type":"group","multiple":{"copy":true,"sortable":true},"properties":{
            "name":{"type":"text"},
            "stores":{"type":"group","multiple":true,"properties":{"name":{"type":"text"},"tags":{"type":"multichoice","items":{"a":"A","b":"B"}}}}
        }}
    }}),&CompileOptions {key_prefix:Some("form".into()),..Default::default()}).unwrap()
}

fn record() -> Value {
    json!({"enabled":true,"memo":"saved","companies":{
        "__0000000000005__":{"name":"Five","stores":{"__0000000000005__":{"name":"Store","tags":["a","b"]}}},
        "__0000000000007__":{"name":"Seven","stores":{}},
        "__0000000000001__":{"name":"One","stores":{}}
    }})
}

#[test]
fn initial_injection_repeated_injection_and_restoration_are_exact() {
    let template = template();
    let cached = serde_json::to_string(&template).unwrap();
    let data = record();
    let initial = Form::new(template.clone(), &data, BindOptions::default()).unwrap();
    let html = render_form(&initial).unwrap();
    let mut injected = Form::new(
        serde_json::from_str(&cached).unwrap(),
        &json!({"companies":{}}),
        BindOptions::default(),
    )
    .unwrap();
    for next in [
        data.clone(),
        data.clone(),
        json!({"enabled":false,"memo":"other","companies":{}}),
        data.clone(),
    ] {
        injected.set_data(&next).unwrap();
        if next == data {
            assert_eq!(html, render_form(&injected).unwrap());
            assert_eq!(initial.get_data(), injected.get_data());
            assert_eq!(initial.fields(), injected.fields());
        }
    }
    assert_eq!(cached, serde_json::to_string(&template).unwrap());
    assert_eq!(cached, serde_json::to_string(injected.template()).unwrap());
    assert!(html.contains("form[companies][__0000000000005__][stores][__0000000000005__][name]"));
    assert!(html.contains("companies[][stores][][name]"));
}

#[test]
fn utc_date_controls_and_lists_preserve_data_and_injected_html() {
    let template = compile_form(
        &json!({"type":"group","properties":{"day":{"type":"date"},"time":{"type":"datetime"}}}),
        &CompileOptions::default(),
    )
    .unwrap();
    let list_spec = json!({"columns":{"time":{"field":".time","format":{"type":"date","pattern":"YYYY-MM-DDTHH:mm:ss"}}}});
    for (input, day, time) in [
        (
            "2026-09-09T03:04:05+09:00",
            "2026-09-08",
            "2026-09-08T18:04:05",
        ),
        (
            "2026-09-09T23:04:05-07:00",
            "2026-09-10",
            "2026-09-10T06:04:05",
        ),
        (
            "2026-09-09 03:04:05.999",
            "2026-09-09",
            "2026-09-09T03:04:05",
        ),
        (
            "2026-02-29T03:04:05",
            "2026-02-29T03:04:05",
            "2026-02-29T03:04:05",
        ),
    ] {
        let data = json!({"day":input,"time":input});
        let initial = Form::new(template.clone(), &data, BindOptions::default()).unwrap();
        let mut injected = Form::new(template.clone(), &json!({}), BindOptions::default()).unwrap();
        injected.set_data(&data).unwrap();
        assert_eq!(initial.get_data(), data);
        assert_eq!(injected.get_data(), data);
        assert_eq!(initial.fields(), injected.fields());
        assert_eq!(
            render_form(&initial).unwrap(),
            render_form(&injected).unwrap()
        );
        assert_eq!(initial.fields()[0]["widget"]["attrs"]["value"], day);
        assert_eq!(initial.fields()[1]["widget"]["attrs"]["value"], time);
        let list = build_list(&list_spec, &[data], &ListOptions::default()).unwrap();
        assert_eq!(list["rows"][0]["cells"][0]["display"], time);
        assert_eq!(list["rows"][0]["cells"][0]["value"], input);
    }
}

#[test]
fn copied_nested_rows_have_new_keys_and_operations_preserve_order() {
    let mut form = Form::new(template(), &record(), BindOptions::default()).unwrap();
    let key = form
        .copy_row(
            "companies",
            "__0000000000005__",
            AddRowOptions {
                key: Some("__a000000000001__".into()),
                ..Default::default()
            },
        )
        .unwrap();
    let data = form.get_data();
    let original = &data["companies"]["__0000000000005__"];
    let copied = &data["companies"][&key];
    assert_eq!(original["name"], copied["name"]);
    assert_ne!(
        original["stores"]
            .as_object()
            .unwrap()
            .keys()
            .collect::<Vec<_>>(),
        copied["stores"]
            .as_object()
            .unwrap()
            .keys()
            .collect::<Vec<_>>()
    );
    assert_eq!(
        original["stores"]
            .as_object()
            .unwrap()
            .values()
            .collect::<Vec<_>>(),
        copied["stores"]
            .as_object()
            .unwrap()
            .values()
            .collect::<Vec<_>>()
    );
    form.move_row("companies", &key, 0).unwrap();
    let saved = sequence_row_key("42").unwrap();
    form.rekey_row("companies", &key, &saved).unwrap();
    assert_eq!(
        form.get_data()["companies"]
            .as_object()
            .unwrap()
            .keys()
            .next(),
        Some(&saved)
    );
    form.remove_row("companies", &saved).unwrap();
    assert_eq!(form.get_data(), record());
}

#[test]
fn failed_operations_are_atomic_and_empty_collections_remain_empty() {
    let mut form = Form::new(template(), &record(), BindOptions::default()).unwrap();
    let before = form.get_data();
    let html = render_form(&form).unwrap();
    assert!(form
        .add_row(
            "companies",
            AddRowOptions {
                key: Some("__0000000000005__".into()),
                ..Default::default()
            }
        )
        .is_err());
    assert!(form
        .add_row(
            "companies",
            AddRowOptions {
                key: Some("1".into()),
                ..Default::default()
            }
        )
        .is_err());
    assert!(form
        .add_row(
            "companies",
            AddRowOptions {
                after_key: Some("missing".into()),
                ..Default::default()
            }
        )
        .is_err());
    assert!(form.remove_row("companies", "missing").is_err());
    assert!(form.move_row("companies", "__0000000000005__", 3).is_err());
    assert!(form
        .rekey_row("companies", "__0000000000005__", "__0000000000007__")
        .is_err());
    assert!(form.set_data(&json!({"companies":[]})).is_err());
    assert!(form.set_data(&json!({"companies":null})).is_err());
    assert_eq!(before, form.get_data());
    assert_eq!(html, render_form(&form).unwrap());
    form.set_data(&json!({"companies":{}})).unwrap();
    assert!(form.get_data()["companies"].as_object().unwrap().is_empty());
    assert!(render_form(&form).unwrap().contains("<div class=\"crudui-node__footer\"><div class=\"crudui-controls\" role=\"group\" aria-label=\"컬렉션 컨트롤\"><button type=\"button\" class=\"crudui-action\" data-crudui-action=\"add-row\" aria-label=\"추가\"></button></div></div>"));
    form.add_row("companies", AddRowOptions::default()).unwrap();
    assert_eq!(form.get_data()["companies"].as_object().unwrap().len(), 1);
}

#[test]
fn null_and_omitted_values_have_different_defaults() {
    let template=compile_form(&json!({"type":"group","properties":{"tags":{"type":"text","multiple":true,"default":"default"},"value":{"type":"text","default":"default"}}}),&CompileOptions::default()).unwrap();
    let mut form = Form::new(
        template,
        &json!({"tags":{},"value":null}),
        BindOptions::default(),
    )
    .unwrap();
    let supplied: AddRowOptions =
        serde_json::from_value(json!({"key":"null_row","value":null})).unwrap();
    assert_eq!(supplied.value, Some(Value::Null));
    form.add_row("tags", supplied).unwrap();
    form.add_row(
        "tags",
        serde_json::from_value(json!({"key":"default_row"})).unwrap(),
    )
    .unwrap();
    assert!(form.get_data()["value"].is_null());
    assert!(form.get_data()["tags"]["null_row"].is_null());
    assert_eq!(form.get_data()["tags"]["default_row"], "default");
}

#[test]
fn bracket_paths_preserve_literal_dots_in_object_keys() {
    let template = compile_form(
        &json!({"type":"group","properties":{"name":{"type":"text"}}}),
        &CompileOptions::default(),
    )
    .unwrap();
    let mut form = Form::new(
        template,
        &json!({"meta":{"a.b":"old"}}),
        BindOptions::default(),
    )
    .unwrap();
    assert_eq!(form.get_value("meta[a.b]").unwrap(), "old");
    form.set_value("meta[a.b]", json!("new")).unwrap();
    assert_eq!(form.get_data()["meta"], json!({"a.b":"new"}));
}

#[test]
fn appearance_uses_the_validator_expression_recognizer() {
    let template=compile_form(&json!({"type":"group","properties":{"value":{"type":"text","design":{"class":"flags.active","style":"color: red!important"}}}}),&CompileOptions::default()).unwrap();
    let fields = bind_form(
        &template,
        &json!({"flags":{"active":"active"}}),
        &BindOptions::default(),
    )
    .unwrap();
    let attrs = &fields[0]["widget"]["attrs"];
    assert!(attrs["class"].as_str().unwrap().split(' ').any(|class| class == "true"));
    assert_eq!(attrs["style"], "color: red!important");
    assert!(fields[0].get("design").is_none());
}

#[test]
fn rows_have_ordered_controls_titles_and_sticky_headers() {
    let template = compile_form(&json!({"type":"group","properties":{
        "items":{"type":"group","label":"Items","multiple":{"min":1,"max":2,"copy":true,"sortable":true,"title":"name","header":"sticky"},"properties":{
            "name":{"type":"text"},
            "tags":{"type":"text","multiple":{"controls":"footer","header":"sticky"}}
        }}
    }}), &CompileOptions::default()).unwrap();
    let data = json!({"items":{"first":{"name":"One","tags":{"a":"x","b":"y"}},"second":{"name":"","tags":{}}}});
    let options = BindOptions { language: "en".into(), ..Default::default() };
    let fields = bind_form(&template, &data, &options).unwrap();
    let collection = &fields[0];
    assert_eq!(collection["kind"], "collection");
    assert_eq!(collection["header"], json!({"className":"","label":"Items","count":"Rows: 2"}));
    let first = &collection["children"][0];
    let names = first["controls"]["actions"].as_array().unwrap().iter()
        .map(|action| (action["name"].as_str().unwrap(), action["disabled"] == true))
        .collect::<Vec<_>>();
    assert_eq!(names, [("move-up", true), ("move-down", false), ("add-row", true), ("copy-row", true), ("remove-row", false)]);
    assert_eq!(first["header"], json!({"className":"","label":"Items","number":"1","title":"One","summary":"Nested rows: 2"}));
    assert_eq!((first["sticky"].clone(), first["stickyDepth"].clone()), (json!(true), json!(0)));
    assert_eq!(first["body"]["id"], "crudui:items.first:body");
    assert_eq!(collection["children"][1]["header"]["title"], "(untitled)");
    let tag = &first["children"][1]["children"][1];
    assert_eq!((tag["header"]["number"].clone(), tag["stickyDepth"].clone()), (json!("1.2"), json!(1)));
    let empty = &collection["children"][1]["children"][1];
    assert_eq!(empty["controls"]["placement"], "footer");
    let html = crate::render::render_fields(&fields);
    assert!(html.starts_with("<div class=\"crudui-form\"><div class=\"crudui-form__body\"><div class=\"crudui-node crudui-node--collection\" data-field-path=\"items\">"));
    assert!(html.contains("<div class=\"crudui-node crudui-node--row crudui-node--sticky\" data-crudui-row-key=\"first\"><div class=\"crudui-node__header\" style=\"--crudui-sticky-depth:0\"><button type=\"button\" class=\"crudui-action\" data-crudui-action=\"toggle-row\" aria-expanded=\"true\" aria-controls=\"crudui:items.first:body\" aria-label=\"Expand or collapse\"></button>"));
    assert!(html.contains("<span class=\"crudui-node__summary\" hidden=\"\">Nested rows: 2</span>"));
    let error = bind_form(&template, &data, &BindOptions { language: "fr".into(), ..Default::default() }).unwrap_err();
    assert_eq!(error.message, "Unsupported language: fr");
    for (language, message) in [
        (json!(5), "Language must be a string"),
        (json!(true), "Language must be a string"),
        (json!(["en"]), "Language must be a string"),
        (json!({"en": 1}), "Language must be a string"),
        (json!(""), "Unsupported language: "),
    ] {
        let options = BindOptions { language, ..Default::default() };
        let error = Form::new(template.clone(), &data, options).err().unwrap();
        assert_eq!((error.code.as_str(), error.message.as_str(), error.at.as_str()), ("INVALID_FORM_INPUT", message, ""));
    }
    let options = BindOptions { language: Value::Null, ..Default::default() };
    assert_eq!(bind_form(&template, &data, &options).unwrap()[0]["header"]["count"], "2개");
    for (options, message) in [
        (json!({"language":5,"keyPrefix":5}), "Language must be a string"),
        (json!({"language":"fr","keyPrefix":5,"idPrefix":5}), "keyPrefix must be a string"),
        (json!({"language":"fr","idPrefix":[],"unsupported":true}), "idPrefix must be a string"),
        (json!({"language":"fr","unsupported":true}), "unsupported must be throw or marker"),
        (json!({"language":"fr","unsupported":"other"}), "unsupported must be throw or marker"),
        (json!({"language":"fr","idPrefix":null,"keyPrefix":null,"unsupported":null}), "Unsupported language: fr"),
    ] {
        let options: BindOptions = serde_json::from_value(options).unwrap();
        for error in [bind_form(&template, &data, &options).unwrap_err(), Form::new(template.clone(), &data, options.clone()).err().unwrap()] {
            assert_eq!((error.code.as_str(), error.message.as_str(), error.at.as_str()), ("INVALID_FORM_INPUT", message, ""));
        }
    }
    let nulls: BindOptions = serde_json::from_value(json!({"idPrefix":null,"keyPrefix":null,"unsupported":null,"language":null})).unwrap();
    assert_eq!(bind_form(&template, &data, &nulls).unwrap(), bind_form(&template, &data, &BindOptions::default()).unwrap());
    let error = Form::new(template.clone(), &json!({"items":[]}), BindOptions { key_prefix: json!(5), ..Default::default() }).err().unwrap();
    assert_eq!(error.message, "Repeated data must be a keyed object: items");
}

#[test]
fn repeated_declarations_reject_titles_controls_and_headers() {
    for (field, message) in [
        (json!({"type":"text","multiple":{"title":"name"}}), "Invalid multiple.title at rows: expected a repeated group"),
        (json!({"type":"group","multiple":{"title":"missing"},"properties":{"name":{"type":"text"}}}), "Invalid multiple.title at rows: expected the name of a direct child field without multiple, properties or lang"),
        (json!({"type":"group","multiple":{"title":"name"},"properties":{"name":{"type":"text","lang":true}}}), "Invalid multiple.title at rows: expected the name of a direct child field without multiple, properties or lang"),
        (json!({"type":"text","multiple":{"controls":"side","header":"fixed"}}), "Invalid multiple.controls at rows: expected header, footer or outline"),
        (json!({"type":"text","multiple":{"header":"fixed"}}), "Invalid multiple.header at rows: expected static or sticky"),
        (json!({"type":"text","lang":null}), "Invalid lang at rows: expected a boolean or an object"),
        (json!({"type":"text","lang":"ko"}), "Invalid lang at rows: expected a boolean or an object"),
        (json!({"type":"text","lang":["ko"]}), "Invalid lang at rows: expected a boolean or an object"),
        (json!({"type":"text","multiple":"yes","lang":null}), "Invalid multiple at rows: expected a boolean or an object"),
        (json!({"type":"text","lang":null,"design":[]}), "Invalid lang at rows: expected a boolean or an object"),
        (json!({"type":"text","lang":{"only":"ko"}}), "Invalid lang.only at rows: expected a list of language codes or an object"),
        (json!({"type":"text","lang":{"only":null}}), "Invalid lang.only at rows: expected a list of language codes or an object"),
        (json!({"type":"text","lang":{"only":["ko",3]},"design":[]}), "Invalid lang.only at rows: expected a list of language codes or an object"),
    ] {
        let spec = json!({"type":"group","properties":{"rows":field}});
        assert_eq!(compile_form(&spec, &CompileOptions::default()).unwrap_err().message, message);
    }
}

#[test]
fn row_keys_are_bounded_and_random_keys_are_hexadecimal() {
    assert_eq!(sequence_row_key("0").unwrap(), "__0000000000000__");
    assert_eq!(
        sequence_row_key("9999999999999").unwrap(),
        "__9999999999999__"
    );
    for value in ["", "-1", "1.5", "10000000000000"] {
        assert!(sequence_row_key(value).is_err());
    }
    let keys = (0..100)
        .map(|_| create_row_key().unwrap())
        .collect::<std::collections::HashSet<_>>();
    assert_eq!(keys.len(), 100);
    for key in keys {
        assert_eq!(key.len(), 17);
        assert!(key[2..15].bytes().all(|c| c.is_ascii_hexdigit()));
    }
}

#[test]
fn native_fixture_records() {
    let forms: Vec<Value> = serde_json::from_str(include_str!(
        "../../../tests/fixtures/form-render/cases.json"
    ))
    .unwrap();
    let lists: Vec<Value> = serde_json::from_str(include_str!(
        "../../../tests/fixtures/list-render/cases.json"
    ))
    .unwrap();
    let form_records=forms.iter().map(|case| {
        let options=CompileOptions {
            files:case["options"]["files"].as_object().cloned().unwrap_or_default(),
            basepath:case["options"]["basepath"].as_str().unwrap_or("").into(),
            key_prefix:case["options"]["keyPrefix"].as_str().map(str::to_owned),
            ..Default::default()
        };
        let result=compile_form(&case["spec"],&options).and_then(|template| {
            let bind:BindOptions=serde_json::from_value(case.get("options").cloned().unwrap_or(json!({}))).unwrap();
            let fields=bind_form(&template,case.get("data").unwrap_or(&json!({})),&bind)?;
            Ok(json!({"name":case["name"],"template":template,"fields":fields,"html":crate::render::render_fields(&fields)}))
        });
        if let Some(expected)=case.get("expectError") {
            assert_eq!(result.as_ref().unwrap_err().code,expected["code"].as_str().unwrap(),"{}",case["name"]);
        } else {assert!(result.is_ok(),"{}: {:?}",case["name"],result.as_ref().err());}
        result.unwrap_or_else(|error|json!({"name":case["name"],"error":{"code":error.code,"message":error.message,"at":error.at}}))
    }).collect::<Vec<_>>();
    let list_records=lists.iter().map(|case| {
        let options=ListOptions {
            files:case["options"]["files"].as_object().cloned().unwrap_or_default(),
            basepath:case["options"]["basepath"].as_str().unwrap_or("").into(),
            language:case["options"]["language"].as_str().unwrap_or("ko").into(),
            data:case["options"].get("data").cloned().unwrap_or(json!({})),
            page_meta:case["options"]["pageMeta"].as_object().cloned().unwrap_or_default(),
            layout:case["options"]["layout"].as_str().unwrap_or("table").into(),
            ..Default::default()
        };
        let rows=case["rows"].as_array().map(Vec::as_slice).unwrap_or(&[]);
        let result=build_list(&case["spec"],rows,&options).and_then(|model|Ok(json!({"name":case["name"],"model":model,"html":render_list(&case["spec"],rows,&options)?})));
        if let Some(expected)=case.get("expectError") {assert_eq!(result.as_ref().unwrap_err().code,expected["code"].as_str().unwrap(),"{}",case["name"]);}
        else {assert!(result.is_ok(),"{}: {:?}",case["name"],result.as_ref().err());}
        result.unwrap_or_else(|error|json!({"name":case["name"],"error":{"code":error.code,"message":error.message,"at":error.at}}))
    }).collect::<Vec<_>>();
    if let Ok(path) = std::env::var("CRUDUI_GENERATOR_FIXTURE_OUTPUT") {
        assert!(
            std::path::Path::new(&path).is_absolute(),
            "Fixture output requires an explicit absolute path"
        );
        std::fs::write(
            path,
            serde_json::to_vec(&json!({"forms":form_records,"lists":list_records})).unwrap(),
        )
        .unwrap();
    }
}

#[test]
fn number_cells_preserve_decimal_rounding_and_exponent_notation() {
    let rows = vec![
        json!({"number":2.5}),
        json!({"number":-2.5}),
        json!({"number":1.005}),
        json!({"number":1e21}),
        json!({"number":-0.0}),
        json!({"number":" 12.5 "}),
        json!({"number":"0x10"}),
    ];
    for (decimals, expected) in [
        (0, vec!["3", "-3", "1", "1e+21", "0", "13", "16"]),
        (
            2,
            vec!["2.50", "-2.50", "1.00", "1e+21", "0.00", "12.50", "16.00"],
        ),
    ] {
        let spec = json!({"columns":{"n":{"field":".number","format":{"type":"number","decimals":decimals}}}});
        let model = build_list(&spec, &rows, &ListOptions::default()).unwrap();
        let actual = model["rows"]
            .as_array()
            .unwrap()
            .iter()
            .map(|row| row["cells"][0]["display"].as_str().unwrap())
            .collect::<Vec<_>>();
        assert_eq!(actual, expected);
    }
    let spec =
        json!({"columns":{"n":{"field":".number","format":{"type":"number","decimals":101}}}});
    assert!(build_list(&spec, &rows, &ListOptions::default()).is_err());
}

#[test]
fn number_cells_parse_radix_strings_and_ecmascript_whitespace() {
    for (value, decimals, expected) in [
        (json!("0x10"), json!(2), "16.00"),
        (json!("0b101"), Value::Null, "5"),
        (json!("0o17"), Value::Null, "15"),
        (
            json!("0xbeddbd88a491d408d0415072f52b9a13fda"),
            Value::Null,
            "1.0391742914815888e+42",
        ),
        (json!("\u{feff}\u{a0} 16 \u{3000}"), json!(2), "16.00"),
        (json!("\u{85}16"), json!(2), "\u{85}16"),
        (json!("0x+10"), Value::Null, "0x+10"),
        (json!("0x1_0"), Value::Null, "0x1_0"),
        (json!(1.25), json!("1"), "1.25"),
        (json!(1.25), json!(2.9), "1.25"),
        (json!(1.25), json!(-0.9), "1"),
        (json!("1e999"), json!(2), "1e999"),
    ] {
        let spec = json!({"columns":{"number":{"field":".number","format":{"type":"number","decimals":decimals}}}});
        let model = build_list(&spec, &[json!({"number":value})], &ListOptions::default()).unwrap();
        assert_eq!(model["rows"][0]["cells"][0]["display"], expected);
    }
}

#[test]
fn clone_has_independent_data_models_and_revision() {
    let original = Form::new(template(), &record(), BindOptions::default()).unwrap();
    let mut cloned = original.clone();
    cloned.set_value("memo", json!("changed")).unwrap();
    assert_eq!(original.get_data()["memo"], "saved");
    assert_eq!(original.revision(), 0);
    assert_eq!(cloned.get_data()["memo"], "changed");
    assert_eq!(cloned.revision(), 1);
    assert_ne!(
        render_form(&original).unwrap(),
        render_form(&cloned).unwrap()
    );
}

#[test]
fn compilation_preserves_original_error_trace() {
    let spec = json!({"type":"group","properties":{"$ref":"missing.json"}});
    let error = compile_form(&spec, &CompileOptions::default()).unwrap_err();
    assert_eq!(error.code, "REF_FILE_NOT_FOUND");
    assert!(!error.trace.is_empty());
    assert_eq!(error.at, error.trace.join("."));
}

#[test]
fn css_values_preserve_nested_separators_comments_and_escapes() {
    let css="--caption: \"one;two:three\"; background-image: url(\"data:image/svg+xml;utf8,<svg></svg>\"); --payload: {key:value;items:[a;b]}; width: calc(100% - 2px)";
    assert_eq!(crate::css::style_string(css), css);
    assert_eq!(crate::css::style_string("/* first;: */ color/**/: red; --token: a\\;b; --note: \"/* text;: */\"; width: var(--size /* ;: */, 12px)"),"color: red; --token: a\\;b; --note: \"/* text;: */\"; width: var(--size /* ;: */, 12px)");
    let css = "color:red!important; color:blue; --name: \"a;b\"";
    let template = compile_form(
        &json!({"type":"group","properties":{
            "plain":{"type":"text","design":{"style":css}},
            "raw":{"type":"text","behavior":{"onchange":"changed()"},"design":{"style":css}}
        }}),
        &CompileOptions::default(),
    )
    .unwrap();
    let form = Form::new(template, &json!({}), BindOptions::default()).unwrap();
    let model_css = "color: red!important; color: blue; --name: \"a;b\"";
    for field in form.fields() {
        assert_eq!(field["widget"]["attrs"]["style"], model_css);
    }
    let html = render_form(&form).unwrap();
    assert!(html.contains("style=\"color:blue;--name:&quot;a;b&quot;\""));
    assert!(html.contains("style=\"color: red!important; color: blue; --name: &quot;a;b&quot;\""));
}

#[test]
fn lists_emit_ordered_image_preloads_and_preserve_raw_html_behavior() {
    let spec = json!({"columns":{
        "image":{"field":".image","format":"image"},
        "link":{"field":".image","format":{"type":"link","href":{"true":"javascript:alert(1)"}}},
        "raw":{"field":".raw","format":"html"}
    },"actions":{"raw":{"format":{"type":"link","href":"javascript:raw()"}}}});
    let rows = vec![
        json!({"image":"/first.png","raw":"<img src=\"/raw.png\">"}),
        json!({"image":"/first.png"}),
        json!({"image":"data:image/png;base64,AAAA"}),
        json!({"image":"/second.png"}),
        json!({"image":""}),
    ];
    let html = render_list(&spec, &rows, &ListOptions::default()).unwrap();
    assert!(html.starts_with("<link rel=\"preload\" as=\"image\" href=\"/first.png\"/><link rel=\"preload\" as=\"image\" href=\"/second.png\"/>"));
    assert_eq!(html.matches("rel=\"preload\"").count(), 2);
    assert!(html.contains("javascript:throw new Error(&#x27;React has blocked a javascript: URL as a security precaution.&#x27;)"));
    assert!(html.contains("href=\"javascript:raw()\""));
    assert!(html.contains("<img src=\"/raw.png\">"));
    assert!(!html.contains("src=\"\""));
}

#[test]
fn display_defaults_do_not_replace_explicit_null() {
    for kind in ["dummy", "html", "static"] {
        let template = compile_form(
            &json!({"type":"group","properties":{"display":{"type":kind,"default":"default"}}}),
            &CompileOptions::default(),
        )
        .unwrap();
        assert_eq!(
            bind_form(&template, &json!({}), &BindOptions::default()).unwrap()[0]["widget"]
                ["rawHtml"],
            "default"
        );
        assert_eq!(
            bind_form(&template, &json!({"display":null}), &BindOptions::default()).unwrap()[0]
                ["widget"]["rawHtml"],
            ""
        );
    }
}

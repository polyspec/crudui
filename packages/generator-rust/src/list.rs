use crudui_validator::compose::{compose_properties, ComposeOptions, FileLoader, MemoryLoader};
use serde_json::{json, Map, Value};

use crate::design::{appearance, resolve_design, show};
use crate::render::{appearance_attrs, element, escape, raw_element, raw_text};
use crate::util::{join_class, scalar, segments, translate, value_at};
use crate::{FormError, FormResult};

/// Composition, language, display context and pagination inputs for a list.
pub struct ListOptions<'a> {
    /// Parsed documents available to composition.
    pub files: Map<String, Value>,
    /// Optional explicit composition loader.
    pub loader: Option<&'a dyn FileLoader>,
    /// Base directory for relative document references.
    pub basepath: String,
    /// Content language.
    pub language: String,
    /// List-level data used by column visibility expressions.
    pub data: Value,
    /// Injected page and total metadata; no totals are derived from display rows.
    pub page_meta: Map<String, Value>,
    /// Output layout: `table` or `card`.
    pub layout: String,
}

impl Default for ListOptions<'_> {
    fn default() -> Self {
        Self {
            files: Map::new(),
            loader: None,
            basepath: String::new(),
            language: "ko".into(),
            data: json!({}),
            page_meta: Map::new(),
            layout: "table".into(),
        }
    }
}

fn format(value: Option<&Value>) -> Value {
    match value {
        Some(Value::String(kind)) if !kind.is_empty() => json!({"type":kind,"options":{}}),
        Some(Value::Object(options)) => {
            json!({"type":options.get("type").and_then(Value::as_str).filter(|s| !s.is_empty()).unwrap_or("text"),"options":options})
        }
        _ => json!({"type":"text","options":{}}),
    }
}

fn interpolate(template: &str, row: &Value, value: Option<&Value>) -> String {
    let pattern = regex::Regex::new(r"\.[A-Za-z_][\w.]*").expect("field interpolation pattern");
    pattern
        .replace_all(template, |capture: &regex::Captures<'_>| {
            let path = &capture[0][1..];
            scalar(if path == "field" {
                value
            } else {
                value_at(row, path).or(value)
            })
        })
        .into_owned()
}

fn truthy(value: Option<&Value>) -> bool {
    match value {
        None | Some(Value::Null) => false,
        Some(Value::Bool(value)) => *value,
        Some(Value::Number(value)) => value.as_f64().is_some_and(|v| v != 0.0),
        Some(Value::String(value)) => !["", "0", "false"].contains(&value.as_str()),
        _ => true,
    }
}

fn cell_display(
    format: &Value,
    value: Option<&Value>,
    row: &Value,
    path: &str,
    language: &str,
) -> FormResult<Value> {
    let kind = format["type"].as_str().unwrap_or("text");
    let options = &format["options"];
    let text = scalar(value);
    let display = match kind {
        "date" => {
            let pattern = options["pattern"]
                .as_str()
                .filter(|s| !s.is_empty())
                .unwrap_or("YYYY-MM-DD");
            crate::date::format(&text, pattern).into()
        }
        "number" => {
            let number = crate::number::parse(&text);
            let Some(number) = number.filter(|v| v.is_finite()) else {
                return Ok(text.into());
            };
            let mut buffer = ryu_js::Buffer::new();
            let mut body = match options["decimals"].as_f64() {
                Some(decimals) if (0.0..=100.0).contains(&decimals.trunc()) => {
                    buffer.format_to_fixed(number, decimals as u8).to_owned()
                }
                Some(_) => {
                    return Err(FormError::input(
                        "toFixed() digits argument must be between 0 and 100",
                    ))
                }
                _ => buffer.format(number).to_owned(),
            };
            if truthy(options.get("thousands")) {
                let (integer, fraction) = body
                    .split_once('.')
                    .map(|(i, f)| (i, Some(f)))
                    .unwrap_or((&body, None));
                let grouped = regex::Regex::new(r"[0-9]+")
                    .expect("digit grouping pattern")
                    .replace_all(integer, |capture: &regex::Captures<'_>| {
                        let digits = &capture[0];
                        let mut grouped = String::new();
                        for (index, character) in digits.chars().enumerate() {
                            if index > 0 && (digits.len() - index).is_multiple_of(3) {
                                grouped.push(',');
                            }
                            grouped.push(character);
                        }
                        grouped
                    })
                    .into_owned();
                body = grouped + &fraction.map(|f| format!(".{f}")).unwrap_or_default();
            }
            (translate(options.get("prefix"), language)
                + &body
                + &translate(options.get("suffix"), language))
                .into()
        }
        "badge" => {
            let raw = options["map"].get(&text);
            if raw.is_some_and(|v| v.is_object() || v.is_array()) {
                let resolved = translate(raw, language);
                json!({"kind":"badge","variant":resolved,"label":resolved})
            } else {
                json!({"kind":"badge","variant":scalar(raw),"label":text})
            }
        }
        "link" => {
            let href = match options.get("href") {
                Some(Value::String(template)) => template.clone(),
                Some(value @ Value::Object(_)) => appearance(Some(value), row, &segments(path)),
                _ => String::new(),
            };
            let caption = options.get("text").filter(|v| !v.is_null() && **v != "");
            let mut result = json!({"kind":"link","href":interpolate(&href,row,value),"text":caption.map(|v|translate(Some(v),language)).unwrap_or(text)});
            if let Some(target) = options["target"].as_str().filter(|s| !s.is_empty()) {
                result["target"] = target.into();
            }
            result
        }
        "choice-label" => {
            let items = &options["items"];
            let raw = if items.get("model").is_some() {
                None
            } else if let Some(array) = items.as_array() {
                text.parse::<usize>().ok().and_then(|i| array.get(i))
            } else {
                items.get(&text)
            };
            raw.map(|v| {
                if v.is_object() {
                    translate(Some(v), language)
                } else {
                    scalar(Some(v))
                }
            })
            .unwrap_or(text)
            .into()
        }
        "bool" => {
            let value = truthy(value);
            let source = options
                .get(if value { "true" } else { "false" })
                .filter(|v| !v.is_null());
            json!({"kind":"bool","value":value,"label":source.map(|v|translate(Some(v),language)).unwrap_or_else(||value.to_string()),"as":options["as"].as_str().filter(|s|!s.is_empty()).unwrap_or("text")})
        }
        "image" => {
            let mut result = json!({"kind":"image","src":text,"alt":interpolate(&translate(options.get("alt"),language),row,value)});
            for key in ["width", "height"] {
                if let Some(value) = options.get(key) {
                    result[key] = scalar(Some(value)).into();
                }
            }
            result
        }
        "html" => json!({"kind":"html","html":text}),
        _ => {
            let limit = options
                .get("truncate")
                .and_then(|v| v.as_f64().or_else(|| scalar(Some(v)).parse::<f64>().ok()));
            match limit
                .filter(|n| n.is_finite() && *n > 0.0 && text.encode_utf16().count() as f64 > *n)
            {
                Some(limit) => (String::from_utf16_lossy(
                    &text.encode_utf16().take(limit as usize).collect::<Vec<_>>(),
                ) + "…")
                    .into(),
                None => text.into(),
            }
        }
    };
    Ok(display)
}

/// Compose a list and bind display rows without modifying the inputs.
pub fn build_list(spec: &Value, rows: &[Value], options: &ListOptions<'_>) -> FormResult<Value> {
    if !spec.is_object() || !options.data.is_object() || rows.iter().any(|row| !row.is_object()) {
        return Err(FormError::input(
            "List specifications, context and rows must be objects",
        ));
    }
    let memory = MemoryLoader::new(options.files.clone());
    let columns = compose_properties(
        spec["columns"].as_object().cloned().unwrap_or_default(),
        options.loader.unwrap_or(&memory),
        &ComposeOptions::with_basepath(&options.basepath),
    )?;
    let mut visible = Vec::new();
    for (key, raw) in &columns {
        if !raw.is_object() {
            continue;
        }
        let design = resolve_design(raw.get("design"), &options.data, "");
        if design["show"] == false {
            continue;
        }
        visible.push(json!({"key":key,"field":raw["field"].as_str().unwrap_or(""),"label":raw.get("label").map(|v|translate(Some(v),&options.language)).unwrap_or_else(||key.clone()),"format":format(raw.get("format")),"sortable":raw.get("sortable").filter(|v|!v.is_null()).is_some_and(|v|show(Some(v),&options.data,&[])),"design":design}));
    }
    let bound_rows = rows.iter().map(|row| {
        let cells = visible.iter().map(|column| {
            let path = column["field"].as_str().unwrap_or("").strip_prefix('.').unwrap_or(column["field"].as_str().unwrap_or(""));
            let value = if path.is_empty() {None} else {value_at(row,path)};
            let raw = &columns[column["key"].as_str().unwrap()];
            // A model is JSON: a path absent from the row is null, and the member is always present.
            Ok(json!({"format":column["format"],"value":value.cloned().unwrap_or(Value::Null),"display":cell_display(&column["format"],value,row,path,&options.language)?,"design":resolve_design(raw.get("design"),row,path)}))
        }).collect::<FormResult<Vec<_>>>()?;
        Ok(json!({"cells":cells}))
    }).collect::<FormResult<Vec<_>>>()?;
    let mut pagination =
        json!({"enabled":spec["pagination"] == true || spec["pagination"].is_object()});
    for (input, output) in [("per_page", "perPage"), ("mode", "mode")] {
        if let Some(value) = spec["pagination"].get(input).filter(|v| {
            if input == "mode" {
                v.is_string()
            } else {
                v.is_number()
            }
        }) {
            pagination[output] = value.clone();
        }
    }
    for key in ["page", "total"] {
        if let Some(value) = options.page_meta.get(key) {
            pagination[key] = value.clone();
        }
    }
    let mut actions = Vec::new();
    for (key, raw) in spec["actions"].as_object().into_iter().flatten() {
        if ["$ref", "$patch"].contains(&key.as_str()) {
            continue;
        }
        if let Some(script) = raw.as_str() {
            actions.push(json!({"key":key,"label":key,"behavior":{key:script}}));
            continue;
        }
        if !raw.is_object() {
            continue;
        }
        let mut action = json!({"key":key,"label":raw.get("label").map(|v|translate(Some(v),&options.language)).unwrap_or_else(||key.clone())});
        if raw.get("format").is_some() {
            action["format"] = format(raw.get("format"));
        }
        let mut behavior = Map::new();
        for (event, script) in raw["behavior"].as_object().into_iter().flatten() {
            if let Some(script) = script.as_str().or_else(|| script["script"].as_str()) {
                behavior.insert(event.clone(), script.into());
            }
        }
        if !behavior.is_empty() {
            action["behavior"] = behavior.into();
        }
        actions.push(action);
    }
    let mut result = json!({"columns":visible,"rows":bound_rows,"pagination":pagination,"actions":actions,"empty":translate(spec.get("empty"),&options.language),"design":resolve_design(spec.get("design"),&options.data,"")});
    if let Some(field) = spec["sort"]["field"].as_str().filter(|s| !s.is_empty()) {
        result["sort"] =
            json!({"field":field,"dir":if spec["sort"]["dir"]=="desc" {"desc"} else {"asc"}});
    }
    Ok(result)
}

fn str_at<'a>(value: &'a Value, key: &str) -> &'a str {
    value[key].as_str().unwrap_or("")
}

fn cell_body(display: &Value) -> String {
    if let Some(text) = display.as_str() {
        return escape(text);
    }
    match str_at(display, "kind") {
        "badge" => element(
            "span",
            &json!({"class":if str_at(display,"variant").is_empty() {"badge".into()} else {format!("badge badge-{}",str_at(display,"variant"))}}),
            &escape(str_at(display, "label")),
        ),
        "link" => {
            let mut attrs = json!({"href":display["href"]});
            if let Some(target) = display.get("target") {
                attrs["target"] = target.clone();
            }
            element("a", &attrs, &escape(str_at(display, "text")))
        }
        "image" => {
            let mut attrs = json!({"src":display["src"],"alt":display["alt"]});
            for key in ["width", "height"] {
                if let Some(value) = display.get(key) {
                    attrs[key] = value.clone();
                }
            }
            element("img", &attrs, "")
        }
        "bool" => match str_at(display, "as") {
            "check" => element(
                "span",
                &json!({"class":"bool-check","aria-label":display["label"]}),
                if display["value"] == true {
                    "✔"
                } else {
                    "✘"
                },
            ),
            "icon" => element(
                "span",
                &json!({"class":if display["value"]==true {"bool-icon bool-true"} else {"bool-icon bool-false"},"aria-label":display["label"]}),
                "",
            ),
            _ => element(
                "span",
                &json!({"class":"bool-text"}),
                &escape(str_at(display, "label")),
            ),
        },
        "html" => str_at(display, "html").into(),
        _ => String::new(),
    }
}

pub(crate) fn cell_html(cell: &Value, tag: &str, base: &str) -> String {
    let main = &cell["design"]["main"];
    element(
        tag,
        &appearance_attrs(
            join_class(&[base, str_at(main, "class")]),
            str_at(main, "style"),
        ),
        &cell_body(&cell["display"]),
    )
}

/// Render a list with supplied display rows in table or card layout.
pub fn render_list(spec: &Value, rows: &[Value], options: &ListOptions<'_>) -> FormResult<String> {
    if !["table", "card"].contains(&options.layout.as_str()) {
        return Err(FormError::input("List layout must be table or card"));
    }
    let model = build_list(spec, rows, options)?;
    let mut content = String::new();
    let mut toolbar = String::new();
    for action in model["actions"].as_array().unwrap() {
        let link = action["format"]["type"] == "link";
        let mut attrs = if link {
            json!({"href":action["format"]["options"]["href"].as_str().unwrap_or("#")})
        } else {
            json!({"type":"button"})
        };
        if link {
            if let Some(target) = action["format"]["options"]["target"].as_str() {
                attrs["target"] = target.into();
            }
        }
        for (event, script) in action["behavior"].as_object().into_iter().flatten() {
            attrs[format!("on{event}")] = script.clone();
        }
        toolbar += &element(
            "span",
            &json!({"class":"list-action","data-action":action["key"]}),
            &raw_element(
                if link { "a" } else { "button" },
                &attrs,
                &raw_text(str_at(action, "label")),
            ),
        );
    }
    if !toolbar.is_empty() {
        content += &element("div", &json!({"class":"list-actions"}), &toolbar);
    }
    let columns = model["columns"].as_array().unwrap();
    let rows = model["rows"].as_array().unwrap();
    if rows.is_empty() {
        content += &element(
            "div",
            &json!({"class":"list-empty"}),
            &escape(str_at(&model, "empty")),
        );
    } else if options.layout == "card" {
        let cards = rows
            .iter()
            .map(|row| {
                let cells = row["cells"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .enumerate()
                    .map(|(index, cell)| {
                        let class = join_class(&[
                            &format!("list-td list-td-{}", str_at(&cell["format"], "type")),
                            str_at(&cell["design"]["main"], "class"),
                        ]);
                        element(
                            "div",
                            &json!({"class":class}),
                            &(element(
                                "span",
                                &json!({"class":"list-card-label"}),
                                &escape(str_at(&columns[index], "label")),
                            ) + &cell_html(cell, "span", "list-card-value")),
                        )
                    })
                    .collect::<String>();
                element("article", &json!({"class":"list-card"}), &cells)
            })
            .collect::<String>();
        content += &element("div", &json!({"class":"list-cards"}), &cards);
    } else {
        let header = columns
            .iter()
            .map(|column| {
                let main = &column["design"]["main"];
                let mut attrs = appearance_attrs(
                    join_class(&["list-th", str_at(main, "class")]),
                    str_at(main, "style"),
                );
                if !str_at(column, "field").is_empty() {
                    attrs["data-field"] = column["field"].clone();
                }
                if column["sortable"] == true {
                    attrs["data-sortable"] = "true".into();
                }
                if model.get("sort").is_some()
                    && (model["sort"]["field"] == column["field"]
                        || model["sort"]["field"] == column["key"])
                {
                    attrs["data-sort-dir"] = model["sort"]["dir"].clone();
                }
                let mut body = element(
                    "span",
                    &json!({"class":"list-th-label"}),
                    &escape(str_at(column, "label")),
                );
                if column["sortable"] == true {
                    body += &element("span", &json!({"class":"list-sort"}), "↕");
                }
                element("th", &attrs, &body)
            })
            .collect::<String>();
        let body = rows
            .iter()
            .map(|row| {
                element(
                    "tr",
                    &json!({}),
                    &row["cells"]
                        .as_array()
                        .unwrap()
                        .iter()
                        .map(|cell| {
                            cell_html(
                                cell,
                                "td",
                                &format!("list-td list-td-{}", str_at(&cell["format"], "type")),
                            )
                        })
                        .collect::<String>(),
                )
            })
            .collect::<String>();
        content += &element(
            "table",
            &json!({"class":"list-table"}),
            &(element("thead", &json!({}), &element("tr", &json!({}), &header))
                + &element("tbody", &json!({}), &body)),
        );
    }
    let pagination = &model["pagination"];
    if pagination["enabled"] == true {
        let mut attrs = json!({"class":"list-pagination"});
        for (input, output) in [
            ("mode", "data-mode"),
            ("perPage", "data-per-page"),
            ("page", "data-page"),
            ("total", "data-total"),
        ] {
            if let Some(value) = pagination
                .get(input)
                .filter(|v| input != "mode" || **v != "")
            {
                attrs[output] = scalar(Some(value)).into();
            }
        }
        content += &element("nav", &attrs, "");
    }
    let wrapper = &model["design"]["wrapper"];
    let mut sources = Vec::new();
    for row in rows {
        for cell in row["cells"].as_array().into_iter().flatten() {
            let display = &cell["display"];
            if display["kind"] != "image" {
                continue;
            }
            let source = str_at(display, "src");
            if source.is_empty()
                || source
                    .get(..5)
                    .is_some_and(|prefix| prefix.eq_ignore_ascii_case("data:"))
                || sources.contains(&source)
            {
                continue;
            }
            sources.push(source);
        }
    }
    let preloads = sources
        .iter()
        .map(|source| {
            element(
                "link",
                &json!({"rel":"preload","as":"image","href":source}),
                "",
            )
        })
        .collect::<String>();
    Ok(preloads
        + &element(
            "div",
            &appearance_attrs(
                join_class(&["list-view", str_at(wrapper, "class")]),
                str_at(wrapper, "style"),
            ),
            &content,
        ))
}

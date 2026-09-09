use crate::util::*;
use serde_json::{json, Map, Value};

pub(crate) struct WidgetContext<'a> {
    pub spec: &'a Value,
    pub value: Option<&'a Value>,
    pub path: &'a str,
    pub design: &'a Value,
    pub key_prefix: Option<&'a str>,
    pub id: &'a str,
    pub language: &'a str,
    pub row_segments: &'a [usize],
}

impl WidgetContext<'_> {
    fn name(&self) -> String {
        bracket(self.path, self.key_prefix)
    }
    fn class(&self, base: &str) -> String {
        join_class(&[base, self.design["main"]["class"].as_str().unwrap_or("")])
    }
    fn style(&self) -> String {
        style(self.design["main"]["style"].as_str().unwrap_or(""))
    }
    fn option(&self, key: &str) -> Option<String> {
        self.spec["options"]
            .get(key)
            .filter(|v| !v.is_null())
            .map(|v| scalar(Some(v)))
    }
    fn opt(&self, key: &str, default: &str) -> String {
        self.option(key).unwrap_or_else(|| default.into())
    }
    fn text(&self, key: &str) -> String {
        translate(self.spec.get(key), self.language)
    }
    fn value(&self) -> String {
        default_string(self.value, self.spec)
    }
    fn script(&self, action: &str) -> String {
        let value = &self.spec["behavior"][action];
        value
            .as_str()
            .or_else(|| value["script"].as_str())
            .unwrap_or("")
            .into()
    }
    fn behavior(&self, attrs: &mut Map<String, Value>) {
        if let Some(map) = self.spec["behavior"].as_object() {
            for (action, _) in map {
                put_nonempty(attrs, action, self.script(action));
            }
        }
    }
    fn data_attrs(&self, attrs: &mut Map<String, Value>) {
        put_string(attrs, "data-name", leaf_name(self.path, self.row_segments));
        put_string(
            attrs,
            "data-rule-name",
            rule_name(self.path, self.row_segments),
        );
        put_string(attrs, "data-default", scalar(self.spec.get("default")));
    }
    fn affixes(&self, model: &mut Value, append: bool) {
        let text = self.text("prepend");
        if !text.is_empty() {
            let mut affix = json!({"text":text,"class":join_class(&["input-group-text",self.design["prepend"]["class"].as_str().unwrap_or("")])});
            let style = style(self.design["prepend"]["style"].as_str().unwrap_or(""));
            if !style.is_empty() {
                affix["style"] = style.into();
            }
            model["prepend"] = affix;
        }
        let text = self.text("append");
        if append && !text.is_empty() {
            model["append"] = json!({"text":text,"class":"input-group-text"});
        }
    }
}

fn kind(name: &str) -> Option<&str> {
    Some(match name {
        "text" | "string" => "text",
        "integer" | "float" | "decimal" | "number" => "number",
        "select" | "dropdown" | "selectbox" => "select",
        "choice" | "radio" => "choice",
        "multichoice" | "checkboxes" | "checkcontainer" => "multichoice",
        "datetime-local" | "datetime" => "datetime",
        "html" | "static" | "dummy" => "dummy",
        "cover-simple" | "cover" => "cover",
        "search" | "autocomplete" => "search",
        "tinymce" | "wysiwyg" => "tinymce",
        "button" | "action" => "button",
        "email" | "password" | "textarea" | "hidden" | "date" | "dummy-input" | "image"
        | "file" | "image-viewer" | "summernote" | "editorjs" | "tui" | "tagify" | "tagify2" => {
            name
        }
        _ => return None,
    })
}

fn source(items: &Value) -> Option<Value> {
    let items = items.as_object().filter(|m| m.contains_key("model"))?;
    Some(
        json!({"data-source-model":scalar(items.get("model")),"data-source-method":scalar(items.get("method")),
        "data-source-table":scalar(items.get("table")),
        "data-source-relations":items.get("relations").filter(|v| !v.is_null()).cloned().unwrap_or(json!([])).to_string()}),
    )
}

fn entries(items: &Value) -> Vec<(String, &Value)> {
    match items {
        Value::Array(a) => a
            .iter()
            .enumerate()
            .map(|(i, v)| (i.to_string(), v))
            .collect(),
        Value::Object(m) if !m.contains_key("model") => {
            m.iter().map(|(k, v)| (k.clone(), v)).collect()
        }
        _ => Vec::new(),
    }
}

fn options(ctx: &WidgetContext<'_>, multi: bool, choice: bool) -> Vec<Value> {
    let items = &ctx.spec["items"];
    let selected = match ctx.value.or_else(|| ctx.spec.get("default")) {
        Some(Value::Array(a)) if multi => a
            .iter()
            .map(|v| {
                if ctx.value.is_some() {
                    js_string(v)
                } else {
                    scalar(Some(v))
                }
            })
            .collect::<Vec<_>>(),
        Some(v) if multi && crudui_validator::expr::is_truthy(v) => vec![js_string(v)],
        _ if multi => Vec::new(),
        _ => vec![ctx.value()],
    };
    let default = ctx
        .spec
        .get("default")
        .filter(|v| !v.is_array() && !v.is_null())
        .map(|v| scalar(Some(v)));
    entries(items).into_iter().map(|(key,value)| {
        let label = translate(Some(value),ctx.language);
        json!({"value":key,"label":if label.is_empty(){scalar(Some(value))}else{label},
            "selected":selected.contains(&key),"isDefault":choice && default.as_ref().is_some_and(|d| d == &key)})
    }).collect()
}

fn empty_option() -> Value {
    json!({"value":"","label":"select","selected":false,"isDefault":false})
}

fn script_string(value: &str) -> String {
    serde_json::to_string(value)
        .expect("string serialization")
        .replace('<', "\\u003c")
        .replace('\u{2028}', "\\u2028")
        .replace('\u{2029}', "\\u2029")
}

fn format_date(value: &str, datetime: bool) -> String {
    crate::date::format(
        value,
        if datetime {
            "YYYY-MM-DDTHH:mm:ss"
        } else {
            "YYYY-MM-DD"
        },
    )
}

fn text_control(kind: &str, ctx: &WidgetContext<'_>) -> Value {
    let textarea = kind == "textarea";
    let hidden = kind == "hidden";
    let password = kind == "password";
    let dummy = kind == "dummy-input";
    let date = kind == "date" || kind == "datetime";
    let mut attrs = Map::new();
    if !textarea {
        put_string(
            &mut attrs,
            "type",
            match kind {
                "dummy-input" => "text",
                "datetime" => "datetime-local",
                _ => kind,
            },
        );
    }
    put_string(&mut attrs, "name", ctx.name());
    if !textarea {
        put_string(
            &mut attrs,
            "value",
            if date {
                format_date(&ctx.value(), kind == "datetime")
            } else if password {
                scalar(ctx.value)
            } else {
                ctx.value()
            },
        );
    }
    if dummy {
        put_string(&mut attrs, "readonly", "");
    }
    put_string(
        &mut attrs,
        "class",
        ctx.class(if hidden {
            "valid-target"
        } else if dummy {
            "form-control"
        } else {
            "valid-target form-control"
        }),
    );
    if textarea {
        put_string(&mut attrs, "rows", "5");
    }
    if !textarea && !hidden && !password && !date {
        put_nonempty(&mut attrs, "placeholder", ctx.text("placeholder"));
    }
    if !hidden {
        put_nonempty(&mut attrs, "style", ctx.style());
    }
    if !password && !hidden && !dummy {
        ctx.behavior(&mut attrs);
    }
    if dummy {
        put_string(&mut attrs, "data-default", scalar(ctx.spec.get("default")));
    } else {
        ctx.data_attrs(&mut attrs);
    }
    let layout = if hidden || password || kind == "datetime" {
        "bare"
    } else {
        "input-group"
    };
    let mut model = json!({"kind":kind,"layout":layout,"tag":if textarea{"textarea"}else{"input"},"attrs":attrs});
    if textarea {
        model["text"] = ctx.value().into();
    }
    if layout == "input-group" {
        ctx.affixes(&mut model, true);
    }
    model
}

fn select_control(ctx: &WidgetContext<'_>) -> Value {
    let source = source(&ctx.spec["items"]);
    let mut attrs = json!({"name":ctx.name(),"class":ctx.class(if source.is_some(){"valid-target form-select valid-target-async"}else{"valid-target form-select"})}).as_object().unwrap().clone();
    if let Some(ref source) = source {
        attrs.extend(source.as_object().unwrap().clone());
    }
    put_nonempty(&mut attrs, "style", ctx.style());
    ctx.behavior(&mut attrs);
    ctx.data_attrs(&mut attrs);
    let mut options = options(ctx, false, false);
    if options.is_empty() {
        options.push(empty_option());
    }
    let mut model = json!({"kind":"select","layout":"input-group","tag":"select","attrs":attrs,"source":source,"options":options});
    ctx.affixes(&mut model, true);
    model
}

fn choices(kind: &str, ctx: &WidgetContext<'_>) -> Value {
    let multi = kind == "multichoice";
    let source = source(&ctx.spec["items"]);
    let mut attrs = json!({"class":if multi {"btn-group flex-wrap btn-group-toggle"}else{"btn-group btn-group-toggle"}}).as_object().unwrap().clone();
    if !multi {
        put_string(&mut attrs, "data-toggle", "buttons");
    }
    if let Some(ref source) = source {
        attrs.extend(source.as_object().unwrap().clone());
    }
    let mut model = json!({"kind":kind,"layout":"btn-group","attrs":attrs,"source":source,"options":options(ctx,multi,!multi),
        "itemLabelClass":ctx.class(if multi {"btn btn-switch btn-mswitch"}else{"btn btn-switch"})});
    if source.is_none() {
        let mut input = json!({"name":ctx.name()+if multi{"[]"}else{""},"data-name":leaf_name(ctx.path,ctx.row_segments),"data-rule-name":rule_name(ctx.path,ctx.row_segments)}).as_object().unwrap().clone();
        put_nonempty(&mut input, "onchange", ctx.script("onchange"));
        if !multi {
            put_nonempty(&mut input, "onclick", ctx.script("onclick"));
        }
        model["extra"] = json!({"input":input});
    }
    model
}

fn file_control(kind: &str, ctx: &WidgetContext<'_>) -> Value {
    let base = match kind {
        "cover" => "valid-target form-control-file form-control-filetext form-control-image",
        "image" => "valid-target form-control-file form-control-image",
        _ => "valid-target form-control-file",
    };
    let mut file = json!({"type":"file","class":ctx.class(base)})
        .as_object()
        .unwrap()
        .clone();
    for key in [
        "max_width",
        "min_width",
        "max_height",
        "min_height",
        "preview_max_width",
        "preview_max_height",
    ] {
        put_string(
            &mut file,
            &format!("data-{}", key.replace('_', "-")),
            ctx.opt(key, "0"),
        );
    }
    put_string(
        &mut file,
        "name",
        ctx.name() + if kind == "cover" { "[name]" } else { "" },
    );
    put_string(
        &mut file,
        "data-name",
        leaf_name(ctx.path, ctx.row_segments),
    );
    put_string(
        &mut file,
        "data-rule-name",
        rule_name(ctx.path, ctx.row_segments),
    );
    ctx.behavior(&mut file);
    if kind != "cover" {
        put_string(&mut file, "value", "");
    }
    let accept = ctx.spec["validate"]["accept"]
        .as_str()
        .filter(|s| !s.is_empty())
        .map(str::to_owned)
        .unwrap_or_else(|| ctx.opt("accept", if kind == "file" { "*/*" } else { "image/*" }));
    put_string(&mut file, "accept", accept);
    let mut extra = json!({"file":file});
    if kind != "cover" {
        extra["display"] = json!({"type":"text","class":"form-control form-control-file","value":"","readonly":""});
    }
    let mut model = json!({"kind":kind,"layout":"file","attrs":{},"extra":extra});
    ctx.affixes(&mut model, false);
    model
}

fn display(kind: &str, ctx: &WidgetContext<'_>) -> Value {
    let mut attrs = Map::new();
    put_nonempty(
        &mut attrs,
        "class",
        ctx.design["main"]["class"].as_str().unwrap_or("").into(),
    );
    let raw = if kind == "image-viewer" {
        match ctx
            .value
            .and_then(Value::as_array)
            .filter(|a| !a.is_empty())
        {
            Some(images) => {
                let height = ctx.opt("height", "");
                let height = if height.is_empty() {
                    String::new()
                } else {
                    format!(" height=\"{height}\"")
                };
                images
                    .iter()
                    .map(|v| format!("<img src=\"{}\"{height}>", scalar(Some(v))))
                    .collect()
            }
            None => "이미지가 없습니다.".into(),
        }
    } else {
        put_nonempty(&mut attrs, "style", ctx.style());
        let mut value = ctx.value.or_else(|| ctx.spec.get("default"));
        if source(&ctx.spec["items"]).is_none() {
            if let Some(items) = ctx.spec["items"].as_object() {
                value = items.get(&scalar(value)).or(value);
            }
        }
        let text = scalar(value);
        regex::Regex::new(r"\r\n|\n\r|\r|\n")
            .expect("newline pattern")
            .replace_all(&text, "<br />$0")
            .into_owned()
    };
    json!({"kind":kind,"layout":"display","tag":"div","rawHtml":raw,"attrs":attrs})
}

fn search(ctx: &WidgetContext<'_>) -> Value {
    let id = ctx.id;
    let min = ctx.opt("keyword_min_length", "2");
    let delay = ctx.opt("delay", "250");
    let source = source(&ctx.spec["items"]);
    let mut attrs = json!({"class":ctx.class(if source.is_some(){"valid-target form-control valid-target-async"}else{"valid-target form-control"})}).as_object().unwrap().clone();
    put_nonempty(&mut attrs, "style", ctx.style());
    for (key, value) in [
        ("name", ctx.name()),
        ("data-keyword-min-length", min.clone()),
        ("data-delay", delay.clone()),
        ("data-api-server", ctx.opt("api_server", "")),
    ] {
        put_string(&mut attrs, key, value);
    }
    if let Some(ref source) = source {
        attrs.extend(source.as_object().unwrap().clone());
    }
    put_string(
        &mut attrs,
        "data-name",
        leaf_name(ctx.path, ctx.row_segments),
    );
    put_string(
        &mut attrs,
        "data-rule-name",
        rule_name(ctx.path, ctx.row_segments),
    );
    put_string(&mut attrs, "id", id);
    put_nonempty(&mut attrs, "onchange", ctx.script("onchange"));
    put_string(&mut attrs, "data-default", scalar(ctx.spec.get("default")));
    let callback = ctx.opt("callback", "");
    let callback = if callback.is_empty() {
        String::new()
    } else {
        format!(
            "$(document.getElementById({})).on('select2:select', {callback});",
            script_string(id)
        )
    };
    let dropdown_class = format!("{id}_select2");
    let style = if ctx.option("hide_searching").as_deref() != Some("") {
        format!(
            "[class~={}] .loading-results {{ display: none; }}",
            script_string(&dropdown_class)
        )
    } else {
        String::new()
    };
    let mut options = options(ctx, false, false);
    if options.is_empty() {
        options.push(empty_option());
    }
    let mut model = json!({"kind":"search","layout":"search","tag":"select","attrs":attrs,"source":source,"options":options,
        "script":format!("$(function() {{select2(CSS.escape({}), {}, {}, {});{callback}}});",script_string(id),script_string(&min),script_string(&delay),script_string(&dropdown_class)),"styleChrome":style});
    ctx.affixes(&mut model, true);
    model
}

fn editor(kind: &str, ctx: &WidgetContext<'_>) -> Value {
    let tagify = kind.starts_with("tagify");
    let id = ctx.id;
    let selector = format!("'#'+CSS.escape({})", script_string(id));
    let base = match kind {
        "tinymce" => "valid-target form-control tinymcearea",
        "summernote" => "valid-target form-control summernote",
        "editorjs" => "valid-target form-control contentjs",
        "tui" => "valid-target form-control tuiarea",
        _ => "valid-target form-control",
    };
    let mut attrs = Map::new();
    if tagify {
        put_string(&mut attrs, "type", "text");
    }
    put_string(&mut attrs, "id", id);
    put_string(&mut attrs, "class", ctx.class(base));
    put_string(&mut attrs, "name", ctx.name());
    if tagify {
        put_string(&mut attrs, "value", ctx.value());
    } else {
        put_string(
            &mut attrs,
            "rows",
            ctx.opt("rows", if kind == "summernote" { "5" } else { "3" }),
        );
    }
    let script = match kind {
        "tinymce" => {
            let height = ctx.opt("height", "300");
            let upload = ctx.opt("fileserver", "upload");
            put_string(
                &mut attrs,
                "data-type",
                ctx.spec["type"].as_str().unwrap_or("tinymce"),
            );
            put_string(&mut attrs, "data-height", &height);
            put_string(&mut attrs, "data-upload-server", &upload);
            format!(
                "$(function() {{editor_tinymce({selector}, {height}, {}, false);}});",
                script_string(&upload)
            )
        }
        "summernote" => format!(
            "$(function() {{editor_summernote({selector}, {});}});",
            script_string(&ctx.opt("upload", "upload"))
        ),
        "editorjs" | "tui" => {
            let server = ctx.opt("fileserver", "");
            put_string(&mut attrs, "data-fileserver", &server);
            format!(
                "$(function() {{editor_{kind}({selector}, {});}});",
                script_string(&server)
            )
        }
        _ => {
            let max = ctx.opt("max_tags", "0");
            put_string(&mut attrs, "data-max-tags", &max);
            let server = if kind == "tagify2" {
                let server = ctx.opt("server", "");
                put_string(&mut attrs, "data-server", &server);
                format!(", {}", script_string(&server))
            } else {
                String::new()
            };
            put_nonempty(&mut attrs, "placeholder", ctx.text("placeholder"));
            format!("$(function() {{editor_{kind}({selector}, {max}{server});}});")
        }
    };
    ctx.behavior(&mut attrs);
    ctx.data_attrs(&mut attrs);
    let mut model = json!({"kind":kind,"layout":"host-script","tag":if tagify{"input"}else{"textarea"},"attrs":attrs,"script":script});
    if !tagify {
        model["text"] = ctx.value().into();
    }
    model
}

fn button(ctx: &WidgetContext<'_>) -> Value {
    let name = ctx.name();
    let id = ctx.id;
    let init = ctx.opt("init_script", "");
    let onclick = ctx.script("onclick");
    let text = if ctx.spec.get("content").is_some() {
        ctx.text("content")
    } else {
        ctx.text("text")
    };
    json!({"kind":"button","layout":"button","script":format!("\n$(function() {{\n    {init}\n    $(document.getElementById({})).on('click', function() {{\n        {onclick}\n    }});\n}});\n",script_string(id)),
        "buttonText":text,"attrs":{"type":"button","class":ctx.class("btn"),"name":format!("btn{name}"),"id":id,"value":text},
        "extra":{"hidden":{"type":"hidden","class":"valid-target form-control","readonly":"","name":name,
            "data-name":leaf_name(ctx.path,ctx.row_segments),"data-rule-name":rule_name(ctx.path,ctx.row_segments),"value":ctx.value(),"data-default":scalar(ctx.spec.get("default"))}}})
}

pub(crate) fn evaluate_widget(field_type: &str, ctx: &WidgetContext<'_>) -> Option<Value> {
    let lower = field_type.to_lowercase();
    let kind = kind(&lower)?;
    let mut model = match kind {
        "select" => select_control(ctx),
        "choice" | "multichoice" => choices(kind, ctx),
        "image" | "file" | "cover" => file_control(kind, ctx),
        "dummy" | "image-viewer" => display(kind, ctx),
        "search" => search(ctx),
        "tinymce" | "summernote" | "editorjs" | "tui" | "tagify" | "tagify2" => editor(kind, ctx),
        "button" => button(ctx),
        _ => text_control(kind, ctx),
    };
    let id = ctx.id.to_owned();
    if model["tag"]
        .as_str()
        .is_some_and(|t| ["input", "select", "textarea"].contains(&t))
    {
        model["attrs"]["id"] = id.clone().into();
    }
    if model["extra"].get("file").is_some() {
        model["extra"]["file"]["id"] = id.clone().into();
    }
    if model["layout"] == "btn-group" {
        for (i, option) in model["options"]
            .as_array_mut()
            .unwrap()
            .iter_mut()
            .enumerate()
        {
            option["id"] = format!("{id}:{i}").into();
        }
    }
    Some(model)
}

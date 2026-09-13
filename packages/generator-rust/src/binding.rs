use crate::design::resolve_design;
use crate::util::*;
use crate::widget::{evaluate_widget, WidgetContext};
use crate::{FieldTemplate, FormError, FormResult, FormTemplate};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

/// Per-instance input names, content language and presentation.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct BindOptions {
    /// Stable DOM identifier prefix.
    pub id_prefix: String,
    /// Content language.
    pub language: String,
    /// Input prefix overriding the template prefix.
    pub key_prefix: Option<String>,
    /// Unsupported field handling: `throw` or `marker`.
    pub unsupported: String,
}
impl Default for BindOptions {
    fn default() -> Self {
        Self {
            id_prefix: "crudui".into(),
            language: "ko".into(),
            key_prefix: None,
            unsupported: "throw".into(),
        }
    }
}

struct Binding<'a> {
    data: &'a Value,
    options: &'a BindOptions,
    key_prefix: Option<&'a str>,
}

/// Evaluate field models using a compiled template and independent record data.
pub fn bind_form(
    template: &FormTemplate,
    data: &Value,
    options: &BindOptions,
) -> FormResult<Vec<Value>> {
    if !data.is_object() {
        return Err(FormError::input("Form data must be an object"));
    }
    if template.kind != "crudui/form-template" {
        return Err(FormError::input("Unsupported form template"));
    }
    if !["throw", "marker"].contains(&options.unsupported.as_str()) {
        return Err(FormError::input("unsupported must be throw or marker"));
    }
    let state = Binding {
        data,
        options,
        key_prefix: options
            .key_prefix
            .as_deref()
            .or(template.key_prefix.as_deref()),
    };
    template
        .fields
        .iter()
        .map(|field| state.field(field, &field.name, &[]))
        .collect()
}

fn multiple(spec: &Value) -> Option<Value> {
    match spec.get("multiple") {
        Some(Value::Bool(true)) => Some(json!({"show": true})),
        Some(Value::Object(m)) => {
            let mut result = json!({"show": true, "copy": m.get("copy").is_some_and(|v| *v == true), "sortable": m.get("sortable").is_some_and(|v| *v == true)});
            for key in ["min", "max"] {
                if let Some(n) = m.get(key).filter(|v| v.is_number()) {
                    result[key] = n.clone();
                }
            }
            Some(result)
        }
        _ => None,
    }
}

/// Row keys of a keyed collection. Missing data has one initial row.
fn rows(value: Option<&Value>, path: &str) -> FormResult<Vec<String>> {
    match value {
        None => Ok(vec!["__0000000000000__".into()]),
        Some(Value::Object(m)) => Ok(m.keys().cloned().collect()),
        Some(_) => Err(FormError::input(format!(
            "Repeated data must be a keyed object: {path}"
        ))),
    }
}

/// Present group data, including a repeated group row, must be an object.
fn check_group(value: Option<&Value>, path: &str) -> FormResult<()> {
    match value {
        Some(value) if !value.is_object() => Err(FormError::input(format!(
            "Group data must be an object: {path}"
        ))),
        _ => Ok(()),
    }
}

impl Binding<'_> {
    fn widget(
        &self,
        spec: &Value,
        path: &str,
        design: &Value,
        row_segments: &[usize],
    ) -> FormResult<Value> {
        let id = control_id(&self.options.id_prefix, path);
        let context = WidgetContext {
            spec,
            value: value_at(self.data, path),
            path,
            design,
            key_prefix: self.key_prefix,
            id: &id,
            language: &self.options.language,
            row_segments,
        };
        let kind = spec["type"].as_str().unwrap_or("");
        match evaluate_widget(kind, &context) {
            Some(widget) => Ok(widget),
            None if self.options.unsupported == "marker" => {
                Ok(json!({"unsupported": true, "type": kind}))
            }
            None => Err(FormError {
                code: "UNSUPPORTED_FIELD_TYPE".into(),
                message: format!("Unsupported field type \"{kind}\" at \"{path}\""),
                at: path.into(),
                trace: Vec::new(),
            }),
        }
    }

    fn children(
        &self,
        fields: &[FieldTemplate],
        path: &str,
        row_segments: &[usize],
    ) -> FormResult<Vec<Value>> {
        fields
            .iter()
            .map(|field| self.field(field, &format!("{path}.{}", field.name), row_segments))
            .collect()
    }

    fn field(
        &self,
        field: &FieldTemplate,
        path: &str,
        row_segments: &[usize],
    ) -> FormResult<Value> {
        let spec = Value::Object(field.spec.clone());
        let kind = spec["type"].as_str().unwrap_or("");
        let design = resolve_design(spec.get("design"), self.data, path);
        let wrapper = path.replace("[]", ".*");
        let wrapper_name = match self.key_prefix.filter(|p| !p.is_empty()) {
            Some(prefix) => format!("{prefix}.{wrapper}-layer"),
            None => format!("{wrapper}-layer"),
        };
        let mut model = json!({"shape": "leaf", "type": kind, "path": path,
            "wrapperName": wrapper_name, "uniqid": element_id("",path), "design": design,
            "omitLabel": kind == "hidden"});
        if spec
            .get("label")
            .is_some_and(crudui_validator::expr::is_truthy)
        {
            model["label"] = translate(spec.get("label"), &self.options.language).into();
        }
        let description = translate(spec.get("description"), &self.options.language);
        if !description.is_empty() {
            model["description"] = description.into();
        }
        if let Some(settings) = multiple(&spec) {
            let group = kind == "group";
            model["shape"] = if group {
                "multiple-group"
            } else {
                "multiple-leaf"
            }
            .into();
            model["multiple"] = settings;
            let mut nested_segments = row_segments.to_vec();
            nested_segments.push(segments(path).len());
            let bound = rows(value_at(self.data,path), path)?.into_iter().enumerate().map(|(i,key)| {
                let row_path = format!("{path}.{key}");
                let row_design = resolve_design(spec.get("design"),self.data,&row_path);
                let mut row = json!({"uniqid": key, "wrapperClass": join_class(&["input-group-wrapper", if i>0 { "clone-element" } else { "" }, row_design["wrapper"]["class"].as_str().unwrap_or("")])});
                if group {
                    check_group(value_at(self.data, &row_path), &row_path)?;
                    row["groupClass"] = join_class(&["form-group", row_design["group"]["class"].as_str().unwrap_or("")]).into();
                    row["children"] = self.children(&field.children,&row_path,&nested_segments)?.into();
                } else { row["widget"] = self.widget(&spec,&row_path,&row_design,&nested_segments)?; }
                Ok(row)
            }).collect::<FormResult<Vec<_>>>()?;
            model["rows"] = bound.into();
        } else if kind == "group" {
            check_group(value_at(self.data, path), path)?;
            model["shape"] = "group".into();
            model["groupClass"] = join_class(&[
                "form-group",
                design["group"]["class"].as_str().unwrap_or(""),
            ])
            .into();
            let style = style(design["group"]["style"].as_str().unwrap_or(""));
            if !style.is_empty() {
                model["groupStyle"] = style.into();
            }
            model["children"] = self.children(&field.children, path, row_segments)?.into();
        } else if spec
            .get("lang")
            .is_some_and(|v| *v == true || v.is_object())
        {
            model["shape"] = "lang".into();
            let lang = &spec["lang"];
            let defaults = json!(["ko", "en", "ja", "zh"]);
            let codes = lang
                .get("only")
                .and_then(Value::as_array)
                .filter(|a| !a.is_empty())
                .unwrap_or(defaults.as_array().unwrap());
            let class = join_class(&[
                if lang["frame"] == false {
                    "lang-group p-0 border-0"
                } else {
                    "lang-group"
                },
                lang["group_class"].as_str().unwrap_or(""),
            ]);
            let children = codes.iter().map(|code| {
                let path = format!("{path}.{}",js_string(code));
                let design = resolve_design(spec.get("design"),self.data,&path);
                Ok(json!({"code": code, "widget": self.widget(&spec,&path,&design,row_segments)?}))
            }).collect::<FormResult<Vec<_>>>()?;
            let mut language = json!({"groupClass": class, "children": children});
            let title = translate(lang.get("title"), &self.options.language);
            if !title.is_empty() {
                language["title"] = title.into();
            }
            model["lang"] = language;
        } else if kind == "checkbox" || kind == "switcher" {
            model["omitLabel"] = false.into();
            model["checkbox"] = true.into();
            model["checkboxId"] = control_id(&self.options.id_prefix, path).into();
            model["checkboxName"] = bracket(path, self.key_prefix).into();
            model["checkboxClass"] = join_class(&[
                "valid-target",
                design["main"]["class"].as_str().unwrap_or(""),
            ])
            .into();
            let checked = value_at(self.data, path)
                .or_else(|| spec.get("default"))
                .is_some_and(|v| *v == true || *v == 1 || *v == "1");
            model["checkboxChecked"] = checked.into();
        } else {
            model["widget"] = self.widget(&spec, path, &design, row_segments)?;
        }
        Ok(model)
    }
}

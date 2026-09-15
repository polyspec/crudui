//! Read-only detail models and HTML rendering.

use serde_json::{json, Map, Value};

use crate::list::{build_list, cell_html, ListOptions};
use crate::render::{element, escape};
use crate::util::join_class;
use crate::{FormError, FormResult};

/// Detail options use the same composition, language and data inputs as lists.
pub type DetailOptions<'a> = ListOptions<'a>;

/// Build one read-only detail model from a supplied record.
pub fn build_detail(
    spec: &Value,
    record: &Value,
    options: &DetailOptions<'_>,
) -> FormResult<Value> {
    let Some(spec) = spec.as_object() else {
        return Err(FormError::input("Detail specification must be an object"));
    };
    if !spec.contains_key("fields") {
        return Err(FormError::input("Detail specification must declare fields"));
    }
    let Some(record) = record.as_object() else {
        return Err(FormError::input("Detail record must be an object"));
    };
    if !options.data.is_null() && !options.data.is_object() {
        return Err(FormError::input("Detail context must be an object"));
    }
    let mut list_spec = Map::new();
    list_spec.insert("columns".into(), spec["fields"].clone());
    if let Some(design) = spec.get("design") {
        list_spec.insert("design".into(), design.clone());
    }
    let list = build_list(
        &Value::Object(list_spec),
        &[Value::Object(record.clone())],
        options,
    )?;
    let columns = list["columns"].as_array().cloned().unwrap_or_default();
    let cells = list["rows"]
        .as_array()
        .and_then(|rows| rows.first())
        .and_then(|row| row["cells"].as_array())
        .cloned()
        .unwrap_or_default();
    let fields = columns
        .iter()
        .zip(cells.iter())
        .map(|(column, cell)| {
            json!({
                "key": column["key"], "label": column["label"], "format": cell["format"],
                "value": cell["value"], "display": cell["display"], "design": cell["design"]
            })
        })
        .collect::<Vec<_>>();
    Ok(json!({"fields": fields, "design": list["design"]}))
}

/// Render one read-only detail as a definition list.
pub fn render_detail(
    spec: &Value,
    record: &Value,
    options: &DetailOptions<'_>,
) -> FormResult<String> {
    let model = build_detail(spec, record, options)?;
    let design = &model["design"];
    let class = join_class(&[
        "detail-view",
        design["wrapper"]["class"].as_str().unwrap_or(""),
    ]);
    let body = model["fields"]
        .as_array()
        .map(|fields| {
            fields
                .iter()
                .map(|field| {
                    let cell = json!({"display": field["display"], "design": field["design"], "format": field["format"]});
                    let label = element("dt", &json!({"class":"detail-label"}), &escape(field["label"].as_str().unwrap_or("")));
                    let value = cell_html(&cell, "dd", &format!("detail-value detail-value-{}", field["format"]["type"].as_str().unwrap_or("text")));
                    element("div", &json!({"class":"detail-field"}), &format!("{label}{value}"))
                })
                .collect::<String>()
        })
        .unwrap_or_default();
    let mut attrs = json!({"class": class});
    if let Some(style) = design["wrapper"]["style"]
        .as_str()
        .filter(|style| !style.is_empty())
    {
        attrs["style"] = style.into();
    }
    let mut preloads = String::new();
    let mut seen = std::collections::HashSet::new();
    if let Some(fields) = model["fields"].as_array() {
        for field in fields {
            let display = &field["display"];
            if display["kind"] != "image" {
                continue;
            }
            let Some(source) = display["src"].as_str().filter(|source| {
                !source.is_empty() && !source.to_ascii_lowercase().starts_with("data:")
            }) else {
                continue;
            };
            if seen.insert(source) {
                preloads.push_str(&element(
                    "link",
                    &json!({"rel":"preload", "as":"image", "href":source}),
                    "",
                ));
            }
        }
    }
    Ok(format!("{preloads}{}", element("dl", &attrs, &body)))
}

#[cfg(test)]
mod tests {
    use super::{build_detail, render_detail, DetailOptions};
    use serde_json::json;

    #[test]
    fn detail_reuses_ordered_list_display_model() {
        let spec = json!({"fields": {"name": {"field": ".name", "label": "Name"}, "active": {"field": ".active", "label": "Active", "format": {"type": "bool", "true": "Yes", "false": "No"}}}});
        let model = build_detail(
            &spec,
            &json!({"name": "Ada", "active": true}),
            &DetailOptions::default(),
        )
        .unwrap();
        assert_eq!(model["fields"].as_array().unwrap().len(), 2);
        assert_eq!(model["fields"][0]["display"], "Ada");
        assert_eq!(model["fields"][1]["display"]["label"], "Yes");
    }

    #[test]
    fn detail_context_must_be_an_object_after_record_checks() {
        let spec = json!({"fields": {"v": {"field": ".v"}}});
        for data in [json!([]), json!("s"), json!(1)] {
            let options = DetailOptions {
                data,
                ..Default::default()
            };
            for result in [
                build_detail(&spec, &json!({}), &options).map(|_| String::new()),
                render_detail(&spec, &json!({}), &options),
            ] {
                let error = result.unwrap_err();
                assert_eq!(
                    (
                        error.code.as_str(),
                        error.message.as_str(),
                        error.at.as_str()
                    ),
                    ("INVALID_FORM_INPUT", "Detail context must be an object", "")
                );
            }
            assert_eq!(
                build_detail(&json!({}), &json!({}), &options)
                    .unwrap_err()
                    .message,
                "Detail specification must declare fields"
            );
            assert_eq!(
                build_detail(&spec, &json!([]), &options)
                    .unwrap_err()
                    .message,
                "Detail record must be an object"
            );
        }
        let options = DetailOptions {
            data: json!(null),
            ..Default::default()
        };
        assert!(render_detail(&spec, &json!({}), &options).is_ok());
    }

    #[test]
    fn detail_renders_read_only_definition_list() {
        let spec = json!({"fields": {"name": {"field": ".name", "label": "Name"}}});
        let html =
            render_detail(&spec, &json!({"name": "Ada"}), &DetailOptions::default()).unwrap();
        assert_eq!(
            html,
            r#"<dl class="detail-view"><div class="detail-field"><dt class="detail-label">Name</dt><dd class="detail-value detail-value-text">Ada</dd></div></dl>"#
        );
    }
}

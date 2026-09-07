use crate::{
    bad,
    form::{self, collection, rows},
    json as codec, Result,
};
use serde_json::{json, Map, Value};
use std::{
    collections::HashSet,
    fs::{self, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
};

pub struct Repository {
    pub file: PathBuf,
    pub fixtures: PathBuf,
}

pub fn read_object(path: &Path) -> Result<Value> {
    let value = codec::decode(&fs::read(path)?)?;
    if !value.is_object() {
        return Err(bad("Expected stored object"));
    }
    Ok(value)
}

impl Repository {
    fn fixture(&self, name: &str) -> Result<Value> {
        read_object(&self.fixtures)?
            .get(name)
            .cloned()
            .ok_or_else(|| bad("Unknown fixture"))
    }

    /// Lock the file before reading and atomically replace changed records.
    fn transaction(
        &self,
        operation: impl FnOnce(&Value) -> Result<(Value, Value)>,
    ) -> Result<Value> {
        let lock = OpenOptions::new()
            .create(true)
            .truncate(false)
            .read(true)
            .write(true)
            .open(self.file.with_extension("json.lock"))?;
        lock.lock()?;
        let before = match fs::read(&self.file) {
            Ok(bytes) => codec::decode(&bytes)?,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                self.fixture("default")?
            }
            Err(error) => return Err(error.into()),
        };
        let (after, result) = operation(&before)?;
        let encoded = codec::encode(&after)?;
        if !self.file.exists() || codec::encode(&before)? != encoded {
            let mut temporary = tempfile::NamedTempFile::new_in(
                self.file
                    .parent()
                    .ok_or_else(|| bad("Missing repository directory"))?,
            )?;
            writeln!(temporary, "{encoded}")?;
            temporary.as_file().sync_all()?;
            temporary.persist(&self.file).map_err(|e| e.error)?;
        }
        Ok(result)
    }

    pub fn read(&self) -> Result<Value> {
        self.transaction(|value| Ok((value.clone(), value.clone())))
    }
    pub fn reset(&self, name: &str) -> Result<Value> {
        let state = self.fixture(name)?;
        self.transaction(|_| Ok((state.clone(), state)))
    }

    /// Assign sequences, enforce ownership and return scoped key changes.
    pub fn save(&self, data: &Value, mode: &str) -> Result<Value> {
        self.transaction(|before| {
            let mut next = before["next"].clone();
            let (mut companies,mut stores,mut departments,mut changes) = (Vec::new(),Vec::new(),Vec::new(),Vec::new());
            let (mut seen_company,mut seen_store,mut seen_department) = (HashSet::new(),HashSet::new(),HashSet::new());
            for (company_key,company) in rows(&data["companies"],mode)? {
                let company_seq = allocate(&company_key,&company,&table(before,"companies")?.iter().collect::<Vec<_>>(),"company",mode,&mut next,&mut seen_company)?;
                companies.push(json!({"company_seq":company_seq,"name":company["name"],"position":companies.len()}));
                for (position,(store_key,store)) in rows(&company["stores"],mode)?.into_iter().enumerate() {
                    check_parent(&store_key,table(before,"stores")?,"store","company",&company_seq,mode)?;
                    let store_seq = allocate(&store_key,&store,&owned(table(before,"stores")?,"company",&company_seq),"store",mode,&mut next,&mut seen_store)?;
                    stores.push(json!({"store_seq":store_seq,"company_seq":company_seq,"position":position,"name":store["name"],"enabled":store["enabled"],"detail":store["detail"],"title":store["title"]}));
                    for (position,(department_key,department)) in rows(&store["departments"],mode)?.into_iter().enumerate() {
                        check_parent(&department_key,table(before,"departments")?,"department","store",&store_seq,mode)?;
                        let department_seq = allocate(&department_key,&department,&owned(table(before,"departments")?,"store",&store_seq),"department",mode,&mut next,&mut seen_department)?;
                        departments.push(json!({"department_seq":department_seq,"store_seq":store_seq,"position":position,"name":department["name"]}));
                        change(&mut changes,&format!("companies.{company_key}.stores.{store_key}.departments"),&department_key,&department_seq,mode)?;
                    }
                    change(&mut changes,&format!("companies.{company_key}.stores"),&store_key,&store_seq,mode)?;
                }
                change(&mut changes,"companies",&company_key,&company_seq,mode)?;
            }
            let after = json!({"next":next,"companies":companies,"stores":stores,"departments":departments});
            let loaded = load_data(&after,mode)?;
            Ok((after.clone(),json!({"storage":after,"data":loaded,"keyChanges":changes})))
        })
    }
}

fn table<'a>(state: &'a Value, kind: &str) -> Result<&'a Vec<Value>> {
    state[kind]
        .as_array()
        .ok_or_else(|| bad("Expected stored rows"))
}
fn sequence<'a>(row: &'a Value, kind: &str) -> Result<&'a str> {
    row[format!("{kind}_seq")]
        .as_str()
        .ok_or_else(|| bad("Expected stored sequence"))
}

fn key(sequence: &str) -> Result<String> {
    if sequence.is_empty() || sequence.len() > 13 || !sequence.bytes().all(|b| b.is_ascii_digit()) {
        return Err(bad("Invalid stored sequence"));
    }
    Ok(format!(
        "__{}{}__",
        "0".repeat(13 - sequence.len()),
        sequence
    ))
}

fn ordered_rows(rows: Vec<&Value>) -> Result<Vec<&Value>> {
    let mut entries: Vec<_> = rows
        .into_iter()
        .map(|row| {
            Ok((
                row["position"]
                    .as_u64()
                    .ok_or_else(|| bad("Expected stored position"))?,
                row,
            ))
        })
        .collect::<Result<_>>()?;
    entries.sort_by_key(|(position, _)| *position);
    Ok(entries.into_iter().map(|(_, row)| row).collect())
}

fn owned<'a>(rows: &'a [Value], parent: &str, seq: &str) -> Vec<&'a Value> {
    rows.iter()
        .filter(|row| row[format!("{parent}_seq")].as_str() == Some(seq))
        .collect()
}

fn row_object(value: Value) -> Map<String, Value> {
    value
        .as_object()
        .expect("row constructor creates an object")
        .clone()
}

/// Reconstruct row order from positions rather than physical table order.
pub fn load_data(state: &Value, mode: &str) -> Result<Value> {
    let mut companies = Vec::new();
    for company in ordered_rows(table(state, "companies")?.iter().collect())? {
        let company_seq = sequence(company, "company")?;
        let mut stores = Vec::new();
        for store in ordered_rows(owned(table(state, "stores")?, "company", company_seq))? {
            let store_seq = sequence(store, "store")?;
            let mut departments = Vec::new();
            for department in ordered_rows(owned(table(state, "departments")?, "store", store_seq))?
            {
                let seq = sequence(department, "department")?;
                let mut value = json!({"name":department["name"]});
                if mode == "original" {
                    value["department_seq"] = json!(seq);
                }
                departments.push((key(seq)?, row_object(value)));
            }
            let mut value = json!({"name":store["name"],"enabled":store["enabled"],"detail":store["detail"],"title":store["title"],"departments":collection(departments,mode)});
            if mode == "original" {
                value["store_seq"] = json!(store_seq);
            }
            stores.push((key(store_seq)?, row_object(value)));
        }
        let mut value = json!({"name":company["name"],"stores":collection(stores,mode)});
        if mode == "original" {
            value["company_seq"] = json!(company_seq);
        }
        companies.push((key(company_seq)?, row_object(value)));
    }
    Ok(json!({"companies":collection(companies,mode)}))
}

fn allocate(
    row_key: &str,
    row: &Map<String, Value>,
    existing: &[&Value],
    kind: &str,
    mode: &str,
    next: &mut Value,
    seen: &mut HashSet<String>,
) -> Result<String> {
    let field = format!("{kind}_seq");
    let requested = if mode == "original" {
        form::text(row.get(&field).unwrap_or(&Value::Null))?
    } else {
        String::new()
    };
    let mut seq = None;
    for candidate in existing {
        let saved = sequence(candidate, kind)?;
        if mode == "keyed" && key(saved)? == row_key || mode == "original" && saved == requested {
            seq = Some(saved.to_string());
            break;
        }
    }
    if mode == "original" && !requested.is_empty() && seq.is_none() {
        return Err(bad(format!(
            "Unknown or incorrectly owned {field}: {requested}"
        )));
    }
    let seq = if let Some(seq) = seq {
        if seen.contains(&seq) {
            return Err(bad(format!("Duplicate {field}: {seq}")));
        }
        seq
    } else {
        let number = next[kind]
            .as_u64()
            .ok_or_else(|| bad("Expected stored sequence counter"))?;
        let seq = number.to_string();
        key(&seq)?;
        next[kind] = json!(number + 1);
        seq
    };
    seen.insert(seq.clone());
    Ok(seq)
}

fn check_parent(
    row_key: &str,
    rows: &[Value],
    kind: &str,
    parent: &str,
    parent_seq: &str,
    mode: &str,
) -> Result<()> {
    if mode == "keyed" {
        for row in rows {
            if key(sequence(row, kind)?)? == row_key && sequence(row, parent)? != parent_seq {
                return Err(bad(format!("Incorrect parent for {kind}_seq")));
            }
        }
    }
    Ok(())
}

fn change(
    changes: &mut Vec<Value>,
    path: &str,
    old: &str,
    sequence: &str,
    mode: &str,
) -> Result<()> {
    let new = key(sequence)?;
    if mode == "keyed" && old != new {
        changes.push(json!({"path":path,"oldKey":old,"newKey":new}));
    }
    Ok(())
}

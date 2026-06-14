//! File loader for `$ref` resolution.
//!
//! `$ref` loads external YAML files (v1 ReferenceResolver: `yml_parse_file`). The
//! compose engine never touches the filesystem directly — it goes through a
//! `FileLoader`, so the shared fixtures can supply a virtual in-memory file set
//! (the spec graph is the input; no disk needed) while production wires a real
//! disk + YAML loader. One engine, two backends — identical semantics.
//!
//! Path normalization mirrors v1 ReferenceResolver:
//!   - absolute (`/…`) paths pass through unchanged
//!   - relative paths get the basepath prefix (`basepath + '/' + path`)
//! The loader receives the ALREADY-normalized absolute key, so cycle detection
//! and the fixture map key on one canonical identifier.

use std::collections::HashMap;

use serde_json::{Map, Value};

use super::errors::{ComposeErrorCode, ComposeLoadError, ComposeResult};

/// A loaded YAML document (a parsed object tree). Always an object map at the top.
pub type LoadedDoc = Map<String, Value>;

/// Loads a normalized file key to its parsed document. `load` returns
/// `ComposeLoadError(REF_FILE_NOT_FOUND)` when the key is absent — the engine
/// relies on that exact code (an unresolved `$ref` is a load error, never
/// `valid:true`).
pub trait FileLoader {
    /// Resolve `path` against `basepath` to the canonical key the map uses.
    fn normalize(&self, path: &str, basepath: &str) -> String;
    /// Load the parsed document at the canonical key, or return NOT_FOUND.
    fn load(&self, key: &str) -> ComposeResult<LoadedDoc>;
}

/// In-memory loader over a fixed `{ key: doc }` map. Shared fixtures pass a file
/// set here; the engine resolves `$ref` against it with no disk access. Keys are
/// the normalized identifiers (`normalize` output).
pub struct MemoryLoader {
    files: HashMap<String, LoadedDoc>,
}

impl MemoryLoader {
    /// Build a loader from a `{ key: doc }` map. Each `doc` must be a JSON object
    /// (a parsed YAML document); a non-object entry is dropped (it can never be a
    /// valid file body), matching the fixture contract where every file is a map.
    pub fn new(files: Map<String, Value>) -> Self {
        let mut map = HashMap::new();
        for (key, doc) in files {
            if let Value::Object(obj) = doc {
                map.insert(key, obj);
            }
        }
        MemoryLoader { files: map }
    }
}

impl FileLoader for MemoryLoader {
    fn normalize(&self, path: &str, basepath: &str) -> String {
        // Absolute path: pass through. Relative: prefix basepath (v1 parity).
        if path.starts_with('/') {
            return path.to_string();
        }
        if !basepath.is_empty() {
            return format!("{}/{}", basepath, path);
        }
        path.to_string()
    }

    fn load(&self, key: &str) -> ComposeResult<LoadedDoc> {
        match self.files.get(key) {
            // Defensive clone so resolution never mutates the source file set.
            Some(doc) => Ok(doc.clone()),
            None => Err(ComposeLoadError::with_trace(
                ComposeErrorCode::RefFileNotFound,
                format!("$ref file not found: {}", key),
                vec![key.to_string()],
            )),
        }
    }
}

use crudui_validator::compose::ComposeLoadError;

/// A failed form compilation, binding or instance operation.
#[derive(Debug, Clone)]
pub struct FormError {
    /// Stable failure identifier.
    pub code: String,
    /// Description of the failed operation.
    pub message: String,
    /// Composition trace or form path.
    pub at: String,
    /// Original composition trace; empty for instance and binding failures.
    pub trace: Vec<String>,
}

impl FormError {
    pub(crate) fn input(message: impl Into<String>) -> Self {
        Self {
            code: "INVALID_FORM_INPUT".into(),
            message: message.into(),
            at: String::new(),
            trace: Vec::new(),
        }
    }
}

impl std::fmt::Display for FormError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.message)
    }
}
impl std::error::Error for FormError {}

impl From<ComposeLoadError> for FormError {
    fn from(error: ComposeLoadError) -> Self {
        Self {
            code: error.code.as_str().into(),
            message: error.message,
            at: error.trace.join("."),
            trace: error.trace,
        }
    }
}

/// Result of a form operation.
pub type FormResult<T> = Result<T, FormError>;

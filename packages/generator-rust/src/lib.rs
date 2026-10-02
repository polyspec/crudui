//! CRUDUI form compilation, instance data, binding and HTML rendering.
#![deny(missing_docs)]

mod binding;
mod buttons;
mod choice_list;
mod css;
mod date;
mod design;
mod detail;
mod display_declaration;
mod error;
mod form_render;
mod instance;
mod list;
mod messages;
mod number;
mod render;
mod template;
pub mod text;
mod util;
mod widget;

pub use binding::{bind_buttons, bind_form, form_buttons_html, BindOptions};
pub use detail::{build_detail, render_detail, DetailOptions};
pub use error::{FormError, FormResult};
pub use instance::{create_row_key, sequence_row_key, AddRowOptions, Form};
pub use list::{build_list, list_rows, render_list, ListOptions};
pub use render::render_form;
pub use template::{compile_form, CompileOptions, FieldTemplate, FormTemplate};

#[cfg(test)]
mod tests;

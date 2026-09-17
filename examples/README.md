# CRUDUI examples

[한국어](README.ko.md).

| Example | Purpose |
| --- | --- |
| [Cross-check console](cross-check-console/) | Form, list and detail validation comparisons in JavaScript, PHP, Go and Rust, and form, list and detail rendering comparisons in React, Vue and Svelte |
| [Form comparison page](form-comparison/) | Nested keyed form verification through PHP, the PHP extension, Go and Rust, with React, Vue, Svelte and HTML renderer initialization paths compared side by side |
| [Form structure preview](form-structure/) | Local Vite preview of a five-level reference form with its structure outline and data panel, rendered by the HTML renderer |
| [Product forms](product-forms/) | An option form with generated combinations (`multiple: only`) and sections switched by `design.show`, and a large product form composed from it, validated and rendered by a test |
| [Go package example](../packages/generator-go/examples/server/main.go) | Form, list and detail pages rendered from one stored record |
| [PHP package example](../packages/generator-php/examples/index.php) | Form, list (`?view=list`) and detail (`?view=detail`) pages rendered from one stored record, with the PHP implementation or the extension |
| [Rust package example](../packages/generator-rust/examples/form.rs) | One HTML document with a form, a list and details rendered from one record |

The [list and detail procedure](../docs/operations/displays.md) describes the package
examples' list and detail output and their commands. Use the
[verification procedures](../docs/operations/verification.md) to
run package checks and the preserved external browser and server comparison. Verification and
local deployment status are recorded in [feature status](../docs/features.md).

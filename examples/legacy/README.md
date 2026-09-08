# Legacy examples

[한국어](README.ko.md).

These examples use the legacy specification and explicit legacy library entries.
They are separate from the [current examples](../README.md).

- `demo-app`, `playground`, `limepie-bootstrap`: React applications.
- `node-api`, `php-api`, `go-api`, `rust-api`: legacy validation APIs.
- `shared-specs`: shared legacy specifications.
- `limepie-original`, `limepie-compare`, `limepie-validate-test`: legacy rendering checks.
- `*-usage.*`, `basic-form.yml`, `complex-form.yml`: legacy usage examples.

`docker-compose.yml` defines the legacy services. Its build context is the
repository root. External source inputs require explicit paths. The file does
not define the current form comparison environment.

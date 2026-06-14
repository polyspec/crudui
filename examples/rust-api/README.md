# Rust HTTP API Form Validation Example

A REST API server demonstrating form validation with the shared
`polyspec-validator` crate. Mirrors `examples/go-api`: same endpoints, same
canonical contract, same specs.

## Quick Start

```bash
# Run directly (debug build)
cargo run

# Or build the release binary and run it
make build
./target/release/rust-api
```

Server runs on `http://localhost:8080` by default. Set `PORT` and `SPECS_DIR`
to override.

## API Endpoints

| Method | Endpoint            | Description                                  |
|--------|---------------------|----------------------------------------------|
| GET    | `/api/specs`        | List all available form specs                |
| GET    | `/api/specs/{name}` | Get a form spec by name (404 if not found)   |
| POST   | `/api/validate`     | Validate data against a provided spec        |
| GET    | `/health`           | Health check                                 |

This is the canonical contract shared by `node-api`, `php-api`, and `go-api`.
CORS is open (`Access-Control-Allow-Origin: *`) and OPTIONS preflight returns
`204`.

## Canonical contract

```
GET  /api/specs        -> 200 {"specs": ["contact", ...]}
GET  /api/specs/{name} -> 200 {"name": "...", "spec": {...}} | 404 {"error": "..."}
POST /api/validate     -> body {"spec": {...}, "data": {...}}
                          always 200 {"valid": bool, "errors": [{"field","rule","message"}]}
GET  /health           -> 200 {"status": "ok"}
```

Validation failure is not an HTTP error: `/api/validate` always returns `200`
with `{valid, errors}`. A malformed spec (anything that is not a `group` with a
`properties` object) is a client error and returns `400 {"error": "..."}`.

## Testing with curl

### List available specs

```bash
curl http://localhost:8080/api/specs
# {"specs":["contact","registration"]}
```

### Get a spec

```bash
curl http://localhost:8080/api/specs/contact
# {"name":"contact","spec":{...}}

curl -i http://localhost:8080/api/specs/nope
# HTTP/1.1 404 Not Found
# {"error":"Spec not found: nope"}
```

### Validate (valid)

```bash
curl -X POST http://localhost:8080/api/validate \
  -H "Content-Type: application/json" \
  -d '{
    "spec": {
      "type": "group",
      "properties": {
        "name":  {"type": "text",  "rules": {"required": true, "minlength": 2}},
        "email": {"type": "email", "rules": {"required": true, "email": true}}
      }
    },
    "data": {"name": "John Doe", "email": "john@example.com"}
  }'
# {"valid":true,"errors":[]}
```

### Validate (invalid)

```bash
curl -X POST http://localhost:8080/api/validate \
  -H "Content-Type: application/json" \
  -d '{
    "spec": {
      "type": "group",
      "properties": {
        "name":  {"type": "text",  "rules": {"required": true, "minlength": 2}},
        "email": {"type": "email", "rules": {"required": true, "email": true}}
      }
    },
    "data": {"name": "", "email": "not-an-email"}
  }'
# {"valid":false,"errors":[
#   {"field":"name","rule":"required","message":"This field is required."},
#   {"field":"email","rule":"email","message":"Please enter a valid email address."}
# ]}
```

### Malformed spec (400)

```bash
curl -i -X POST http://localhost:8080/api/validate \
  -H "Content-Type: application/json" \
  -d '{"spec": {"foo": "bar"}, "data": {}}'
# HTTP/1.1 400 Bad Request
# {"error":"Invalid spec: expected a group with a properties object"}
```

### Health check

```bash
curl http://localhost:8080/health
# {"status":"ok"}
```

## Environment Variables

| Variable    | Default    | Description                              |
|-------------|------------|------------------------------------------|
| `PORT`      | `8080`     | Server port                              |
| `SPECS_DIR` | `./specs`  | Directory containing YAML spec files     |

## Build Commands

```bash
make build          # Release binary at target/release/rust-api
make run            # cargo run (debug)
make run PORT=3000  # Run on a custom port
make clean          # cargo clean
make test           # Build-check
```

## Adding Custom Specs

Drop a YAML file into `specs/`. The filename (without `.yaml`/`.yml`) becomes
the spec name. Specs are the canonical polyspec shape: a `group` with a
`properties` object.

```yaml
type: group
name: newsletter
properties:
  email:
    type: email
    rules:
      required: true
      email: true
    messages:
      required: Email is required
      email: Invalid email format
```

## Docker

Built from the repository root so the validator crate is in build context:

```bash
docker compose -f examples/docker-compose.yml up rust-api
```

The service listens on host port `8017` (container `8080`) and mounts
`examples/shared-specs` at `/app/specs`.

## Project Structure

```
rust-api/
  Cargo.toml          # Crate manifest; depends on ../../packages/validator-rust
  src/main.rs         # std-library HTTP server + router
  Dockerfile          # Two-stage cargo build
  Makefile            # build / run / clean
  README.md           # This file
  specs/              # YAML form specifications
    contact.yaml
    registration.yaml
```

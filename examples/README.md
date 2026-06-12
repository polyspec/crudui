# Form Generator Examples

This directory contains example applications demonstrating the form-generator system with multiple backend implementations.

## Quick Start

Run all services with Docker Compose:

```bash
cd examples
docker-compose up --build
```

## Services

| Service | Port | Description |
|---------|------|-------------|
| demo-app | 8010 | React application showcasing form generation |
| node-api | 8011 | Node.js/Express validation server |
| php-api | 8012 | PHP validation server with Apache |
| go-api | 8013 | Go validation server |
| playground | 8014 | Interactive form spec editor |
| limepie-original | 8015 | REAL Limepie PHP form system (local limepie checkout, pinned a47ccba — see `tools/limepie-baseline/README.md`) |
| limepie-bootstrap | 8016 | Limepie-style Bootstrap 5 form demo (React) |

## URLs

Once the services are running, access them at:

- **demo-app**: [http://localhost:8010](http://localhost:8010)
- **node-api**: [http://localhost:8011](http://localhost:8011)
- **php-api**: [http://localhost:8012](http://localhost:8012)
- **go-api**: [http://localhost:8013](http://localhost:8013)
- **playground**: [http://localhost:8014](http://localhost:8014)
- **limepie-original**: [http://localhost:8015](http://localhost:8015)
- **limepie-bootstrap**: [http://localhost:8016](http://localhost:8016)

Form specs shared by the backend APIs and the limepie demos live in `shared-specs/`
(mounted into each container by `docker-compose.yml`).

## Individual Service Commands

### Build all services
```bash
docker-compose build
```

### Start all services in detached mode
```bash
docker-compose up -d
```

### View logs
```bash
docker-compose logs -f
```

### View logs for a specific service
```bash
docker-compose logs -f demo-app
docker-compose logs -f node-api
docker-compose logs -f php-api
docker-compose logs -f go-api
docker-compose logs -f playground
docker-compose logs -f limepie-original
docker-compose logs -f limepie-bootstrap
```

### Stop all services
```bash
docker-compose down
```

### Rebuild a specific service
```bash
docker-compose up --build demo-app
```

## API Contract

All three backend APIs (`node-api`, `php-api`, `go-api`) implement the same canonical contract:

### `GET /api/specs`

List all available form specs.

```json
{ "specs": ["contact", "registration"] }
```

### `GET /api/specs/{name}`

Get a form spec by name. The YAML spec is converted to JSON.

- `200`:

```json
{ "name": "contact", "spec": { "type": "group", "properties": { } } }
```

- `404` when the spec does not exist:

```json
{ "error": "Spec not found: contact2" }
```

### `POST /api/validate`

Validate form data against a spec object supplied in the request body.

Request:

```json
{
  "spec": { "type": "group", "properties": { } },
  "data": { "email": "user@example.com" }
}
```

Response — always `200`, validation failure is NOT an HTTP error (no 422):

```json
{
  "valid": false,
  "errors": [
    { "field": "email", "rule": "email", "message": "Please enter a valid email address." }
  ]
}
```

`errors` is always present (empty array when `valid` is `true`).

### Error responses

Only server/request errors use 4xx/5xx, with the shape:

```json
{ "error": "..." }
```

### CORS

Every endpoint responds with `Access-Control-Allow-Origin: *` and answers `OPTIONS` preflight requests (`204`).

## Network

All services are connected via the `form-generator-network` bridge network, allowing inter-service communication using service names as hostnames.

## Health Checks

Each service includes a health check configuration:

- **demo-app**: HTTP check on port 80
- **node-api**: HTTP check on port 3000
- **php-api**: curl check on port 80 (via Apache)
- **go-api**: wget check on port 8080
- **playground**: HTTP check on port 80
- **limepie-original**: curl check on port 80 (via Apache)
- **limepie-bootstrap**: HTTP check on port 80

Check service health status:
```bash
docker-compose ps
```

## Labels

Services are labeled for easy identification:
- `com.form-generator.service`: Service name
- `com.form-generator.description`: Service description

List services by label:
```bash
docker ps --filter "label=com.form-generator.service"
```

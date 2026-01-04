# Go HTTP API Form Validation Example

A REST API server demonstrating form validation using the Go validator package.

## Quick Start

```bash
# Run directly
go run main.go

# Or build and run
make build
./build/form-validator-api
```

Server runs on `http://localhost:8080` by default.

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/forms` | List all available form specs |
| GET | `/form/:name` | Get form spec by name |
| POST | `/validate` | Validate data against provided spec |
| POST | `/submit/:name` | Validate and process form submission |
| POST | `/validate-field/:name` | Validate a single field |
| GET | `/health` | Health check |

## Testing with curl

### List Available Forms

```bash
curl http://localhost:8080/forms
```

Response:
```json
{
  "success": true,
  "forms": ["contact", "registration"]
}
```

### Get Form Spec

```bash
curl http://localhost:8080/form/contact
```

### Submit Contact Form (Valid)

```bash
curl -X POST http://localhost:8080/submit/contact \
  -H "Content-Type: application/json" \
  -d '{
    "name": "John Doe",
    "email": "john@example.com",
    "subject": "general",
    "message": "Hello, I have a question about your service."
  }'
```

Response:
```json
{
  "success": true,
  "message": "Form submitted successfully",
  "data": {
    "name": "John Doe",
    "email": "john@example.com",
    "subject": "general",
    "message": "Hello, I have a question about your service."
  }
}
```

### Submit Contact Form (Invalid)

```bash
curl -X POST http://localhost:8080/submit/contact \
  -H "Content-Type: application/json" \
  -d '{
    "name": "",
    "email": "invalid-email",
    "message": "Hi"
  }'
```

Response (HTTP 422):
```json
{
  "success": false,
  "errors": [
    {
      "field": "name",
      "rule": "required",
      "message": "Please enter your name"
    },
    {
      "field": "email",
      "rule": "email",
      "message": "Please enter a valid email address"
    },
    {
      "field": "subject",
      "rule": "required",
      "message": "Please select a subject"
    },
    {
      "field": "message",
      "rule": "minlength",
      "message": "Message must be at least 10 characters"
    }
  ],
  "errorCount": 4
}
```

### Submit Registration Form

```bash
curl -X POST http://localhost:8080/submit/registration \
  -H "Content-Type: application/json" \
  -d '{
    "username": "johndoe",
    "email": "john@example.com",
    "password": "SecurePass123",
    "password_confirm": "SecurePass123",
    "profile": {
      "first_name": "John",
      "last_name": "Doe",
      "country": "us"
    },
    "terms": true
  }'
```

### Validate with Custom Spec

```bash
curl -X POST http://localhost:8080/validate \
  -H "Content-Type: application/json" \
  -d '{
    "spec": {
      "type": "group",
      "properties": {
        "age": {
          "type": "number",
          "rules": {
            "required": true,
            "min": 18,
            "max": 120
          },
          "messages": {
            "required": "Age is required",
            "min": "Must be at least 18",
            "max": "Invalid age"
          }
        }
      }
    },
    "data": {
      "age": 15
    }
  }'
```

### Validate Single Field

```bash
curl -X POST http://localhost:8080/validate-field/contact \
  -H "Content-Type: application/json" \
  -d '{
    "path": "email",
    "value": "invalid-email"
  }'
```

Response (HTTP 422):
```json
{
  "success": false,
  "field": "email",
  "error": "Please enter a valid email address"
}
```

### Health Check

```bash
curl http://localhost:8080/health
```

Response:
```json
{
  "status": "ok"
}
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8080` | Server port |
| `SPECS_DIR` | `./specs` | Directory containing YAML spec files |

## Build Commands

```bash
# Build binary
make build

# Run with go run
make run

# Run on custom port
make run PORT=3000

# Clean build artifacts
make clean

# Download dependencies
make deps

# Show help
make help
```

## Adding Custom Specs

Add YAML files to the `specs/` directory. The filename (without extension) becomes the form name.

Example `specs/newsletter.yaml`:
```yaml
type: group
name: newsletter
title: Newsletter Subscription

properties:
  email:
    type: email
    label: Email
    rules:
      required: true
      email: true
    messages:
      required: Email is required
      email: Invalid email format
```

Then access via:
```bash
curl http://localhost:8080/form/newsletter
curl -X POST http://localhost:8080/submit/newsletter \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com"}'
```

## Project Structure

```
go-api/
  main.go          # HTTP server with API endpoints
  go.mod           # Go module file
  Makefile         # Build commands
  README.md        # This file
  specs/           # YAML form specifications
    contact.yaml   # Contact form spec
    registration.yaml # Registration form spec
```

## Error Response Format

All validation errors follow this format:

```json
{
  "success": false,
  "errors": [
    {
      "field": "fieldName",
      "rule": "ruleName",
      "message": "Human-readable error message"
    }
  ],
  "errorCount": 1
}
```

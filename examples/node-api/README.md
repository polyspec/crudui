# Node.js/Express Form Validation API Example

A REST API example demonstrating form validation using `@limepie/form-validator`.

## Quick Start

```bash
npm install
npm start
```

Server runs on `http://localhost:3000` by default.

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/forms` | List all available form specs |
| GET | `/api/form/:name` | Get form spec by name |
| POST | `/api/form/:name` | Get form spec by name |
| POST | `/api/validate` | Validate data against provided spec |
| POST | `/api/submit/:name` | Validate and process form submission |
| POST | `/api/validate-field/:name` | Validate a single field |
| GET | `/health` | Health check |

## Testing with curl

### List Available Forms

```bash
curl http://localhost:3000/api/forms
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
curl http://localhost:3000/api/form/contact
```

### Submit Contact Form (Valid)

```bash
curl -X POST http://localhost:3000/api/submit/contact \
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
curl -X POST http://localhost:3000/api/submit/contact \
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
      "path": "name",
      "rule": "required",
      "message": "Please enter your name"
    },
    {
      "field": "email",
      "path": "email",
      "rule": "email",
      "message": "Please enter a valid email address"
    },
    {
      "field": "subject",
      "path": "subject",
      "rule": "required",
      "message": "Please select a subject"
    },
    {
      "field": "message",
      "path": "message",
      "rule": "minlength",
      "message": "Message must be at least 10 characters"
    }
  ],
  "errorCount": 4
}
```

### Submit Registration Form

```bash
curl -X POST http://localhost:3000/api/submit/registration \
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
curl -X POST http://localhost:3000/api/validate \
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
curl -X POST http://localhost:3000/api/validate-field/contact \
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

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server port |

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
curl http://localhost:3000/api/form/newsletter
curl -X POST http://localhost:3000/api/submit/newsletter \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com"}'
```

## Project Structure

```
node-api/
  server.js        # Express server with API endpoints
  package.json     # Dependencies and scripts
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
      "path": "nested.path.to.field",
      "rule": "ruleName",
      "message": "Human-readable error message"
    }
  ],
  "errorCount": 1
}
```

## License

MIT

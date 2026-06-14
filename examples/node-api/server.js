/**
 * Node.js/Express API Example
 *
 * Demonstrates form validation using @polyspec/validator.
 *
 * Canonical API contract (shared by node-api / php-api / go-api):
 *   GET  /api/specs        -> 200 {"specs": ["contact", ...]}
 *   GET  /api/specs/:name  -> 200 {"name": "...", "spec": {...}} | 404 {"error": "..."}
 *   POST /api/validate     -> body {"spec": {...}, "data": {...}}
 *                             always 200 {"valid": bool, "errors": [{"field","rule","message"}]}
 *   Server errors only use 4xx/5xx with {"error": "..."}.
 *   CORS: Access-Control-Allow-Origin * + OPTIONS preflight.
 */

const express = require('express');
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { Validator } = require('@polyspec/validator');

const app = express();
const PORT = process.env.PORT || 3000;

// Parse application/json request bodies into req.body (POST /api/validate
// sends JSON).
app.use(express.json());
// Also accept urlencoded form posts, so the same endpoints work from a plain
// HTML <form> submission.
app.use(express.urlencoded({ extended: true }));

/**
 * CORS middleware. Sets `Access-Control-Allow-*` on every response and
 * short-circuits OPTIONS preflight with 204 No Content. All other methods fall
 * through to the route handlers via next().
 * @param {express.Request} req - Incoming request
 * @param {express.Response} res - Response being built
 * @param {express.NextFunction} next - Pass control to the next handler
 */
app.use((req, res, next) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  next();
});

// Specs directory
const SPECS_DIR = path.join(__dirname, 'specs');

// Cache for loaded specs
const specCache = new Map();

/**
 * Load a spec from YAML file
 * @param {string} name - Spec name (filename without extension)
 * @returns {object|null} - Parsed spec or null if not found
 */
function loadSpec(name) {
  // Check cache first
  if (specCache.has(name)) {
    return specCache.get(name);
  }

  const filePath = path.join(SPECS_DIR, `${name}.yaml`);

  // Also try .yml extension
  const altFilePath = path.join(SPECS_DIR, `${name}.yml`);

  let targetPath = null;
  if (fs.existsSync(filePath)) {
    targetPath = filePath;
  } else if (fs.existsSync(altFilePath)) {
    targetPath = altFilePath;
  }

  if (!targetPath) {
    return null;
  }

  try {
    const content = fs.readFileSync(targetPath, 'utf8');
    const spec = yaml.load(content);
    specCache.set(name, spec);
    return spec;
  } catch (error) {
    console.error(`Error loading spec ${name}:`, error.message);
    return null;
  }
}

/**
 * Check that a spec has the canonical form-spec shape: a group whose
 * `properties` is a plain object. Anything else (arbitrary keys, a missing
 * `properties`, a non-group type) is malformed and must be rejected with 400.
 * @param {*} spec - The submitted spec
 * @returns {boolean}
 */
function isValidSpecShape(spec) {
  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) {
    return false;
  }
  if (spec.type !== 'group') {
    return false;
  }
  const props = spec.properties;
  return Boolean(props) && typeof props === 'object' && !Array.isArray(props);
}

/**
 * Map validator errors to the canonical wire format
 * @param {Array} errors - Validation errors from validator
 * @returns {Array} - [{field, rule, message}]
 */
function toWireErrors(errors) {
  return errors.map(err => ({
    field: err.path || err.field,
    rule: err.rule,
    message: err.message
  }));
}

// ============================================================================
// API Routes
// ============================================================================

/**
 * GET /api/specs
 * List all available form specs
 */
app.get('/api/specs', (req, res) => {
  try {
    const files = fs.readdirSync(SPECS_DIR);
    const specs = files
      .filter(f => f.endsWith('.yaml') || f.endsWith('.yml'))
      .map(f => f.replace(/\.(yaml|yml)$/, ''));

    return res.json({ specs });
  } catch (error) {
    return res.status(500).json({ error: 'Error listing specs: ' + error.message });
  }
});

/**
 * GET /api/specs/:name
 * Get a form spec by name (YAML converted to JSON)
 */
app.get('/api/specs/:name', (req, res) => {
  const { name } = req.params;

  const spec = loadSpec(name);

  if (!spec) {
    return res.status(404).json({ error: `Spec not found: ${name}` });
  }

  return res.json({ name, spec });
});

/**
 * POST /api/validate
 * Validate form data against a provided spec.
 * Validation failure is NOT an HTTP error: always 200 with {valid, errors}.
 *
 * Request body:
 * {
 *   "spec": { ... },  // Form spec object
 *   "data": { ... }   // Form data to validate
 * }
 */
app.post('/api/validate', (req, res) => {
  const { spec, data } = req.body || {};

  if (!spec || typeof spec !== 'object') {
    return res.status(400).json({ error: 'Missing or invalid field: spec' });
  }

  // A valid form spec is a group with a properties object. Reject any other
  // shape with 400 instead of letting the validator throw (500). Keeps the
  // three backends aligned: malformed specs are a client error, not a crash.
  if (!isValidSpecShape(spec)) {
    return res.status(400).json({
      error: 'Invalid spec: expected a group with a properties object',
    });
  }

  if (!data || typeof data !== 'object') {
    return res.status(400).json({ error: 'Missing or invalid field: data' });
  }

  try {
    const validator = new Validator(spec);
    const result = validator.validate(data);

    return res.json({
      valid: result.valid,
      errors: toWireErrors(result.errors)
    });
  } catch (error) {
    return res.status(500).json({ error: 'Validation error: ' + error.message });
  }
});

/**
 * GET /health
 * Liveness probe. Always 200 with {status: "ok", timestamp}; the timestamp is
 * the only non-deterministic field in the API and exists purely for humans.
 */
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

/**
 * Fallback 404 handler. Reached when no route above matched the request path;
 * returns the canonical {error} envelope so unknown endpoints stay machine-readable.
 */
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

/**
 * Express error-handling middleware (4-arg signature). Catches anything thrown
 * or passed to next(err) by an upstream handler and replies 500 {error}, never
 * leaking the stack to the client. The unused `next` is required for Express to
 * recognize this as an error handler.
 * @param {Error} err - The error propagated by an upstream handler
 * @param {express.Request} req - Incoming request
 * @param {express.Response} res - Response being built
 * @param {express.NextFunction} next - Required for Express to detect the error-handler arity
 */
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

/**
 * Bind the HTTP server to PORT and log the served endpoints. The listen
 * callback runs once the socket is ready.
 */
app.listen(PORT, () => {
  console.log(`Form Validator API server running on port ${PORT}`);
  console.log(`Specs directory: ${SPECS_DIR}`);
  console.log(`\nAvailable endpoints:`);
  console.log(`  GET  /api/specs        - List all form specs`);
  console.log(`  GET  /api/specs/:name  - Get form spec by name`);
  console.log(`  POST /api/validate     - Validate data against spec`);
  console.log(`  GET  /health           - Health check`);
});

module.exports = app;

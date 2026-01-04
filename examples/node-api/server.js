/**
 * Node.js/Express API Example
 *
 * Demonstrates form validation using @limepie/form-validator
 */

const express = require('express');
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { Validator } = require('@limepie/form-validator');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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
 * Format validation errors for API response
 * @param {Array} errors - Validation errors from validator
 * @returns {object} - Formatted error response
 */
function formatErrors(errors) {
  return {
    success: false,
    errors: errors.map(err => ({
      field: err.field,
      path: err.path,
      rule: err.rule,
      message: err.message
    })),
    errorCount: errors.length
  };
}

/**
 * Format success response
 * @param {object} data - Optional data to include
 * @returns {object} - Success response
 */
function formatSuccess(data = {}) {
  return {
    success: true,
    ...data
  };
}

// ============================================================================
// API Routes
// ============================================================================

/**
 * POST /api/validate
 * Validate form data against a provided spec
 *
 * Request body:
 * {
 *   "spec": { ... },  // Form spec object
 *   "data": { ... }   // Form data to validate
 * }
 */
app.post('/api/validate', (req, res) => {
  const { spec, data } = req.body;

  if (!spec) {
    return res.status(400).json({
      success: false,
      error: 'Missing required field: spec'
    });
  }

  if (!data) {
    return res.status(400).json({
      success: false,
      error: 'Missing required field: data'
    });
  }

  try {
    const validator = new Validator(spec);
    const result = validator.validate(data);

    if (result.valid) {
      return res.json(formatSuccess({ message: 'Validation passed' }));
    } else {
      return res.status(422).json(formatErrors(result.errors));
    }
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'Validation error: ' + error.message
    });
  }
});

/**
 * POST /api/form/:name
 * Get form spec by name (loaded from YAML file)
 *
 * Response:
 * {
 *   "success": true,
 *   "spec": { ... }
 * }
 */
app.post('/api/form/:name', (req, res) => {
  const { name } = req.params;

  const spec = loadSpec(name);

  if (!spec) {
    return res.status(404).json({
      success: false,
      error: `Form spec not found: ${name}`
    });
  }

  return res.json(formatSuccess({ spec }));
});

/**
 * GET /api/form/:name (convenience alias)
 */
app.get('/api/form/:name', (req, res) => {
  const { name } = req.params;

  const spec = loadSpec(name);

  if (!spec) {
    return res.status(404).json({
      success: false,
      error: `Form spec not found: ${name}`
    });
  }

  return res.json(formatSuccess({ spec }));
});

/**
 * POST /api/submit/:name
 * Validate and process form submission
 *
 * Request body: Form data to validate
 *
 * Response on success:
 * {
 *   "success": true,
 *   "message": "Form submitted successfully",
 *   "data": { ... }
 * }
 *
 * Response on validation failure:
 * {
 *   "success": false,
 *   "errors": [ ... ]
 * }
 */
app.post('/api/submit/:name', (req, res) => {
  const { name } = req.params;
  const data = req.body;

  // Load spec
  const spec = loadSpec(name);

  if (!spec) {
    return res.status(404).json({
      success: false,
      error: `Form spec not found: ${name}`
    });
  }

  try {
    // Validate
    const validator = new Validator(spec);
    const result = validator.validate(data);

    if (!result.valid) {
      return res.status(422).json(formatErrors(result.errors));
    }

    // Process submission (in real app, save to database, send email, etc.)
    console.log(`Form "${name}" submitted successfully:`, data);

    return res.json(formatSuccess({
      message: 'Form submitted successfully',
      data: data
    }));
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'Processing error: ' + error.message
    });
  }
});

/**
 * GET /api/forms
 * List all available form specs
 */
app.get('/api/forms', (req, res) => {
  try {
    const files = fs.readdirSync(SPECS_DIR);
    const forms = files
      .filter(f => f.endsWith('.yaml') || f.endsWith('.yml'))
      .map(f => f.replace(/\.(yaml|yml)$/, ''));

    return res.json(formatSuccess({ forms }));
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'Error listing forms: ' + error.message
    });
  }
});

/**
 * POST /api/validate-field/:name
 * Validate a single field
 *
 * Request body:
 * {
 *   "path": "email",       // Field path
 *   "value": "test@...",   // Field value
 *   "data": { ... }        // Full form data for context
 * }
 */
app.post('/api/validate-field/:name', (req, res) => {
  const { name } = req.params;
  const { path: fieldPath, value, data = {} } = req.body;

  if (!fieldPath) {
    return res.status(400).json({
      success: false,
      error: 'Missing required field: path'
    });
  }

  const spec = loadSpec(name);

  if (!spec) {
    return res.status(404).json({
      success: false,
      error: `Form spec not found: ${name}`
    });
  }

  try {
    const validator = new Validator(spec);
    const error = validator.validateField(fieldPath, value, data);

    if (error) {
      return res.status(422).json({
        success: false,
        field: fieldPath,
        error: error
      });
    }

    return res.json(formatSuccess({
      field: fieldPath,
      message: 'Field is valid'
    }));
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'Validation error: ' + error.message
    });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found'
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({
    success: false,
    error: 'Internal server error'
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Form Validator API server running on port ${PORT}`);
  console.log(`Specs directory: ${SPECS_DIR}`);
  console.log(`\nAvailable endpoints:`);
  console.log(`  GET  /api/forms              - List all form specs`);
  console.log(`  GET  /api/form/:name         - Get form spec by name`);
  console.log(`  POST /api/form/:name         - Get form spec by name`);
  console.log(`  POST /api/validate           - Validate data against spec`);
  console.log(`  POST /api/submit/:name       - Validate and submit form`);
  console.log(`  POST /api/validate-field/:name - Validate single field`);
  console.log(`  GET  /health                 - Health check`);
});

module.exports = app;

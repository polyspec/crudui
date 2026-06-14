# PHP API Example

PHP API example demonstrating polyspec validation with Limepie and Laravel integration patterns.

## Setup

### 1. Install Dependencies

```bash
cd examples/php-api
composer install
```

### 2. Start Development Server

```bash
composer serve
# or
php -S localhost:8080 -t .
```

### 3. Run Tests

```bash
php test-api.php
```

## API Endpoint

### POST /validate.php

Validates form data against a YAML specification.

#### Request Format

```json
{
  "spec": "user-registration",
  "mode": "full",
  "data": {
    "email": "user@example.com",
    "password": "SecurePass123",
    "password_confirm": "SecurePass123",
    "name": "John Doe",
    "terms": true
  }
}
```

#### Response Format

```json
{
  "success": true,
  "valid": true,
  "errors": {},
  "firstError": null
}
```

## Usage Examples with curl

### Full Form Validation

```bash
# Valid registration data
curl -X POST http://localhost:8080/validate.php \
  -H "Content-Type: application/json" \
  -d '{
    "spec": "user-registration",
    "data": {
      "email": "user@example.com",
      "password": "SecurePass123",
      "password_confirm": "SecurePass123",
      "name": "John Doe",
      "phone": "010-1234-5678",
      "terms": true
    }
  }'

# Invalid data (missing required fields)
curl -X POST http://localhost:8080/validate.php \
  -H "Content-Type: application/json" \
  -d '{
    "spec": "user-registration",
    "data": {
      "email": "invalid-email",
      "password": "123"
    }
  }'
```

### Single Field Validation (Real-time)

```bash
# Validate email field
curl -X POST http://localhost:8080/validate.php \
  -H "Content-Type: application/json" \
  -d '{
    "spec": "user-registration",
    "mode": "field",
    "path": "email",
    "value": "test@example.com",
    "allData": {}
  }'

# Validate password field
curl -X POST http://localhost:8080/validate.php \
  -H "Content-Type: application/json" \
  -d '{
    "spec": "user-registration",
    "mode": "field",
    "path": "password",
    "value": "weak",
    "allData": {}
  }'
```

### Product Form with Conditional Validation

```bash
# Physical product (requires shipping info)
curl -X POST http://localhost:8080/validate.php \
  -H "Content-Type: application/json" \
  -d '{
    "spec": "product-form",
    "data": {
      "name": "Test Product",
      "product_type": "physical",
      "price": 29900,
      "shipping": {
        "weight": 0.5,
        "dimensions": "10x20x30"
      },
      "categories": ["electronics"],
      "images": ["image1.jpg"]
    }
  }'

# Digital product (requires download URL)
curl -X POST http://localhost:8080/validate.php \
  -H "Content-Type: application/json" \
  -d '{
    "spec": "product-form",
    "data": {
      "name": "Digital Product",
      "product_type": "digital",
      "price": 9900,
      "download_url": "https://example.com/download",
      "categories": ["software"],
      "images": ["image1.jpg"]
    }
  }'
```

## Limepie Integration

### Using the Trait in Controllers

```php
<?php

use App\LimepieValidationTrait;

class MyController extends \Limepie\Controller
{
    use LimepieValidationTrait;

    public function postAction(): array
    {
        // Validate form data
        $result = $this->validatePolyspec('user-registration', $this->getPost());

        if (!$result->isValid()) {
            return [
                'success' => false,
                'errors' => $result->getErrors(),
            ];
        }

        // Process valid data...
        return ['success' => true];
    }

    public function validateFieldAction(): array
    {
        // AJAX field validation
        $error = $this->validateFormField(
            'user-registration',
            $this->getPost('path'),
            $this->getPost('value'),
            $this->getPost('allData', [])
        );

        return [
            'valid' => $error === null,
            'error' => $error,
        ];
    }
}
```

### Using the Adapter Class

```php
<?php

use App\LimepieAdapter;

// Create adapter instance
$adapter = new LimepieAdapter(__DIR__ . '/specs');

// Full form validation
$result = $adapter->validate('product-form', $postData);

if (!$result->isValid()) {
    foreach ($result->getErrors() as $path => $error) {
        echo "{$path}: {$error['message']}\n";
    }
}

// Single field validation
$error = $adapter->validateField('product-form', 'price', -100);

// Add custom validation rule
$adapter->addRule('product-form', 'unique_sku', function ($value, $param, $allData, $path) {
    // Check database for unique SKU
    return !Product::where('sku', $value)->exists();
});
```

## Laravel Integration

### 1. Register Service Provider

Add to `config/app.php`:

```php
'providers' => [
    // ...
    App\PolyspecServiceProvider::class,
],
```

### 2. Publish Configuration

```bash
php artisan vendor:publish --tag=polyspec-config
```

### 3. Create Specifications

Place YAML specs in `resources/specs/`:

```
resources/
  specs/
    user-registration.yml
    product-form.yml
```

### 4. Use in Controllers

```php
<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;

class UserController extends Controller
{
    public function register(Request $request): JsonResponse
    {
        $adapter = app('polyspec.adapter');
        $result = $adapter->validate('user-registration', $request->all());

        if (!$result->isValid()) {
            return response()->json([
                'message' => 'Validation failed',
                'errors' => $result->getErrors(),
            ], 422);
        }

        // Create user...
        return response()->json(['message' => 'User created'], 201);
    }

    public function validateField(Request $request): JsonResponse
    {
        $adapter = app('polyspec.adapter');
        $error = $adapter->validateField(
            $request->input('spec'),
            $request->input('path'),
            $request->input('value'),
            $request->input('allData', [])
        );

        return response()->json([
            'valid' => $error === null,
            'error' => $error,
        ]);
    }
}
```

### 5. Use Form Request Classes

```php
<?php

namespace App\Http\Requests;

use App\PolyspecRequest;

class UserRegistrationRequest extends PolyspecRequest
{
    protected function getSpecName(): string
    {
        return 'user-registration';
    }
}

// In controller:
public function register(UserRegistrationRequest $request): JsonResponse
{
    // Validation already passed
    $user = User::create($request->validated());
    return response()->json(['user' => $user], 201);
}
```

## Adding Custom Specifications

Create a new YAML file in the `specs/` directory:

```yaml
# specs/my-form.yml
type: group
name: my-form

properties:
  field_name:
    type: text
    label:
      ko: 필드명
      en: Field Name
    rules:
      required: true
      minlength: 2
    messages:
      ko:
        required: 필드를 입력해주세요.
      en:
        required: This field is required.
```

## File Structure

```
php-api/
├── validate.php              # Main API endpoint
├── composer.json             # Dependencies
├── test-api.php              # Test script
├── README.md                 # This file
├── config/
│   └── polyspec.php          # Laravel config
├── specs/
│   ├── user-registration.yml # User registration form spec
│   └── product-form.yml      # Product form spec
└── src/
    ├── LimepieAdapter.php    # Limepie integration
    └── LaravelServiceProvider.php  # Laravel integration
```

## Related Documentation

- [YAML Spec Format](../../docs/SPEC.md)
- [Validation Rules](../../docs/VALIDATION-RULES.md)
- [Condition Expressions](../../docs/CONDITION-PARSER.md)

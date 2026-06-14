<?php
/**
 * PHP Validation Example
 *
 * This example demonstrates how to use the form-generator validator
 * in PHP applications for server-side validation.
 */

declare(strict_types=1);

require_once __DIR__ . '/../packages/validator-php/vendor/autoload.php';

use Polyspec\Validator\Validator;
use Polyspec\Validator\ValidationResult;

// =============================================================================
// Basic Usage
// =============================================================================

/**
 * Basic validation example
 */
function basicExample(): void
{
    echo "=== Basic Validation Example ===\n";

    // Define the form specification
    $spec = [
        'type' => 'group',
        'properties' => [
            'email' => [
                'type' => 'email',
                'label' => ['ko' => '이메일', 'en' => 'Email'],
                'rules' => [
                    'required' => true,
                    'email' => true,
                ],
                'messages' => [
                    'ko' => [
                        'required' => '이메일을 입력해주세요.',
                        'email' => '올바른 이메일 형식으로 입력해주세요.',
                    ],
                    'en' => [
                        'required' => 'Email is required.',
                        'email' => 'Please enter a valid email address.',
                    ],
                ],
            ],
            'password' => [
                'type' => 'password',
                'label' => ['ko' => '비밀번호', 'en' => 'Password'],
                'rules' => [
                    'required' => true,
                    'minlength' => 8,
                    'match' => '^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d@$!%*#?&]{8,}$',
                ],
                'messages' => [
                    'ko' => [
                        'required' => '비밀번호를 입력해주세요.',
                        'minlength' => '비밀번호는 최소 {0}자 이상이어야 합니다.',
                        'match' => '비밀번호는 영문자와 숫자를 포함해야 합니다.',
                    ],
                    'en' => [
                        'required' => 'Password is required.',
                        'minlength' => 'Password must be at least {0} characters.',
                        'match' => 'Password must contain letters and numbers.',
                    ],
                ],
            ],
        ],
    ];

    // Create validator instance
    $validator = new Validator($spec);

    // Validate data - invalid case
    $invalidData = [
        'email' => 'invalid-email',
        'password' => '123',
    ];

    $result = $validator->validate($invalidData);

    echo "Data: " . json_encode($invalidData, JSON_PRETTY_PRINT) . "\n";
    echo "Is Valid: " . ($result->isValid() ? 'true' : 'false') . "\n";
    echo "Errors: " . json_encode($result->getErrors(), JSON_PRETTY_PRINT) . "\n\n";

    // Validate data - valid case
    $validData = [
        'email' => 'user@example.com',
        'password' => 'SecurePass123',
    ];

    $result = $validator->validate($validData);

    echo "Data: " . json_encode($validData, JSON_PRETTY_PRINT) . "\n";
    echo "Is Valid: " . ($result->isValid() ? 'true' : 'false') . "\n";
    echo "Errors: " . json_encode($result->getErrors(), JSON_PRETTY_PRINT) . "\n\n";
}

// =============================================================================
// Loading Spec from YAML File
// =============================================================================

/**
 * Load and validate using YAML spec file
 */
function yamlFileExample(): void
{
    echo "=== YAML File Validation Example ===\n";

    // Load spec from YAML file
    $specPath = __DIR__ . '/basic-form.yml';
    $specContent = file_get_contents($specPath);
    $spec = yaml_parse($specContent);

    if ($spec === false) {
        echo "Failed to parse YAML file\n";
        return;
    }

    // Create validator
    $validator = new Validator($spec);

    // Test data - valid
    $validData = [
        'personal' => [
            'name' => 'John Doe',
            'email' => 'john@example.com',
            'phone' => '010-1234-5678',
        ],
        'account' => [
            'username' => 'johndoe123',
            'password' => 'SecurePass123',
        ],
        'newsletter' => '1',
        'terms' => true,
    ];

    // Test data - invalid
    $invalidData = [
        'personal' => [
            'name' => 'J', // Too short
            'email' => 'invalid', // Invalid email
            'phone' => '12345', // Invalid format
        ],
        'account' => [
            'username' => 'jo', // Too short
            'password' => 'short', // Too short, no numbers
        ],
        'newsletter' => '1',
        'terms' => false, // Required but false
    ];

    echo "Valid data result: " . json_encode($validator->validate($validData)->toArray(), JSON_PRETTY_PRINT) . "\n";
    echo "Invalid data result: " . json_encode($validator->validate($invalidData)->toArray(), JSON_PRETTY_PRINT) . "\n\n";
}

// =============================================================================
// Conditional Required Validation
// =============================================================================

/**
 * Demonstrate conditional required field validation
 */
function conditionalRequiredExample(): void
{
    echo "=== Conditional Required Example ===\n";

    $spec = [
        'type' => 'group',
        'properties' => [
            'delivery_type' => [
                'type' => 'choice',
                'rules' => ['required' => true],
            ],
            // Address is required only when delivery_type is not 'pickup' (value 3)
            'address' => [
                'type' => 'group',
                'properties' => [
                    'street' => [
                        'type' => 'text',
                        'rules' => [
                            // Conditional required using expression
                            'required' => '..delivery_type != 3',
                        ],
                        'messages' => [
                            'required' => 'Street address is required for delivery.',
                        ],
                    ],
                    'city' => [
                        'type' => 'text',
                        'rules' => [
                            'required' => '..delivery_type != 3',
                        ],
                    ],
                    'postal_code' => [
                        'type' => 'text',
                        'rules' => [
                            'required' => '..delivery_type != 3',
                            'match' => '^[0-9]{5}$',
                        ],
                    ],
                ],
            ],
            // Pickup location is required only when delivery_type is 'pickup'
            'pickup_location' => [
                'type' => 'select',
                'rules' => [
                    'required' => '.delivery_type == 3',
                ],
                'messages' => [
                    'required' => 'Please select a pickup location.',
                ],
            ],
        ],
    ];

    $validator = new Validator($spec);

    // Test case 1: Standard delivery without address (should fail)
    $deliveryNoAddress = [
        'delivery_type' => '1',
        'address' => [],
        'pickup_location' => '',
    ];

    // Test case 2: Standard delivery with address (should pass)
    $deliveryWithAddress = [
        'delivery_type' => '1',
        'address' => [
            'street' => '123 Main St',
            'city' => 'Seoul',
            'postal_code' => '12345',
        ],
        'pickup_location' => '',
    ];

    // Test case 3: Pickup without location (should fail)
    $pickupNoLocation = [
        'delivery_type' => '3',
        'address' => [],
        'pickup_location' => '',
    ];

    // Test case 4: Pickup with location (should pass)
    $pickupWithLocation = [
        'delivery_type' => '3',
        'address' => [],
        'pickup_location' => 'store1',
    ];

    echo "Delivery without address: " . ($validator->validate($deliveryNoAddress)->isValid() ? 'PASS' : 'FAIL') . "\n";
    echo "Delivery with address: " . ($validator->validate($deliveryWithAddress)->isValid() ? 'PASS' : 'FAIL') . "\n";
    echo "Pickup without location: " . ($validator->validate($pickupNoLocation)->isValid() ? 'PASS' : 'FAIL') . "\n";
    echo "Pickup with location: " . ($validator->validate($pickupWithLocation)->isValid() ? 'PASS' : 'FAIL') . "\n\n";
}

// =============================================================================
// Complex Expressions
// =============================================================================

/**
 * Demonstrate complex conditional expressions
 */
function complexExpressionsExample(): void
{
    echo "=== Complex Expressions Example ===\n";

    $spec = [
        'type' => 'group',
        'properties' => [
            'product_type' => [
                'type' => 'select',
                'rules' => ['required' => true],
            ],
            'is_digital' => [
                'type' => 'choice',
                'default' => '0',
            ],
            'price' => [
                'type' => 'number',
                'rules' => [
                    // Required when not free (product_type != 'free')
                    'required' => '.product_type != "free"',
                    'min' => 0,
                ],
            ],
            // Shipping info required for physical products
            'shipping' => [
                'type' => 'group',
                'properties' => [
                    'weight' => [
                        'type' => 'number',
                        'rules' => [
                            // Required when: product is not free AND is not digital
                            'required' => '..product_type != "free" && ..is_digital == 0',
                        ],
                    ],
                    'dimensions' => [
                        'type' => 'text',
                        'rules' => [
                            'required' => '..product_type != "free" && ..is_digital == 0',
                        ],
                    ],
                ],
            ],
            // Download URL required for digital products
            'download_url' => [
                'type' => 'text',
                'rules' => [
                    'required' => '.product_type != "free" && .is_digital == 1',
                    'match' => '^https?://',
                ],
                'messages' => [
                    'required' => 'Download URL is required for digital products.',
                    'match' => 'Please enter a valid URL starting with http:// or https://',
                ],
            ],
        ],
    ];

    $validator = new Validator($spec);

    // Physical product
    $physicalProduct = [
        'product_type' => 'standard',
        'is_digital' => '0',
        'price' => 29.99,
        'shipping' => [
            'weight' => 0.5,
            'dimensions' => '10x10x5',
        ],
        'download_url' => '',
    ];

    // Digital product
    $digitalProduct = [
        'product_type' => 'standard',
        'is_digital' => '1',
        'price' => 9.99,
        'shipping' => [],
        'download_url' => 'https://example.com/download/file.zip',
    ];

    // Free product (minimal requirements)
    $freeProduct = [
        'product_type' => 'free',
        'is_digital' => '1',
        'price' => 0,
        'shipping' => [],
        'download_url' => '',
    ];

    echo "Physical product: " . ($validator->validate($physicalProduct)->isValid() ? 'VALID' : 'INVALID') . "\n";
    echo "Digital product: " . ($validator->validate($digitalProduct)->isValid() ? 'VALID' : 'INVALID') . "\n";
    echo "Free product: " . ($validator->validate($freeProduct)->isValid() ? 'VALID' : 'INVALID') . "\n\n";
}

// =============================================================================
// Nested Groups and Arrays
// =============================================================================

/**
 * Demonstrate nested groups and array validation
 */
function nestedGroupsExample(): void
{
    echo "=== Nested Groups Example ===\n";

    $spec = [
        'type' => 'group',
        'properties' => [
            'company' => [
                'type' => 'group',
                'properties' => [
                    'name' => [
                        'type' => 'text',
                        'rules' => ['required' => true, 'maxlength' => 100],
                    ],
                    'address' => [
                        'type' => 'group',
                        'properties' => [
                            'street' => ['type' => 'text', 'rules' => ['required' => true]],
                            'city' => ['type' => 'text', 'rules' => ['required' => true]],
                            'country' => ['type' => 'select', 'rules' => ['required' => true]],
                        ],
                    ],
                ],
            ],
            // Array of employees
            'employees[]' => [
                'type' => 'group',
                'multiple' => true,
                'properties' => [
                    'name' => [
                        'type' => 'text',
                        'rules' => ['required' => true],
                    ],
                    'email' => [
                        'type' => 'email',
                        'rules' => ['required' => true, 'email' => true],
                    ],
                    'role' => [
                        'type' => 'select',
                        'rules' => ['required' => true],
                    ],
                ],
            ],
            // Array of tags with unique constraint
            'tags[]' => [
                'type' => 'text',
                'multiple' => true,
                'rules' => [
                    'unique' => true,
                    'maxlength' => 30,
                ],
            ],
        ],
    ];

    $validator = new Validator($spec);

    // Valid data
    $validData = [
        'company' => [
            'name' => 'Acme Corp',
            'address' => [
                'street' => '123 Business Ave',
                'city' => 'Seoul',
                'country' => 'KR',
            ],
        ],
        'employees' => [
            ['name' => 'John Doe', 'email' => 'john@acme.com', 'role' => 'developer'],
            ['name' => 'Jane Smith', 'email' => 'jane@acme.com', 'role' => 'designer'],
        ],
        'tags' => ['technology', 'software', 'startup'],
    ];

    // Invalid data
    $invalidData = [
        'company' => [
            'name' => '', // Required
            'address' => [
                'street' => '123 Business Ave',
                'city' => '', // Required
                'country' => 'KR',
            ],
        ],
        'employees' => [
            ['name' => 'John Doe', 'email' => 'invalid-email', 'role' => 'developer'], // Invalid email
            ['name' => '', 'email' => 'jane@acme.com', 'role' => ''], // Missing name and role
        ],
        'tags' => ['technology', 'technology', 'startup'], // Duplicate
    ];

    echo "Valid data: " . ($validator->validate($validData)->isValid() ? 'VALID' : 'INVALID') . "\n";
    echo "Invalid data: " . ($validator->validate($invalidData)->isValid() ? 'VALID' : 'INVALID') . "\n";

    $invalidResult = $validator->validate($invalidData);
    if (!$invalidResult->isValid()) {
        echo "Errors:\n";
        foreach ($invalidResult->getErrors() as $path => $error) {
            echo "  - {$path}: {$error['message']}\n";
        }
    }
    echo "\n";
}

// =============================================================================
// Custom Rules
// =============================================================================

/**
 * Demonstrate adding custom validation rules
 */
function customRulesExample(): void
{
    echo "=== Custom Rules Example ===\n";

    $spec = [
        'type' => 'group',
        'properties' => [
            'username' => [
                'type' => 'text',
                'rules' => [
                    'required' => true,
                    'no_profanity' => true,
                ],
                'messages' => [
                    'no_profanity' => 'Username contains inappropriate content.',
                ],
            ],
            'password' => [
                'type' => 'password',
                'rules' => [
                    'required' => true,
                    'minlength' => 8,
                ],
            ],
            'password_confirm' => [
                'type' => 'password',
                'rules' => [
                    'required' => true,
                    'matches' => 'password',
                ],
                'messages' => [
                    'matches' => 'Passwords do not match.',
                ],
            ],
            'age' => [
                'type' => 'number',
                'rules' => [
                    'required' => true,
                    'age_range' => ['min' => 18, 'max' => 120],
                ],
                'messages' => [
                    'age_range' => 'Age must be between {0} and {1}.',
                ],
            ],
        ],
    ];

    $validator = new Validator($spec);

    // Register custom rule: no_profanity
    $validator->addRule('no_profanity', function ($value, $param, $allData, $path): bool {
        if (empty($value) || !is_string($value)) {
            return true;
        }
        $profanityList = ['badword1', 'badword2', 'inappropriate'];
        $lowercaseValue = strtolower($value);
        foreach ($profanityList as $word) {
            if (str_contains($lowercaseValue, $word)) {
                return false;
            }
        }
        return true;
    });

    // Register custom rule: matches (compare with another field)
    $validator->addRule('matches', function ($value, $param, $allData, $path): bool {
        if (!is_string($param) || empty($param)) {
            return true;
        }
        return $value === ($allData[$param] ?? null);
    });

    // Register custom rule: age_range
    $validator->addRule('age_range', function ($value, $param, $allData, $path): bool {
        if (empty($value) || !is_array($param)) {
            return true;
        }
        $age = (int) $value;
        $min = $param['min'] ?? 0;
        $max = $param['max'] ?? PHP_INT_MAX;
        return $age >= $min && $age <= $max;
    });

    // Test data - valid
    $validData = [
        'username' => 'gooduser123',
        'password' => 'SecurePass123',
        'password_confirm' => 'SecurePass123',
        'age' => 25,
    ];

    // Test data - invalid
    $invalidData = [
        'username' => 'user_badword1_name',
        'password' => 'SecurePass123',
        'password_confirm' => 'DifferentPass456',
        'age' => 15,
    ];

    echo "Valid data: " . ($validator->validate($validData)->isValid() ? 'VALID' : 'INVALID') . "\n";
    echo "Invalid data: " . ($validator->validate($invalidData)->isValid() ? 'VALID' : 'INVALID') . "\n";

    $invalidResult = $validator->validate($invalidData);
    if (!$invalidResult->isValid()) {
        echo "Errors:\n";
        foreach ($invalidResult->getErrors() as $path => $error) {
            echo "  - {$path}: {$error['message']}\n";
        }
    }
    echo "\n";
}

// =============================================================================
// Laravel Integration Example
// =============================================================================

/**
 * Example Laravel controller integration
 */
function laravelIntegrationExample(): void
{
    echo "=== Laravel Integration Example ===\n";

    $exampleCode = <<<'PHP'
<?php

namespace App\Http\Controllers;

use Polyspec\Validator\Validator;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Symfony\Component\Yaml\Yaml;

class ProductController extends Controller
{
    /**
     * Create a new product
     */
    public function store(Request $request): JsonResponse
    {
        // Load spec from YAML file
        $specPath = resource_path('specs/product-form.yml');
        $spec = Yaml::parseFile($specPath);

        $validator = new Validator($spec);
        $result = $validator->validate($request->all());

        if (!$result->isValid()) {
            return response()->json([
                'success' => false,
                'message' => 'Validation failed',
                'errors' => $result->getErrors(),
            ], 422);
        }

        // Process validated data
        $product = Product::create($request->validated());

        return response()->json([
            'success' => true,
            'message' => 'Product created successfully',
            'data' => $product,
        ], 201);
    }

    /**
     * Validate a single field (for AJAX validation)
     */
    public function validateField(Request $request): JsonResponse
    {
        $specPath = resource_path('specs/product-form.yml');
        $spec = Yaml::parseFile($specPath);

        $validator = new Validator($spec);
        $error = $validator->validateField(
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

// Form Request class for reusable validation
class StoreProductRequest extends FormRequest
{
    protected Validator $formValidator;

    public function __construct()
    {
        $specPath = resource_path('specs/product-form.yml');
        $spec = Yaml::parseFile($specPath);
        $this->formValidator = new Validator($spec);
    }

    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        // Convert spec rules to Laravel rules if needed
        return [];
    }

    protected function passesAuthorization(): bool
    {
        return true;
    }

    public function validated($key = null, $default = null): array
    {
        $result = $this->formValidator->validate($this->all());

        if (!$result->isValid()) {
            throw new ValidationException(
                validator: $this->getValidatorInstance(),
                response: response()->json(['errors' => $result->getErrors()], 422)
            );
        }

        return $this->all();
    }
}
PHP;

    echo $exampleCode . "\n\n";
}

// =============================================================================
// Single Field Validation
// =============================================================================

/**
 * Validate individual fields for real-time feedback
 */
function singleFieldValidationExample(): void
{
    echo "=== Single Field Validation Example ===\n";

    $spec = [
        'type' => 'group',
        'properties' => [
            'email' => [
                'type' => 'email',
                'rules' => ['required' => true, 'email' => true],
                'messages' => [
                    'required' => 'Email is required.',
                    'email' => 'Invalid email format.',
                ],
            ],
            'password' => [
                'type' => 'password',
                'rules' => ['required' => true, 'minlength' => 8],
            ],
            'age' => [
                'type' => 'number',
                'rules' => ['required' => true, 'min' => 18, 'max' => 120],
            ],
        ],
    ];

    $validator = new Validator($spec);

    // Simulate real-time validation as user types
    $simulatedInputs = [
        ['path' => 'email', 'value' => '', 'allData' => []],
        ['path' => 'email', 'value' => 'test', 'allData' => ['email' => 'test']],
        ['path' => 'email', 'value' => 'test@', 'allData' => ['email' => 'test@']],
        ['path' => 'email', 'value' => 'test@example.com', 'allData' => ['email' => 'test@example.com']],
        ['path' => 'password', 'value' => '123', 'allData' => ['password' => '123']],
        ['path' => 'password', 'value' => '12345678', 'allData' => ['password' => '12345678']],
        ['path' => 'age', 'value' => '15', 'allData' => ['age' => '15']],
        ['path' => 'age', 'value' => '25', 'allData' => ['age' => '25']],
    ];

    foreach ($simulatedInputs as $input) {
        $error = $validator->validateField($input['path'], $input['value'], $input['allData']);
        printf(
            "Field \"%s\" = \"%s\": %s\n",
            $input['path'],
            $input['value'],
            $error ?? 'Valid'
        );
    }
    echo "\n";
}

// =============================================================================
// API Endpoint Example
// =============================================================================

/**
 * Example API validation endpoint
 */
function apiEndpointExample(): void
{
    echo "=== API Endpoint Example ===\n";

    $exampleCode = <<<'PHP'
<?php
// api/validate.php - Simple API endpoint for form validation

header('Content-Type: application/json');

require_once __DIR__ . '/../vendor/autoload.php';

use Polyspec\Validator\Validator;
use Symfony\Component\Yaml\Yaml;

// Get request body
$input = json_decode(file_get_contents('php://input'), true);

if (!$input) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid request body']);
    exit;
}

try {
    // Load spec (from file or request)
    $specName = $input['spec'] ?? 'default';
    $specPath = __DIR__ . "/specs/{$specName}.yml";

    if (!file_exists($specPath)) {
        throw new Exception("Spec not found: {$specName}");
    }

    $spec = Yaml::parseFile($specPath);
    $validator = new Validator($spec);

    // Validate based on mode
    $mode = $input['mode'] ?? 'full';

    if ($mode === 'field') {
        // Single field validation
        $error = $validator->validateField(
            $input['path'],
            $input['value'],
            $input['allData'] ?? []
        );

        echo json_encode([
            'valid' => $error === null,
            'error' => $error,
        ]);
    } else {
        // Full form validation
        $result = $validator->validate($input['data'] ?? []);

        echo json_encode([
            'valid' => $result->isValid(),
            'errors' => $result->getErrors(),
        ]);
    }
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        'error' => $e->getMessage(),
    ]);
}
PHP;

    echo $exampleCode . "\n\n";
}

// =============================================================================
// Run All Examples
// =============================================================================

echo "Form Generator - PHP Validation Examples\n";
echo str_repeat("=", 60) . "\n\n";

basicExample();
// yamlFileExample(); // Uncomment when YAML file exists and yaml extension is installed
conditionalRequiredExample();
complexExpressionsExample();
nestedGroupsExample();
customRulesExample();
laravelIntegrationExample();
singleFieldValidationExample();
apiEndpointExample();

echo str_repeat("=", 60) . "\n";
echo "All examples completed.\n";

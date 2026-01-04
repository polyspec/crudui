#!/usr/bin/env php
<?php
/**
 * API Test Script
 *
 * Tests the validation API endpoint locally.
 * Run: php test-api.php
 */

declare(strict_types=1);

require_once __DIR__ . '/vendor/autoload.php';

use FormSpec\Validator\Legacy\Validator;
use Symfony\Component\Yaml\Yaml;

echo "=== FormSpec PHP API Test ===\n\n";

// Test 1: Valid user registration
echo "Test 1: Valid user registration\n";
$spec = Yaml::parseFile(__DIR__ . '/specs/user-registration.yml');
$validator = new Validator($spec);

$validData = [
    'email' => 'user@example.com',
    'password' => 'SecurePass123',
    'password_confirm' => 'SecurePass123',
    'name' => 'John Doe',
    'phone' => '010-1234-5678',
    'terms' => true,
];

$result = $validator->validate($validData);
echo "  Valid: " . ($result->isValid() ? 'YES' : 'NO') . "\n";
assert($result->isValid(), 'Valid data should pass validation');
echo "  [PASS]\n\n";

// Test 2: Invalid user registration
echo "Test 2: Invalid user registration\n";
$invalidData = [
    'email' => 'invalid-email',
    'password' => '123',
    'password_confirm' => '456',
    'name' => 'J',
    'phone' => '12345',
    'terms' => false,
];

$result = $validator->validate($invalidData);
echo "  Valid: " . ($result->isValid() ? 'YES' : 'NO') . "\n";
echo "  Errors:\n";
foreach ($result->getErrors() as $path => $error) {
    echo "    - {$path}: {$error['message']}\n";
}
assert(!$result->isValid(), 'Invalid data should fail validation');
echo "  [PASS]\n\n";

// Test 3: Single field validation
echo "Test 3: Single field validation\n";
$error = $validator->validateField('email', 'invalid-email', []);
echo "  Field: email, Value: 'invalid-email'\n";
echo "  Error: " . ($error ?? 'null') . "\n";
assert($error !== null, 'Invalid email should return error');
echo "  [PASS]\n\n";

// Test 4: Product form with conditional validation
echo "Test 4: Product form conditional validation\n";
$productSpec = Yaml::parseFile(__DIR__ . '/specs/product-form.yml');
$productValidator = new Validator($productSpec);

// Physical product requires shipping info
$physicalProduct = [
    'name' => 'Test Product',
    'product_type' => 'physical',
    'price' => 29900,
    'shipping' => [
        'weight' => 0.5,
        'dimensions' => '10x20x30',
    ],
    'categories' => ['electronics'],
    'images' => ['image1.jpg'],
];

$result = $productValidator->validate($physicalProduct);
echo "  Physical product with shipping: " . ($result->isValid() ? 'VALID' : 'INVALID') . "\n";
assert($result->isValid(), 'Physical product with shipping should pass');

// Digital product requires download URL
$digitalProduct = [
    'name' => 'Digital Product',
    'product_type' => 'digital',
    'price' => 9900,
    'download_url' => 'https://example.com/download',
    'categories' => ['software'],
    'images' => ['image1.jpg'],
];

$result = $productValidator->validate($digitalProduct);
echo "  Digital product with URL: " . ($result->isValid() ? 'VALID' : 'INVALID') . "\n";
assert($result->isValid(), 'Digital product with URL should pass');

// Digital product without URL should fail
$digitalProductNoUrl = [
    'name' => 'Digital Product',
    'product_type' => 'digital',
    'price' => 9900,
    'categories' => ['software'],
    'images' => ['image1.jpg'],
];

$result = $productValidator->validate($digitalProductNoUrl);
echo "  Digital product without URL: " . ($result->isValid() ? 'VALID' : 'INVALID') . "\n";
assert(!$result->isValid(), 'Digital product without URL should fail');
echo "  [PASS]\n\n";

// Test 5: Legacy Adapter
echo "Test 5: Legacy Adapter\n";
require_once __DIR__ . '/src/LegacyAdapter.php';

$adapter = new \App\LegacyAdapter(__DIR__ . '/specs');
$result = $adapter->validate('user-registration', $validData);
echo "  Adapter validation: " . ($result->isValid() ? 'VALID' : 'INVALID') . "\n";
assert($result->isValid(), 'Adapter should validate correctly');
echo "  [PASS]\n\n";

echo "=== All tests passed! ===\n";

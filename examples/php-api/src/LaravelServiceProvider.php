<?php
/**
 * Laravel Integration
 *
 * Service provider and helper classes for integrating form-spec validation
 * into Laravel applications.
 */

declare(strict_types=1);

namespace App;

use FormSpec\Validator\Legacy\Validator;
use FormSpec\Validator\Legacy\ValidationResult;
use Symfony\Component\Yaml\Yaml;
use Illuminate\Support\ServiceProvider;
use Illuminate\Http\Request;
use Illuminate\Contracts\Validation\Validator as LaravelValidator;

/**
 * Laravel Service Provider for FormSpec Validator
 *
 * Register in config/app.php:
 *   'providers' => [
 *       App\FormSpecServiceProvider::class,
 *   ],
 *
 * Usage:
 *   $validator = app('formspec.validator', ['spec' => 'user-registration']);
 *   $result = $validator->validate($request->all());
 */
class FormSpecServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        // Bind the validator factory
        $this->app->bind('formspec.validator', function ($app, array $params) {
            $specName = $params['spec'] ?? 'default';
            $specPath = $this->getSpecPath($specName);
            $spec = Yaml::parseFile($specPath);
            return new Validator($spec);
        });

        // Bind the adapter for reusable validation
        $this->app->singleton('formspec.adapter', function ($app) {
            $specDir = config('formspec.spec_directory', resource_path('specs'));
            return new FormSpecAdapter($specDir);
        });
    }

    public function boot(): void
    {
        // Publish config file
        $this->publishes([
            __DIR__ . '/../config/formspec.php' => config_path('formspec.php'),
        ], 'formspec-config');

        // Add custom validation rule
        \Illuminate\Support\Facades\Validator::extend('formspec', function (
            $attribute,
            $value,
            $parameters,
            $validator
        ) {
            $specName = $parameters[0] ?? null;
            if (!$specName) {
                return false;
            }

            $adapter = app('formspec.adapter');
            $result = $adapter->validate($specName, $value);
            return $result->isValid();
        });
    }

    private function getSpecPath(string $specName): string
    {
        $specDir = config('formspec.spec_directory', resource_path('specs'));
        return "{$specDir}/{$specName}.yml";
    }
}

/**
 * FormSpec Adapter for Laravel
 *
 * Provides a clean interface for form validation in Laravel applications.
 */
class FormSpecAdapter
{
    private string $specDirectory;
    private array $validators = [];

    public function __construct(string $specDirectory)
    {
        $this->specDirectory = $specDirectory;
    }

    /**
     * Validate request data against a specification.
     */
    public function validate(string $specName, array $data): ValidationResult
    {
        return $this->getValidator($specName)->validate($data);
    }

    /**
     * Validate a single field.
     */
    public function validateField(
        string $specName,
        string $path,
        mixed $value,
        array $allData = []
    ): ?string {
        return $this->getValidator($specName)->validateField($path, $value, $allData);
    }

    /**
     * Get validator instance.
     */
    public function getValidator(string $specName): Validator
    {
        if (!isset($this->validators[$specName])) {
            $specPath = "{$this->specDirectory}/{$specName}.yml";
            $spec = Yaml::parseFile($specPath);
            $this->validators[$specName] = new Validator($spec);
        }
        return $this->validators[$specName];
    }
}

/**
 * Example Laravel Controller
 *
 * Demonstrates how to use FormSpec validation in Laravel controllers.
 */
abstract class ExampleController
{
    /**
     * Example: User registration with FormSpec validation
     */
    public function register(Request $request): \Illuminate\Http\JsonResponse
    {
        // Method 1: Using the adapter directly
        $adapter = app('formspec.adapter');
        $result = $adapter->validate('user-registration', $request->all());

        if (!$result->isValid()) {
            return response()->json([
                'success' => false,
                'message' => 'Validation failed',
                'errors' => $result->getErrors(),
            ], 422);
        }

        // Process valid data...
        return response()->json([
            'success' => true,
            'message' => 'User registered successfully',
        ]);
    }

    /**
     * Example: AJAX field validation endpoint
     */
    public function validateField(Request $request): \Illuminate\Http\JsonResponse
    {
        $specName = $request->input('spec');
        $path = $request->input('path');
        $value = $request->input('value');
        $allData = $request->input('allData', []);

        $adapter = app('formspec.adapter');
        $error = $adapter->validateField($specName, $path, $value, $allData);

        return response()->json([
            'valid' => $error === null,
            'error' => $error,
        ]);
    }

    /**
     * Example: Product creation with conditional validation
     */
    public function createProduct(Request $request): \Illuminate\Http\JsonResponse
    {
        $adapter = app('formspec.adapter');

        // Get validator and add custom rule
        $validator = $adapter->getValidator('product-form');
        $validator->addRule('unique_sku', function ($value, $param, $allData, $path) {
            // Check SKU uniqueness in database
            // return !Product::where('sku', $value)->exists();
            return true; // Placeholder
        });

        $result = $validator->validate($request->all());

        if (!$result->isValid()) {
            return response()->json([
                'success' => false,
                'errors' => $result->getErrors(),
            ], 422);
        }

        // Create product...
        return response()->json([
            'success' => true,
            'message' => 'Product created',
        ], 201);
    }
}

/**
 * Example Form Request class for Laravel
 *
 * Create: php artisan make:request UserRegistrationRequest
 * Then extend or modify as shown below.
 */
abstract class FormSpecRequest extends \Illuminate\Foundation\Http\FormRequest
{
    /**
     * Get the specification name for this request.
     */
    abstract protected function getSpecName(): string;

    /**
     * Determine if the user is authorized to make this request.
     */
    public function authorize(): bool
    {
        return true;
    }

    /**
     * Get the validation rules that apply to the request.
     * Returns empty array since we use FormSpec validation.
     */
    public function rules(): array
    {
        return [];
    }

    /**
     * Validate the class instance.
     */
    public function validateResolved(): void
    {
        $adapter = app('formspec.adapter');
        $result = $adapter->validate($this->getSpecName(), $this->all());

        if (!$result->isValid()) {
            throw new \Illuminate\Validation\ValidationException(
                $this->createValidator(),
                response()->json([
                    'message' => 'The given data was invalid.',
                    'errors' => $this->formatErrors($result->getErrors()),
                ], 422)
            );
        }
    }

    /**
     * Format FormSpec errors for Laravel response format.
     */
    protected function formatErrors(array $errors): array
    {
        $formatted = [];
        foreach ($errors as $path => $error) {
            // Convert dot notation to Laravel's format
            $key = str_replace('.', '_', $path);
            $formatted[$key] = [$error['message']];
        }
        return $formatted;
    }

    /**
     * Create a dummy validator for exception handling.
     */
    private function createValidator(): LaravelValidator
    {
        return \Illuminate\Support\Facades\Validator::make([], []);
    }
}

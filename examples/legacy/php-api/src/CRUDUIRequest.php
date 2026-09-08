<?php
declare(strict_types=1);

namespace App;

use Illuminate\Contracts\Validation\Validator as LaravelValidator;

/**
 * Example Form Request class for Laravel
 *
 * Create: php artisan make:request UserRegistrationRequest
 * Then extend or modify as shown below.
 */
abstract class CRUDUIRequest extends \Illuminate\Foundation\Http\FormRequest
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
     * Returns empty array since we use CRUDUI validation.
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
        $adapter = app('crudui.adapter');
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
     * Format CRUDUI errors for Laravel response format.
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

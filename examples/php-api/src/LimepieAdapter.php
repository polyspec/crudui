<?php
/**
 * Limepie Adapter
 *
 * Provides integration patterns for existing Limepie PHP applications.
 * This adapter helps migrate from Limepie's built-in validation to
 * the polyspec validation system.
 */

declare(strict_types=1);

namespace App;

use Polyspec\Validator\Validator;
use Polyspec\Validator\ValidationResult;
use Symfony\Component\Yaml\Yaml;

/**
 * Limepie-compatible form validation trait.
 *
 * Usage in Limepie controllers:
 *
 *   class MyController extends \Limepie\Controller
 *   {
 *       use \App\LimepieValidationTrait;
 *
 *       public function postAction(): array
 *       {
 *           $result = $this->validatePolyspec('product-form', $this->getPost());
 *           if (!$result->isValid()) {
 *               return $this->error($result->getErrors());
 *           }
 *           // Continue with valid data...
 *       }
 *   }
 */
trait LimepieValidationTrait
{
    /**
     * Validate form data against a YAML specification.
     *
     * @param string $specName Specification file name (without .yml extension)
     * @param array $data Form data to validate
     * @param string|null $specDir Custom spec directory path
     */
    protected function validatePolyspec(
        string $specName,
        array $data,
        ?string $specDir = null
    ): ValidationResult {
        $specDir = $specDir ?? $this->getSpecDirectory();
        $specPath = "{$specDir}/{$specName}.yml";

        if (!file_exists($specPath)) {
            throw new \RuntimeException("Specification not found: {$specPath}");
        }

        $spec = Yaml::parseFile($specPath);
        $validator = new Validator($spec);

        return $validator->validate($data);
    }

    /**
     * Validate a single field for AJAX validation.
     *
     * @param string $specName Specification file name
     * @param string $path Field path (dot notation)
     * @param mixed $value Field value
     * @param array $allData All form data for conditional validation
     */
    protected function validateFormField(
        string $specName,
        string $path,
        mixed $value,
        array $allData = []
    ): ?string {
        $specDir = $this->getSpecDirectory();
        $specPath = "{$specDir}/{$specName}.yml";

        $spec = Yaml::parseFile($specPath);
        $validator = new Validator($spec);

        return $validator->validateField($path, $value, $allData);
    }

    /**
     * Get the specification directory path.
     * Override this method to customize the spec directory location.
     */
    protected function getSpecDirectory(): string
    {
        // Default Limepie spec location
        return dirname(__DIR__, 2) . '/resource/Module/Spec';
    }
}

/**
 * Limepie-compatible form validator class.
 *
 * For use in service classes or when trait is not appropriate:
 *
 *   $adapter = new LimepieAdapter('/path/to/specs');
 *   $result = $adapter->validate('product-form', $postData);
 */
class LimepieAdapter
{
    private string $specDirectory;
    private array $loadedSpecs = [];
    private array $validators = [];

    public function __construct(string $specDirectory)
    {
        $this->specDirectory = rtrim($specDirectory, '/');
    }

    /**
     * Validate form data.
     */
    public function validate(string $specName, array $data): ValidationResult
    {
        $validator = $this->getValidator($specName);
        return $validator->validate($data);
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
        $validator = $this->getValidator($specName);
        return $validator->validateField($path, $value, $allData);
    }

    /**
     * Get or create a validator instance for a spec.
     */
    private function getValidator(string $specName): Validator
    {
        if (!isset($this->validators[$specName])) {
            $spec = $this->loadSpec($specName);
            $this->validators[$specName] = new Validator($spec);
        }
        return $this->validators[$specName];
    }

    /**
     * Load and cache a specification.
     */
    private function loadSpec(string $specName): array
    {
        if (!isset($this->loadedSpecs[$specName])) {
            $specPath = "{$this->specDirectory}/{$specName}.yml";

            if (!file_exists($specPath)) {
                throw new \RuntimeException("Specification not found: {$specPath}");
            }

            $this->loadedSpecs[$specName] = Yaml::parseFile($specPath);
        }
        return $this->loadedSpecs[$specName];
    }

    /**
     * Register a custom validation rule.
     */
    public function addRule(string $specName, string $ruleName, callable $fn): void
    {
        $validator = $this->getValidator($specName);
        $validator->addRule($ruleName, $fn);
    }

    /**
     * Get the raw specification array.
     */
    public function getSpec(string $specName): array
    {
        return $this->loadSpec($specName);
    }

    /**
     * Clear cached specifications and validators.
     */
    public function clearCache(): void
    {
        $this->loadedSpecs = [];
        $this->validators = [];
    }
}

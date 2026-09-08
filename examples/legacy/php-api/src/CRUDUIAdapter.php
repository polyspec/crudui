<?php
declare(strict_types=1);

namespace App;

use CRUDUI\Validator\Legacy\Validator;
use CRUDUI\Validator\Legacy\ValidationResult;
use Symfony\Component\Yaml\Yaml;

/**
 * CRUDUI Adapter for Laravel
 *
 * Provides a clean interface for form validation in Laravel applications.
 */
class CRUDUIAdapter
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

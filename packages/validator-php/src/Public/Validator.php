<?php

declare(strict_types=1);

namespace CRUDUI;

use CRUDUI\Validator\Compose\Compose;
use CRUDUI\Validator\Compose\MemoryLoader;
use CRUDUI\Validator\Compose\Patch;
use CRUDUI\Validator\Compose\Ref;
use CRUDUI\Validator\ForbiddenScan;
use CRUDUI\Validator\Support\JsonValue;
use CRUDUI\Validator\Validate\FormInputError;
use CRUDUI\Validator\Validate\Validator as DataValidator;
use stdClass;

/** Compose specifications and validate submitted data or list declarations. */
final class Validator
{
    /**
     * Return object validation results. Root data that is a non-empty list raises
     * FormInputError before composition; composition failures raise
     * ComposeLoadError; group or repeated data with the wrong shape raises
     * FormInputError.
     */
    public static function validate(array|stdClass $spec, array|stdClass $data, array $options = []): stdClass
    {
        if (is_array($data) && $data !== [] && array_is_list($data)) {
            throw new FormInputError('Form data must be an object');
        }
        $spec = (array) JsonValue::object($spec);
        $data = JsonValue::object($data);
        $loader = self::loader($options);
        $basepath = $options['basepath'] ?? '';
        $hasProperties = ($spec['properties'] ?? null) instanceof stdClass;
        $composition = array_key_exists('$ref', $spec) || array_key_exists('$patch', $spec);
        if ($composition && !$hasProperties) {
            $properties = Compose::properties($spec, $loader, $basepath);
        } else {
            $composed = Compose::spec($spec, $loader, $basepath);
            $properties = JsonValue::members($composed['properties'] ?? null);
        }
        ForbiddenScan::scan($properties, ['properties']);
        $result = (new DataValidator(['type' => 'group', 'properties' => $properties]))->validate((array) $data);
        return (object) ['valid' => $result->valid, 'errors' => array_map(static fn ($error) => JsonValue::copy((object) $error), $result->errors)];
    }

    /** Validate list composition and metadata without validating row data. */
    public static function validateList(array|stdClass $spec, array $options = []): stdClass
    {
        $spec = (array) JsonValue::object($spec);
        $loader = self::loader($options);
        $basepath = $options['basepath'] ?? '';
        $base = [];
        $own = [];
        $hasPatch = false;
        $patch = null;
        foreach ($spec as $key => $value) {
            if ($key === '$ref') {
                $base = array_replace($own, Ref::resolve($value, $basepath, $loader));
                $own = [];
            } elseif ($key === '$patch') {
                $patch = $value;
                $hasPatch = true;
            } else {
                $own[$key] = $value;
            }
        }
        $composed = array_replace($base, $own);
        if ($hasPatch) {
            $composed = Patch::apply($composed, $patch);
        }
        if (JsonValue::isObject($composed['columns'] ?? null)) {
            $composed['columns'] = Compose::properties((array) $composed['columns'], $loader, $basepath);
        }
        if (JsonValue::isObject($composed['search'] ?? null)) {
            $search = (array) $composed['search'];
            if (array_key_exists('$ref', $search) || array_key_exists('$patch', $search)) {
                $composed['search'] = Compose::properties($search, $loader, $basepath);
            }
        }
        ForbiddenScan::scan($composed);
        return (object) ['valid' => true, 'errors' => []];
    }

    private static function loader(array $options): MemoryLoader
    {
        $files = JsonValue::object($options['files'] ?? []);
        $maps = [];
        foreach ($files as $key => $file) {
            if (!$file instanceof stdClass) {
                throw new \TypeError('Composition files must contain objects');
            }
            $maps[$key] = (array) $file;
        }
        return new MemoryLoader($maps);
    }
}

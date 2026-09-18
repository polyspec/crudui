<?php

declare(strict_types=1);

namespace CRUDUI;

use CRUDUI\Validator\Compose\Compose;
use CRUDUI\Validator\Compose\MemoryLoader;
use CRUDUI\Validator\Compose\Patch;
use CRUDUI\Validator\Compose\Ref;
use CRUDUI\Validator\ForbiddenScan;
use CRUDUI\Validator\Support\JsonValue;
use CRUDUI\Validator\Support\Text;
use CRUDUI\Validator\Validate\FormInputError;
use CRUDUI\Validator\Validate\Validator as DataValidator;
use stdClass;

/** Compose specifications and validate submitted data or list declarations. */
final class Validator
{
    /**
     * Return object validation results. Invalid input text raises ComposeLoadError in the
     * specification and files and FormInputError elsewhere, before any other check. Root data
     * that is a non-empty list raises
     * FormInputError before composition; composition failures raise
     * ComposeLoadError; group or repeated data with the wrong shape raises
     * FormInputError.
     */
    public static function validate(array|stdClass $spec, array|stdClass $data, array $options = []): stdClass
    {
        // Input text is checked first: the specification and files, the data, then the options.
        self::checkText($spec, $options, [['data', $data]]);
        if (is_array($data) && $data !== [] && array_is_list($data)) {
            throw new FormInputError('Form data must be an object');
        }
        $spec = (array) JsonValue::orderedObject($spec);
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
        // The form root declarations are scanned like the fields they sit beside.
        foreach (['buttons', 'action'] as $key) {
            if (array_key_exists($key, $spec)) {
                ForbiddenScan::scan($spec[$key], [$key]);
            }
        }
        $result = (new DataValidator(['type' => 'group', 'properties' => $properties]))->validate((array) $data);
        return (object) ['valid' => $result->valid, 'errors' => array_map(static fn ($error) => JsonValue::copy((object) $error), $result->errors)];
    }

    /** Validate list composition and metadata without validating row data. */
    public static function validateList(array|stdClass $spec, array $options = []): stdClass
    {
        self::checkText($spec, $options, []);
        $loader = self::loader($options);
        $basepath = $options['basepath'] ?? '';
        $composed = self::composeRoot($spec, $loader, $basepath);
        self::composeMap($composed, 'columns', $loader, $basepath);
        if (JsonValue::isObject($composed['search'] ?? null)) {
            $search = (array) $composed['search'];
            if (array_key_exists('$ref', $search) || array_key_exists('$patch', $search)) {
                self::composeMap($composed, 'search', $loader, $basepath);
            }
        }
        ForbiddenScan::scan($composed);
        return (object) ['valid' => true, 'errors' => []];
    }

    /** Validate detail composition and metadata without validating record data. */
    public static function validateDetail(array|stdClass $spec, array $options = []): stdClass
    {
        self::checkText($spec, $options, []);
        $loader = self::loader($options);
        $basepath = $options['basepath'] ?? '';
        $composed = self::composeRoot($spec, $loader, $basepath);
        self::composeMap($composed, 'fields', $loader, $basepath);
        ForbiddenScan::scan($composed);
        return (object) ['valid' => true, 'errors' => []];
    }

    /**
     * Compose a list or detail root: `$ref` replaces the members before it,
     * later own members override the base and `$patch` applies last.
     *
     * @return array<string, mixed>
     */
    private static function composeRoot(array|stdClass $spec, MemoryLoader $loader, string $basepath): array
    {
        $base = [];
        $own = [];
        $hasPatch = false;
        $patch = null;
        foreach ((array) JsonValue::orderedObject($spec) as $key => $value) {
            if ($key === '$ref') {
                $base = JsonValue::orderedMembers(array_replace($own, Ref::resolve($value, $basepath, $loader)));
                $own = [];
            } elseif ($key === '$patch') {
                $patch = $value;
                $hasPatch = true;
            } else {
                $own[$key] = $value;
            }
        }
        $composed = JsonValue::orderedMembers(array_replace($base, $own));
        return $hasPatch ? Patch::apply($composed, $patch) : $composed;
    }

    /** Expand an object map member with properties composition. */
    private static function composeMap(array &$composed, string $key, MemoryLoader $loader, string $basepath): void
    {
        if (JsonValue::isObject($composed[$key] ?? null)) {
            $composed[$key] = Compose::properties((array) $composed[$key], $loader, $basepath);
        }
    }

    /**
     * Check the text and the limits of a specification, its files, the named inputs and the base
     * path option (docs/spec/input-text.md).
     *
     * @param list<array{0: string, 1: mixed}> $inputs
     */
    private static function checkText(array|stdClass $spec, array $options, array $inputs): void
    {
        $failure = Text::specificationFailure($spec, $options['files'] ?? null)
            ?? Text::inputFailure([...$inputs, ...Text::options($options, ['basepath'])]);
        if ($failure !== null) {
            throw new FormInputError($failure);
        }
    }

    private static function loader(array $options): MemoryLoader
    {
        $files = JsonValue::object($options['files'] ?? []);
        $maps = [];
        foreach ($files as $key => $file) {
            if (!$file instanceof stdClass) {
                throw new \TypeError('Composition files must contain objects');
            }
            $maps[$key] = (array) JsonValue::ordered($file);
        }
        return new MemoryLoader($maps);
    }
}

<?php

declare(strict_types=1);

namespace CRUDUI\Validator\Validate;

use CRUDUI\Validator\Compose\ComposeLoadError;

/**
 * Check the declared rule parameters of a composed field map: fields in declaration
 * order, each field's rules in declaration order before the fields it contains.
 * Every literal a condition map or ternary can select is checked, selected or not.
 *
 * @internal
 */
final class DeclarationCheck
{
    /**
     * @param array<string, mixed> $properties a composed field map
     * @param list<string> $path the declaration path of the map's group
     * @throws ComposeLoadError at the first invalid parameter
     */
    public static function run(array $properties, array $path = []): void
    {
        foreach ($properties as $name => $field) {
            if (!\is_array($field) && !$field instanceof \stdClass) {
                continue;
            }
            $field = (array) $field;
            $fieldPath = [...$path, (string) $name];
            $rules = $field['validate'] ?? null;
            if ($rules instanceof \stdClass || (\is_array($rules) && !array_is_list($rules))) {
                foreach ((array) $rules as $rule => $parameter) {
                    foreach (RuleParameters::declaredValues((string) $rule, $parameter) as $value) {
                        RuleParameters::check((string) $rule, $value, $fieldPath);
                    }
                }
            }
            $children = $field['properties'] ?? null;
            if (($field['type'] ?? null) === 'group'
                && ($children instanceof \stdClass || (\is_array($children) && !array_is_list($children)))) {
                self::run((array) $children, $fieldPath);
            }
        }
    }
}

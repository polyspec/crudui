<?php

declare(strict_types=1);

namespace CRUDUI\Validator\Validate;

use CRUDUI\Validator\Compose\ComposeLoadError;

/**
 * Check the declared rule names and parameters of a composed field map: fields in
 * declaration order, each field's rules in declaration order and then its `messages`
 * keys, before the fields it contains. A name that is not a registered rule is
 * `UNKNOWN_RULE`.
 * Every literal a condition map or ternary can select is checked, selected or not.
 *
 * @internal
 */
final class DeclarationCheck
{
    /**
     * @param array<string, mixed> $properties a composed field map
     * @param list<string> $path the declaration path of the map's group
     * @throws ComposeLoadError at the first unknown rule name or invalid parameter
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
                    self::checkName((string) $rule, $fieldPath);
                    foreach (RuleParameters::declaredValues((string) $rule, $parameter) as $value) {
                        RuleParameters::check((string) $rule, $value, $fieldPath);
                    }
                }
            }
            $messages = $field['messages'] ?? null;
            if ($messages instanceof \stdClass || (\is_array($messages) && !array_is_list($messages))) {
                foreach (array_keys((array) $messages) as $rule) {
                    self::checkName((string) $rule, $fieldPath);
                }
            }
            $children = $field['properties'] ?? null;
            if (($field['type'] ?? null) === 'group'
                && ($children instanceof \stdClass || (\is_array($children) && !array_is_list($children)))) {
                self::run((array) $children, $fieldPath);
            }
        }
    }

    /**
     * @param list<string> $path the field's declaration path
     * @throws ComposeLoadError when the name is not a registered rule
     */
    private static function checkName(string $rule, array $path): void
    {
        if (!\array_key_exists($rule, Validator::DEFAULT_MESSAGES)) {
            throw new ComposeLoadError('UNKNOWN_RULE', 'Unknown rule: ' . $rule, $path);
        }
    }
}

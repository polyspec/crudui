<?php

declare(strict_types=1);

namespace CRUDUI\Generator;

use CRUDUI\Validator\Expr\Expression;
use CRUDUI\Validator\Expr\TernaryNode;
use CRUDUI\Validator\Expr\Visibility;
use stdClass;

/** Evaluate visibility and appearance with the shared expression engine and visibility rule. */
final class Design
{
    private static function condition(string $expression, stdClass $data, array $path, bool $raw = false): mixed
    {
        try {
            return $raw ? Expression::evaluateValue($expression, $data, $path) : Expression::evaluate($expression, $data, $path);
        } catch (\InvalidArgumentException|\RuntimeException $error) {
            return false;
        }
    }

    private static function conditionMap(stdClass $map, stdClass $data, array $path): mixed
    {
        foreach ($map as $condition => $value) {
            if ($condition !== 'true' && self::condition($condition, $data, $path)) {
                return $value;
            }
        }
        return $map->true ?? null;
    }

    /** Whether a field is visible, by the validator's visibility rule: only a resolved false hides. */
    public static function show(mixed $value, stdClass $data, array $path): bool
    {
        return $value === Missing::Value || Visibility::shown($value, $data, $path);
    }

    /**
     * A boolean flag other than visibility, such as a list column's `sortable`: a missing value
     * is false, a condition map that selects nothing is false and an expression that cannot be
     * evaluated is false.
     */
    public static function flag(mixed $value, stdClass $data, array $path): bool
    {
        if ($value instanceof stdClass) {
            return Value::truthy(self::conditionMap($value, $data, $path));
        }
        if (is_string($value)) {
            return self::condition($value, $data, $path);
        }
        return Value::truthy($value);
    }

    /** Whether a string parses completely as an expression. */
    private static function parses(string $value): bool
    {
        try {
            Expression::parse($value);
            return true;
        } catch (\InvalidArgumentException|\RuntimeException $error) {
            return false;
        }
    }

    /**
     * Resolve appearance text from a literal, expression or condition map: a string is an
     * expression only when it parses completely; any other string is literal text.
     */
    public static function appearance(mixed $value, stdClass $data, array $path): string
    {
        if ($value === Missing::Value || $value === null) {
            return '';
        }
        if ($value instanceof stdClass) {
            $value = self::conditionMap($value, $data, $path);
            return $value === null ? '' : Value::string($value);
        }
        if (is_string($value)) {
            try {
                if (Expression::parse($value) instanceof TernaryNode) {
                    $result = Expression::evaluateValue($value, $data, $path);
                    return $result === null ? '' : Value::string($result);
                }
            } catch (\InvalidArgumentException|\RuntimeException $error) {
            }
            if (Expression::isConditionExpression($value) && !preg_match('/\?[^:]*:/', $value) && self::parses($value)) {
                $result = self::condition($value, $data, $path, true);
                return $result === false || $result === null ? '' : Value::string($result);
            }
            return $value;
        }
        return Value::string($value);
    }

    /** Evaluate the visibility and named appearance nodes for one field. */
    public static function resolve(mixed $design, stdClass $data, array $path): stdClass
    {
        $design = $design instanceof stdClass ? $design : new stdClass();
        $node = static function (mixed $value) use ($data, $path): stdClass {
            return (object) ['class' => self::appearance(Value::get($value, 'class'), $data, $path), 'style' => self::appearance(Value::get($value, 'style'), $data, $path)];
        };
        return (object) ['show' => self::show(Value::get($design, 'show'), $data, $path), 'main' => $node($design), 'label' => $node($design->label ?? null), 'wrapper' => $node($design->wrapper ?? null), 'group' => $node($design->group ?? null), 'prepend' => $node($design->prepend ?? null)];
    }
}

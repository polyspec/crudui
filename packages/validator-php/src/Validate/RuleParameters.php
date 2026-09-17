<?php

declare(strict_types=1);

namespace CRUDUI\Validator\Validate;

use CRUDUI\Validator\Compose\ComposeLoadError;
use CRUDUI\Validator\Expr\Expression;
use CRUDUI\Validator\Expr\GroupNode;
use CRUDUI\Validator\Expr\LiteralNode;
use CRUDUI\Validator\Expr\Node;
use CRUDUI\Validator\Expr\TernaryNode;
use CRUDUI\Validator\Patterns\PatternParameter;
use CRUDUI\Validator\Values\InvalidRuleParameter;
use CRUDUI\Validator\Values\LengthLimit;
use CRUDUI\Validator\Values\Membership;
use CRUDUI\Validator\Values\Numeric;

/**
 * Rule parameter checks. Declared parameters are checked when the specification
 * loads, including every literal a condition map or a ternary can select; a value a
 * ternary takes from the data is checked when it is selected. A failure is a load
 * failure located at the field's declaration path.
 *
 * @internal
 */
final class RuleParameters
{
    /** Rules that receive their parameters unchanged, never as conditions. */
    public const UNCHANGED = ['equalTo', 'notEqual', 'unique', 'enddate', 'accept', 'match', 'pattern', 'in'];

    /**
     * Check a parameter that is used as declared or was selected by a condition.
     * `false` and `null` disable a rule and are not checked.
     *
     * @param list<string> $declarationPath property names from the root, without row keys
     * @throws ComposeLoadError
     */
    public static function check(string $rule, mixed $parameter, array $declarationPath): void
    {
        if ($parameter === false || $parameter === null) {
            return;
        }
        try {
            match ($rule) {
                'minlength', 'maxlength', 'mincount', 'maxcount' => LengthLimit::single($rule, $parameter),
                'rangelength' => LengthLimit::range($parameter),
                'number', 'digits' => Numeric::flag($rule, $parameter),
                'min', 'max' => Numeric::bound($rule, $parameter),
                'range' => Numeric::range($parameter),
                'step' => Numeric::step($parameter),
                'in' => Membership::fromParameter($parameter),
                'match', 'pattern' => PatternParameter::compile($rule, $parameter),
                default => null,
            };
        } catch (InvalidRuleParameter $error) {
            throw new ComposeLoadError($error->getErrorCode(), $error->getMessage(), $declarationPath);
        }
    }

    /**
     * The literal values a declared parameter can resolve to: the parameter itself, the
     * values of a condition map, or the literal branches of a ternary (through nested
     * ternaries and groups).
     *
     * @return list<mixed>
     */
    public static function declaredValues(string $rule, mixed $parameter): array
    {
        if (!self::isConditional($rule, $parameter)) {
            return [$parameter];
        }
        if (!\is_string($parameter)) {
            return array_values((array) $parameter);
        }
        try {
            $node = Expression::parse($parameter);
        } catch (\Throwable) {
            return [];
        }
        return self::branchLiterals($node);
    }

    /**
     * @return list<mixed>
     */
    private static function branchLiterals(Node $node): array
    {
        return match (true) {
            $node instanceof TernaryNode => [
                ...self::branchLiterals($node->trueValue),
                ...self::branchLiterals($node->falseValue),
            ],
            $node instanceof GroupNode => self::branchLiterals($node->expression),
            $node instanceof LiteralNode => [$node->value],
            default => [],
        };
    }

    /**
     * Whether a declared parameter is resolved by a condition when the field is
     * validated: a condition map or a condition or ternary expression of a rule that
     * does not receive its parameter unchanged.
     */
    public static function isConditional(string $rule, mixed $parameter): bool
    {
        if (\in_array($rule, self::UNCHANGED, true)) {
            return false;
        }
        if ($parameter instanceof \stdClass || (\is_array($parameter) && $parameter !== [] && !array_is_list($parameter))) {
            return true;
        }
        if (!\is_string($parameter)) {
            return false;
        }
        if (Expression::isConditionExpression($parameter)) {
            return true;
        }
        try {
            return Expression::parse($parameter) instanceof TernaryNode;
        } catch (\Throwable) {
            return false;
        }
    }
}

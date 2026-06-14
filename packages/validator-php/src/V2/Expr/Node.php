<?php

declare(strict_types=1);

namespace Polyspec\Validator\V2\Expr;

/**
 * Base for every v2 expression AST node (EXPRESSION-GRAMMAR §4).
 *
 * toArray() emits the canonical fixture shape, byte-matching the JS reference
 * field names (Ternary{condition,trueValue,falseValue} / Binary{operator,left,
 * right} / etc.). The JS/Go `position` field is DELIBERATELY ABSENT — Rust holds
 * no position, so the 4-language AST contract excludes it; including it would
 * break cross-language fixture equality.
 *
 * v2-only. Never reuse v1 Polyspec\Validator\ConditionParser (R7 parallel run).
 */
abstract class Node
{
    /** @return array<string, mixed> */
    abstract public function toArray(): array;
}

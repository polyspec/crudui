<?php

declare(strict_types=1);

namespace FormSpec\Validator;

/**
 * Scope in which a field's rules are applied.
 *
 * - Single: a non-multiple field; every rule applies to the value.
 * - ArrayLevel: a multiple field's array as a whole; only array-level
 *   rules (required, unique, mincount, maxcount) apply.
 * - ItemLevel: one entry of a multiple field; array-level rules are
 *   excluded and the remaining rules apply per entry.
 */
enum RuleScope
{
    case Single;
    case ArrayLevel;
    case ItemLevel;

    /**
     * Whether a rule name participates in this scope.
     */
    public function appliesTo(string $ruleName): bool
    {
        $isArrayLevelRule = in_array($ruleName, Validator::ARRAY_LEVEL_RULES, true);

        return match ($this) {
            self::Single => true,
            self::ArrayLevel => $isArrayLevelRule,
            self::ItemLevel => !$isArrayLevelRule,
        };
    }
}

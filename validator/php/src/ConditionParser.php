<?php

declare(strict_types=1);

namespace FormSpec\Validator;

/**
 * Parses and evaluates condition expressions.
 * Supports the same syntax as the JavaScript version.
 *
 * Syntax:
 * - .field              Reference field in current group
 * - ..field             Reference field in parent group
 * - ...field            Reference field in grandparent group
 * - *.field             Wildcard reference in arrays
 *
 * Operators:
 * - ==, !=              Equality
 * - >, >=, <, <=        Comparison
 * - &&, ||              Logical
 * - in, not in          Set membership
 */
class ConditionParser
{
    private PathResolver $pathResolver;

    public function __construct()
    {
        $this->pathResolver = new PathResolver();
    }

    /**
     * Evaluate a condition expression.
     *
     * @param string $expression The condition expression
     * @param string $currentPath The current field path
     * @param array $allData All form data
     * @return bool Whether the condition is met
     */
    public function evaluate(string $expression, string $currentPath, array $allData): bool
    {
        $expression = trim($expression);

        // Handle parenthesized expressions first
        if ($this->startsWithParenthesis($expression)) {
            return $this->evaluateParenthesizedExpression($expression, $currentPath, $allData);
        }

        // Handle logical operators (split by && and ||)
        if ($this->containsLogicalOperator($expression)) {
            return $this->evaluateLogicalExpression($expression, $currentPath, $allData);
        }

        // Handle simple comparison
        return $this->evaluateSimpleExpression($expression, $currentPath, $allData);
    }

    /**
     * Evaluate a ternary expression (condition ? trueValue : falseValue).
     *
     * @param string $expression The ternary expression
     * @param string $currentPath The current field path
     * @param array $allData All form data
     * @return mixed The resulting value
     */
    public function evaluateTernary(string $expression, string $currentPath, array $allData): mixed
    {
        $expression = trim($expression);

        // Parse ternary: condition ? trueValue : falseValue
        // Find the ? and : positions, respecting nesting
        $questionPos = $this->findTernaryOperator($expression, '?');
        if ($questionPos === -1) {
            // Not a ternary, try to evaluate as a regular expression
            return $this->evaluate($expression, $currentPath, $allData);
        }

        $colonPos = $this->findTernaryOperator($expression, ':', $questionPos + 1);
        if ($colonPos === -1) {
            // Malformed ternary
            return null;
        }

        $condition = trim(substr($expression, 0, $questionPos));
        $trueValue = trim(substr($expression, $questionPos + 1, $colonPos - $questionPos - 1));
        $falseValue = trim(substr($expression, $colonPos + 1));

        // Evaluate the condition
        $conditionResult = $this->evaluate($condition, $currentPath, $allData);

        // Return the appropriate value
        $resultExpr = $conditionResult ? $trueValue : $falseValue;

        // Check if result is a nested ternary
        if ($this->containsTernary($resultExpr)) {
            return $this->evaluateTernary($resultExpr, $currentPath, $allData);
        }

        // Parse the value
        return $this->parseValue($resultExpr);
    }

    /**
     * Find the position of a ternary operator (? or :) respecting nesting.
     */
    private function findTernaryOperator(string $expression, string $operator, int $startPos = 0): int
    {
        $depth = 0;
        $inQuote = false;
        $quoteChar = '';
        $ternaryDepth = 0;
        $len = strlen($expression);

        for ($i = $startPos; $i < $len; $i++) {
            $char = $expression[$i];

            // Handle quotes
            if (($char === '"' || $char === "'") && !$inQuote) {
                $inQuote = true;
                $quoteChar = $char;
            } elseif ($char === $quoteChar && $inQuote) {
                $inQuote = false;
                $quoteChar = '';
            }

            if (!$inQuote) {
                // Handle parentheses and brackets
                if ($char === '(' || $char === '[') {
                    $depth++;
                } elseif ($char === ')' || $char === ']') {
                    $depth--;
                }

                // Track nested ternary operators
                if ($char === '?' && $depth === 0) {
                    if ($operator === '?') {
                        return $i;
                    }
                    $ternaryDepth++;
                } elseif ($char === ':' && $depth === 0) {
                    if ($operator === ':') {
                        if ($ternaryDepth === 0) {
                            return $i;
                        }
                        $ternaryDepth--;
                    }
                }
            }
        }

        return -1;
    }

    /**
     * Check if expression contains a ternary operator.
     */
    private function containsTernary(string $expression): bool
    {
        return preg_match('/\?[^:]*:/', $expression) === 1;
    }

    /**
     * Check if expression starts with a parenthesis (grouped expression).
     */
    private function startsWithParenthesis(string $expression): bool
    {
        return str_starts_with($expression, '(') && $this->findMatchingParen($expression, 0) === strlen($expression) - 1;
    }

    /**
     * Find the matching closing parenthesis.
     */
    private function findMatchingParen(string $expression, int $start): int
    {
        $depth = 0;
        $inQuote = false;
        $quoteChar = '';
        $len = strlen($expression);

        for ($i = $start; $i < $len; $i++) {
            $char = $expression[$i];

            // Handle quotes
            if (($char === '"' || $char === "'") && !$inQuote) {
                $inQuote = true;
                $quoteChar = $char;
            } elseif ($char === $quoteChar && $inQuote) {
                $inQuote = false;
                $quoteChar = '';
            }

            if (!$inQuote) {
                if ($char === '(') {
                    $depth++;
                } elseif ($char === ')') {
                    $depth--;
                    if ($depth === 0) {
                        return $i;
                    }
                }
            }
        }

        return -1;
    }

    /**
     * Evaluate a parenthesized expression.
     */
    private function evaluateParenthesizedExpression(string $expression, string $currentPath, array $allData): bool
    {
        // Remove outer parentheses
        $inner = substr($expression, 1, -1);
        return $this->evaluate($inner, $currentPath, $allData);
    }

    /**
     * Check if expression contains logical operators at the top level.
     */
    private function containsLogicalOperator(string $expression): bool
    {
        // Make sure we're not matching inside quoted strings or parentheses
        $depth = 0;
        $inQuote = false;
        $quoteChar = '';
        $len = strlen($expression);

        for ($i = 0; $i < $len; $i++) {
            $char = $expression[$i];

            // Handle quotes
            if (($char === '"' || $char === "'") && !$inQuote) {
                $inQuote = true;
                $quoteChar = $char;
            } elseif ($char === $quoteChar && $inQuote) {
                $inQuote = false;
                $quoteChar = '';
            }

            // Handle parentheses
            if (!$inQuote) {
                if ($char === '(' || $char === '[') {
                    $depth++;
                } elseif ($char === ')' || $char === ']') {
                    $depth--;
                }
            }

            // Check for operators at depth 0
            if (!$inQuote && $depth === 0) {
                if (substr($expression, $i, 2) === '||' || substr($expression, $i, 2) === '&&') {
                    return true;
                }
            }
        }

        return false;
    }

    /**
     * Evaluate an expression with logical operators.
     */
    private function evaluateLogicalExpression(string $expression, string $currentPath, array $allData): bool
    {
        // Handle OR (||) - lower precedence
        $orParts = $this->splitByOperator($expression, '||');
        if (count($orParts) > 1) {
            foreach ($orParts as $part) {
                if ($this->evaluate($part, $currentPath, $allData)) {
                    return true;
                }
            }
            return false;
        }

        // Handle AND (&&) - higher precedence
        $andParts = $this->splitByOperator($expression, '&&');
        if (count($andParts) > 1) {
            foreach ($andParts as $part) {
                if (!$this->evaluate($part, $currentPath, $allData)) {
                    return false;
                }
            }
            return true;
        }

        return $this->evaluateSimpleExpression($expression, $currentPath, $allData);
    }

    /**
     * Split expression by operator, respecting quotes, parentheses, and brackets.
     */
    private function splitByOperator(string $expression, string $operator): array
    {
        $parts = [];
        $current = '';
        $inQuote = false;
        $quoteChar = '';
        $parenDepth = 0;
        $bracketDepth = 0;

        $len = strlen($expression);
        $opLen = strlen($operator);

        for ($i = 0; $i < $len; $i++) {
            $char = $expression[$i];

            // Handle quotes
            if (($char === '"' || $char === "'") && !$inQuote) {
                $inQuote = true;
                $quoteChar = $char;
            } elseif ($char === $quoteChar && $inQuote) {
                $inQuote = false;
                $quoteChar = '';
            }

            // Handle parentheses and brackets
            if (!$inQuote) {
                if ($char === '(') {
                    $parenDepth++;
                } elseif ($char === ')') {
                    $parenDepth--;
                } elseif ($char === '[') {
                    $bracketDepth++;
                } elseif ($char === ']') {
                    $bracketDepth--;
                }
            }

            // Check for operator
            if (!$inQuote && $parenDepth === 0 && $bracketDepth === 0) {
                $substring = substr($expression, $i, $opLen);
                if ($substring === $operator) {
                    $parts[] = trim($current);
                    $current = '';
                    $i += $opLen - 1;
                    continue;
                }
            }

            $current .= $char;
        }

        if (trim($current) !== '') {
            $parts[] = trim($current);
        }

        return $parts;
    }

    /**
     * Evaluate a simple comparison expression.
     */
    private function evaluateSimpleExpression(string $expression, string $currentPath, array $allData): bool
    {
        $expression = trim($expression);

        // Handle parenthesized expressions
        if (str_starts_with($expression, '(')) {
            $closePos = $this->findMatchingParen($expression, 0);
            if ($closePos === strlen($expression) - 1) {
                return $this->evaluate(substr($expression, 1, -1), $currentPath, $allData);
            }
        }

        // Match: path operator value
        // Operators: ==, !=, >=, <=, >, <, in, not in
        // Note: 'in' and 'not in' require word boundaries to avoid matching inside identifiers
        $pattern = '/^(.+?)\s*(not\s+in\b|(?<![a-zA-Z_])in\b|==|!=|>=|<=|>|<)\s*(.+)$/is';

        if (preg_match($pattern, $expression, $matches)) {
            $pathExpr = trim($matches[1]);
            $operator = strtolower(preg_replace('/\s+/', ' ', trim($matches[2])));
            $compareValue = trim($matches[3]);

            // Resolve the field path with wildcard support
            $fieldValue = $this->pathResolver->resolveExpressionWithWildcard($pathExpr, $currentPath, $allData);

            // Parse the compare value
            $compareValue = $this->parseValue($compareValue);

            return $this->compare($fieldValue, $operator, $compareValue);
        }

        // If no operator found, check if expression is just a path (truthy check)
        $value = $this->pathResolver->resolveExpressionWithWildcard($expression, $currentPath, $allData);
        return $this->isTruthy($value);
    }

    /**
     * Parse a value from the expression.
     */
    private function parseValue(string $value): mixed
    {
        $value = trim($value);

        // Handle bracket-enclosed list (e.g., [US, CA, UK])
        if (preg_match('/^\[(.+)\]$/', $value, $matches)) {
            $innerValue = trim($matches[1]);
            $parts = $this->splitValueList($innerValue);
            return array_map(fn($v) => $this->parseValue(trim($v)), $parts);
        }

        // Handle quoted strings
        if (preg_match('/^["\'](.*)["\']\s*$/', $value, $matches)) {
            return $matches[1];
        }

        // Handle comma-separated list (for 'in' operator without brackets)
        if (str_contains($value, ',') && !str_contains($value, '[')) {
            $parts = $this->splitValueList($value);
            return array_map(fn($v) => $this->parseValue(trim($v)), $parts);
        }

        // Handle boolean
        if ($value === 'true') {
            return true;
        }
        if ($value === 'false') {
            return false;
        }

        // Handle null
        if ($value === 'null') {
            return null;
        }

        // Handle numbers
        if (is_numeric($value)) {
            return str_contains($value, '.') ? (float)$value : (int)$value;
        }

        return $value;
    }

    /**
     * Split a comma-separated value list, respecting quotes.
     */
    private function splitValueList(string $value): array
    {
        $parts = [];
        $current = '';
        $inQuote = false;
        $quoteChar = '';
        $len = strlen($value);

        for ($i = 0; $i < $len; $i++) {
            $char = $value[$i];

            if (($char === '"' || $char === "'") && !$inQuote) {
                $inQuote = true;
                $quoteChar = $char;
                $current .= $char;
            } elseif ($char === $quoteChar && $inQuote) {
                $inQuote = false;
                $quoteChar = '';
                $current .= $char;
            } elseif ($char === ',' && !$inQuote) {
                $parts[] = trim($current);
                $current = '';
            } else {
                $current .= $char;
            }
        }

        if (trim($current) !== '') {
            $parts[] = trim($current);
        }

        return $parts;
    }

    /**
     * Compare two values with an operator.
     */
    private function compare(mixed $left, string $operator, mixed $right): bool
    {
        // Normalize values for comparison
        $left = $this->normalizeForComparison($left);
        $right = $this->normalizeForComparison($right);

        switch ($operator) {
            case '==':
                return $this->looseEquals($left, $right);

            case '!=':
                return !$this->looseEquals($left, $right);

            case '>':
                return $this->toNumber($left) > $this->toNumber($right);

            case '>=':
                return $this->toNumber($left) >= $this->toNumber($right);

            case '<':
                return $this->toNumber($left) < $this->toNumber($right);

            case '<=':
                return $this->toNumber($left) <= $this->toNumber($right);

            case 'in':
                $haystack = is_array($right) ? $right : [$right];
                return $this->inArray($left, $haystack);

            case 'not in':
                $haystack = is_array($right) ? $right : [$right];
                return !$this->inArray($left, $haystack);

            default:
                return false;
        }
    }

    /**
     * Normalize a value for comparison.
     */
    private function normalizeForComparison(mixed $value): mixed
    {
        if (is_string($value)) {
            return trim($value);
        }
        return $value;
    }

    /**
     * Loose equality comparison (similar to JavaScript ==).
     */
    private function looseEquals(mixed $left, mixed $right): bool
    {
        // Handle null comparison
        if ($left === null || $right === null) {
            return $left === $right;
        }

        // Handle arrays (should not be compared as strings)
        if (is_array($left) || is_array($right)) {
            if (is_array($left) && is_array($right)) {
                return $left === $right;
            }
            return false;
        }

        // Convert to strings for comparison (like JavaScript)
        $leftStr = is_bool($left) ? ($left ? 'true' : 'false') : (string)$left;
        $rightStr = is_bool($right) ? ($right ? 'true' : 'false') : (string)$right;

        // Try numeric comparison if both are numeric
        if (is_numeric($leftStr) && is_numeric($rightStr)) {
            return (float)$leftStr === (float)$rightStr;
        }

        return $leftStr === $rightStr;
    }

    /**
     * Check if value is in array (with loose comparison).
     */
    private function inArray(mixed $needle, array $haystack): bool
    {
        foreach ($haystack as $item) {
            if ($this->looseEquals($needle, $item)) {
                return true;
            }
        }
        return false;
    }

    /**
     * Convert to number for comparison.
     */
    private function toNumber(mixed $value): float
    {
        if (is_numeric($value)) {
            return (float)$value;
        }
        if (is_bool($value)) {
            return $value ? 1 : 0;
        }
        return 0;
    }

    /**
     * Check if a value is truthy (like JavaScript).
     */
    private function isTruthy(mixed $value): bool
    {
        if ($value === null) {
            return false;
        }
        if ($value === false) {
            return false;
        }
        if ($value === 0 || $value === '0') {
            return false;
        }
        if ($value === '') {
            return false;
        }
        if (is_array($value) && count($value) === 0) {
            return false;
        }
        return true;
    }
}

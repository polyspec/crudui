<?php

declare(strict_types=1);

namespace Polyspec\Validator\V2\Expr;

/**
 * Public facade for the v2 expression engine: string → tokens → AST → value.
 *
 * The pipeline is strictly staged (GRAMMAR §0): never split a string to evaluate,
 * never eval. parse() caches one AST per expression string. evaluate() returns a
 * boolean condition result; evaluateValue() returns a ternary's branch value and
 * the boolean condition result for everything else (JS evaluateExpressionValue
 * parity — the shared 4-language fixture is generated from the JS engine).
 */
final class Expression
{
    /** @var array<string, Node> parsed-AST cache keyed by expression text */
    private static array $cache = [];

    /**
     * Tokenize an expression. WHITESPACE excluded; ends with EOF.
     *
     * @return list<Token>
     */
    public static function tokenize(string $expression): array
    {
        return (new Lexer($expression))->tokenize();
    }

    /**
     * Parse an expression into its AST (cached).
     */
    public static function parse(string $expression): Node
    {
        if (isset(self::$cache[$expression])) {
            return self::$cache[$expression];
        }

        $tokens = self::tokenize($expression);
        $ast = (new Parser($tokens))->parse();

        return self::$cache[$expression] = $ast;
    }

    /**
     * Evaluate to a truthy boolean (show/display call site).
     *
     * @param array<string, mixed> $formData
     * @param list<string>         $currentPath
     */
    public static function evaluate(string $expression, array $formData, array $currentPath = []): bool
    {
        return (new Evaluator($formData, $currentPath))->evaluate(self::parse($expression));
    }

    /**
     * Evaluate to the raw value (class/style/number/null call site).
     *
     * @param array<string, mixed> $formData
     * @param list<string>         $currentPath
     */
    public static function evaluateValue(string $expression, array $formData, array $currentPath = []): mixed
    {
        return (new Evaluator($formData, $currentPath))->evaluateValue(self::parse($expression));
    }

    /**
     * Clear the parsed-AST cache.
     */
    public static function clearCache(): void
    {
        self::$cache = [];
    }
}

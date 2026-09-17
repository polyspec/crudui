<?php

declare(strict_types=1);

namespace CRUDUI\Validator\Validate;

use CRUDUI\Validator\Rules\Required;
use CRUDUI\Validator\Rules\Email;
use CRUDUI\Validator\Rules\MinLength;
use CRUDUI\Validator\Rules\MaxLength;
use CRUDUI\Validator\Rules\Min;
use CRUDUI\Validator\Rules\Max;
use CRUDUI\Validator\Rules\Pattern;
use CRUDUI\Validator\Rules\In;
use CRUDUI\Validator\Rules\Range;
use CRUDUI\Validator\Rules\RangeLength;
use CRUDUI\Validator\Rules\Number;
use CRUDUI\Validator\Rules\Digits;
use CRUDUI\Validator\Rules\EqualTo;
use CRUDUI\Validator\Rules\NotEqual;
use CRUDUI\Validator\Rules\Date;
use CRUDUI\Validator\Rules\DateISO;
use CRUDUI\Validator\Rules\EndDate;
use CRUDUI\Validator\Rules\Url;
use CRUDUI\Validator\Rules\Accept;
use CRUDUI\Validator\Rules\MinCount;
use CRUDUI\Validator\Rules\MaxCount;
use CRUDUI\Validator\Rules\Step;
use CRUDUI\Validator\Rules\RuleInterface;
use CRUDUI\Validator\Expr\ConditionMap;
use CRUDUI\Validator\Expr\Expression;
use CRUDUI\Validator\Values\EmptyValue;

/**
 * CRUDUI form validator — SPEC §2 G5→§3→§2 G1. Port of
 * validator-ts/src/validate/validator.ts (Validator), function-for-function.
 *
 * This is the THIRD pass of the CRUDUI pipeline. It consumes a CRUDUI field model (the
 * validate/design/behavior/options role slots) AFTER the compose pass has
 * expanded $ref/$patch into a single spec (Validate::run runs compose first).
 * It does NOT re-implement the rule semantics or the expression engine — it CALLS
 * the rule instances (CRUDUI\Validator\Rules) and the CRUDUI expression engine
 * (CRUDUI\Validator\Expr). The logic here is:
 *   (a) reading the `validate` slot,
 *   (b) evaluating a rule value that is an expression OR a condition map (G1 —
 *       the condition is the value's expression, never a separate if/when key),
 *   (c) omitting display_switch/display_target visibility conditions (G1
 *       forbids those meta keys; visibility-driven requiredness is
 *       required:'<expr>').
 *
 * The rule instances return a bool and skip nothing on empty values, so this engine
 * applies the empty-value skip of the validation rules centrally and builds the error
 * message itself (DEFAULT_MESSAGES + per-field `messages` override). Declared rule
 * parameters, including every literal a condition can select, are checked when the
 * validator is constructed (DeclarationCheck); a value a ternary takes from the data
 * is checked when it is selected, before the empty-value skip. Both raise ComposeLoadError at the field's declaration path.
 */
final class Validator
{
    /**
     * Rules that apply to the whole array of a `multiple` field (the rest apply
     * to each element). VALIDATION-RULES §array-level.
     */
    private const ARRAY_LEVEL_RULES = ['required', 'unique', 'mincount', 'maxcount'];

    /**
     * Default error messages per rule (identical in every runtime). The
     * `pattern` and `match` aliases share one message. {0}/{1} are replaced from
     * the (possibly array) effective param.
     */
    private const DEFAULT_MESSAGES = [
        'required' => 'This field is required.',
        'email' => 'Please enter a valid email address.',
        'minlength' => 'Please enter at least {0} characters.',
        'maxlength' => 'Please enter no more than {0} characters.',
        'min' => 'Please enter a value greater than or equal to {0}.',
        'max' => 'Please enter a value less than or equal to {0}.',
        'match' => 'Please enter a valid format.',
        'pattern' => 'Please enter a valid format.',
        'unique' => 'Values must be unique.',
        'in' => 'Please select a valid option.',
        'range' => 'Please enter a value between {0} and {1}.',
        'rangelength' => 'Please enter a value between {0} and {1} characters.',
        'number' => 'Please enter a valid number.',
        'digits' => 'Please enter only digits.',
        'equalTo' => 'Please enter the same value again.',
        'notEqual' => 'Please enter a different value.',
        'date' => 'Please enter a valid date.',
        'dateISO' => 'Please enter a valid date in ISO format (YYYY-MM-DD).',
        'enddate' => 'End date must be after the start date.',
        'url' => 'Please enter a valid URL.',
        'accept' => 'Please upload a file with a valid format.',
        'mincount' => 'Please select at least {0} items.',
        'maxcount' => 'Please select no more than {0} items.',
        'step' => 'Please enter a value that is a multiple of {0}.',
    ];

    /** @var array<string, RuleInterface> rule instances by rule name */
    private array $rules;

    /** @var array<string, mixed> the composed root field map (composition-free) */
    private readonly array $properties;

    /**
     * @param array<string, mixed> $composedSpec a composed CRUDUI root spec — a group
     *        with `properties` (already free of $ref/$patch and forbidden keys).
     * @throws \CRUDUI\Validator\Compose\ComposeLoadError when a declared rule parameter is invalid
     */
    public function __construct(array $composedSpec)
    {
        $props = $composedSpec['properties'] ?? null;
        $this->properties = (is_array($props) && !array_is_list($props)) ? $props : [];
        DeclarationCheck::run($this->properties);
        $this->registerRules();
    }

    /**
     * Validate `data` against the composed CRUDUI spec.
     *
     * @param array<string, mixed> $data
     */
    public function validate(array $data): ValidationResult
    {
        $errors = [];
        $this->validateProperties($this->properties, $data, [], [], $data, $errors);

        return new ValidationResult(count($errors) === 0, array_values($errors));
    }

    /** Register the rule instances; `pattern` and `match` share one implementation. */
    private function registerRules(): void
    {
        $this->rules = [
            'required' => new Required(),
            'email' => new Email(),
            'minlength' => new MinLength(),
            'maxlength' => new MaxLength(),
            'min' => new Min(),
            'max' => new Max(),
            'match' => new Pattern('match'),
            'pattern' => new Pattern('pattern'),
            'in' => new In(),
            'range' => new Range(),
            'rangelength' => new RangeLength(),
            'number' => new Number(),
            'digits' => new Digits(),
            'equalTo' => new EqualTo(),
            'notEqual' => new NotEqual(),
            'date' => new Date(),
            'dateISO' => new DateISO(),
            'enddate' => new EndDate(),
            'url' => new Url(),
            'accept' => new Accept(),
            'mincount' => new MinCount(),
            'maxcount' => new MaxCount(),
            'step' => new Step(),
        ];
    }

    // =========================================================================
    // Field traversal (SPEC §3).
    // =========================================================================

    /**
     * @param array<string, mixed> $properties
     * @param array<string, mixed> $data
     * @param list<string>         $currentPath
     * @param list<string>         $declarationPath $currentPath without row keys
     * @param array<string, mixed> $allData
     * @param array<int, array<string, mixed>> $errors
     */
    private function validateProperties(
        array $properties,
        array $data,
        array $currentPath,
        array $declarationPath,
        array $allData,
        array &$errors,
    ): void {
        foreach ($properties as $propertyKey => $field) {
            if (!is_array($field) && !$field instanceof \stdClass) {
                continue;
            }

            $field = (array) $field;
            $fieldName = (string) $propertyKey;
            $isMultiple = $this->isMultiple($field);
            $fieldPath = [...$currentPath, $fieldName];
            $fieldDeclaration = [...$declarationPath, $fieldName];
            $present = array_key_exists($fieldName, $data);
            $fieldValue = $present ? $data[$fieldName] : null;

            // No display_switch or display_target condition exists (G1: those meta keys
            // do not exist in CRUDUI; visibility-conditioned requiredness is
            // required:'<expr>').

            $childProps = $this->childProperties($field);

            if ($isMultiple && $present && !self::isObject($fieldValue)) {
                throw new FormInputError('Repeated data must be a keyed object: ' . implode('.', $fieldPath));
            }

            if (($field['type'] ?? null) === 'group' && $childProps !== null) {
                if ($isMultiple) {
                    if ($present) {
                        // Keyed rows use sorted-key traversal so the first reported
                        // error is identical in every validation implementation.
                        $rows = (array) $fieldValue;
                        $keys = array_map('strval', array_keys($rows));
                        sort($keys, SORT_STRING);
                        foreach ($keys as $key) {
                            $row = $rows[$key];
                            $rowPath = [...$fieldPath, $key];
                            if (!self::isObject($row)) {
                                throw new FormInputError('Group data must be an object: ' . implode('.', $rowPath));
                            }
                            $this->validateProperties($childProps, (array) $row, $rowPath, $fieldDeclaration, $allData, $errors);
                        }
                        $this->validateFieldRules($field, $fieldValue, $fieldPath, $fieldDeclaration, $allData, $errors);
                    }
                } else {
                    if ($present && !self::isObject($fieldValue)) {
                        throw new FormInputError('Group data must be an object: ' . implode('.', $fieldPath));
                    }
                    $this->validateProperties($childProps, $present ? (array) $fieldValue : [], $fieldPath, $fieldDeclaration, $allData, $errors);
                    $this->validateFieldRules($field, $fieldValue, $fieldPath, $fieldDeclaration, $allData, $errors);
                }
            } elseif ($isMultiple && $present) {
                // Repeated scalar field: collection rules on the keyed object, the
                // rest on each row value.
                $this->validateMultipleFieldRules($field, $fieldValue, $fieldPath, $fieldDeclaration, $allData, $errors);
            } else {
                $this->validateFieldRules($field, $fieldValue, $fieldPath, $fieldDeclaration, $allData, $errors);
            }
        }
    }

    /** A JSON object value: stdClass or a non-empty associative array. */
    private static function isObject(mixed $value): bool
    {
        return $value instanceof \stdClass || (is_array($value) && $value !== [] && !array_is_list($value));
    }

    /** Whether a CRUDUI field repeats (multiple:true or multiple:{ … }). */
    private function isMultiple(array $field): bool
    {
        $m = $field['multiple'] ?? null;
        return $m === true || $m instanceof \stdClass || (is_array($m) && !array_is_list($m));
    }

    /**
     * The child field map of a group (composed, plain object), or null.
     *
     * @return array<string, mixed>|null
     */
    private function childProperties(array $field): ?array
    {
        $props = $field['properties'] ?? null;
        if ($props instanceof \stdClass || (is_array($props) && !array_is_list($props))) {
            return (array) $props;
        }
        return null;
    }

    // =========================================================================
    // validate-slot evaluation (SPEC §3 slots.validate).
    // =========================================================================

    /**
     * Collection rules and per-row rules for a repeated scalar field.
     *
     * @param array<string, mixed>|\stdClass $values keyed rows
     * @param list<string> $fieldPath
     * @param list<string> $declarationPath
     * @param array<string, mixed> $allData
     * @param array<int, array<string, mixed>> $errors
     */
    private function validateMultipleFieldRules(
        array $field,
        array|\stdClass $values,
        array $fieldPath,
        array $declarationPath,
        array $allData,
        array &$errors,
    ): void {
        $rules = $this->normalizeValidateSlot($field['validate'] ?? null);
        $messages = $this->fieldMessages($field);

        // 1. Array-level rules in declaration order; first error wins for field.
        if ($rules !== null) {
            foreach ($rules as $ruleName => $ruleValue) {
                if (!in_array($ruleName, self::ARRAY_LEVEL_RULES, true)) {
                    continue;
                }
                $error = $this->runRule($ruleName, $ruleValue, $values, $fieldPath, $declarationPath, $messages, $allData);
                if ($error !== null) {
                    $errors[$this->pathKey($fieldPath)] = $this->makeError($fieldPath, $ruleName, $error, $values);
                    return;
                }
            }
        }

        // 2. Row rules in sorted row-key order (the cross-runtime error-order contract).
        $values = (array) $values;
        ksort($values, SORT_STRING);
        foreach ($values as $i => $value) {
            $this->validateElementRules($field, $value, [...$fieldPath, (string) $i], $declarationPath, $allData, $errors);
        }
    }

    /**
     * Element-level rules for one element of a `multiple` field (no array-level).
     *
     * @param list<string> $itemPath
     * @param list<string> $declarationPath
     * @param array<string, mixed> $allData
     * @param array<int, array<string, mixed>> $errors
     */
    private function validateElementRules(
        array $field,
        mixed $value,
        array $itemPath,
        array $declarationPath,
        array $allData,
        array &$errors,
    ): void {
        $messages = $this->fieldMessages($field);
        $rules = $this->normalizeValidateSlot($field['validate'] ?? null);

        if ($this->runImplicitNumber($field, $rules, $value, $itemPath, $declarationPath, $messages, $allData, $errors)) {
            return;
        }
        if ($rules === null) {
            return;
        }
        foreach ($rules as $ruleName => $ruleValue) {
            if (in_array($ruleName, self::ARRAY_LEVEL_RULES, true)) {
                continue;
            }
            $error = $this->runRule($ruleName, $ruleValue, $value, $itemPath, $declarationPath, $messages, $allData);
            if ($error !== null) {
                $errors[$this->pathKey($itemPath)] = $this->makeError($itemPath, $ruleName, $error, $value);
                break;
            }
        }
    }

    /**
     * All rules for a single (scalar or group-as-whole) field.
     *
     * @param list<string> $fieldPath
     * @param list<string> $declarationPath
     * @param array<string, mixed> $allData
     * @param array<int, array<string, mixed>> $errors
     */
    private function validateFieldRules(
        array $field,
        mixed $value,
        array $fieldPath,
        array $declarationPath,
        array $allData,
        array &$errors,
    ): void {
        $messages = $this->fieldMessages($field);
        $rules = $this->normalizeValidateSlot($field['validate'] ?? null);

        if ($this->runImplicitNumber($field, $rules, $value, $fieldPath, $declarationPath, $messages, $allData, $errors)) {
            return;
        }
        if ($rules === null) {
            return;
        }
        foreach ($rules as $ruleName => $ruleValue) {
            $error = $this->runRule($ruleName, $ruleValue, $value, $fieldPath, $declarationPath, $messages, $allData);
            if ($error !== null) {
                $errors[$this->pathKey($fieldPath)] = $this->makeError($fieldPath, $ruleName, $error, $value);
                break;
            }
        }
    }

    /**
     * `type:number` runs an implicit `number` rule before everything else when no
     * explicit `number` rule is declared (VALIDATION-RULES §2 — reported as rule
     * `number`). Returns true when it pushed an error (caller stops the field).
     *
     * @param array<string, mixed>|null $rules
     * @param list<string> $path
     * @param list<string> $declarationPath
     * @param array<string, string>|null $messages
     * @param array<string, mixed> $allData
     * @param array<int, array<string, mixed>> $errors
     */
    private function runImplicitNumber(
        array $field,
        ?array $rules,
        mixed $value,
        array $path,
        array $declarationPath,
        ?array $messages,
        array $allData,
        array &$errors,
    ): bool {
        if (($field['type'] ?? null) !== 'number') {
            return false;
        }
        if ($rules !== null && array_key_exists('number', $rules)) {
            return false;
        }
        $error = $this->runRule('number', true, $value, $path, $declarationPath, $messages, $allData);
        if ($error !== null) {
            $errors[$this->pathKey($path)] = $this->makeError($path, 'number', $error, $value);
            return true;
        }
        return false;
    }

    // =========================================================================
    // Conditional rule value (G1) — expression / condition map → effective param.
    // =========================================================================

    /**
     * Run one rule: evaluate its (possibly conditional) value to an effective
     * param, check a selected param, apply the central empty-skip, then call the
     * rule instance and build the message. Returns the error message or null.
     *
     * @param list<string> $path
     * @param list<string> $declarationPath
     * @param array<string, string>|null $messages
     * @param array<string, mixed> $allData
     * @throws \CRUDUI\Validator\Compose\ComposeLoadError when a selected param is invalid
     */
    private function runRule(
        string $ruleName,
        mixed $ruleValue,
        mixed $value,
        array $path,
        array $declarationPath,
        ?array $messages,
        array $allData,
    ): ?string {
        $effectiveParam = $this->resolveRuleValue($ruleName, $ruleValue, $path, $allData);

        // A false/null effective param disables the rule (VALIDATION-RULES §3).
        if ($effectiveParam === false || $effectiveParam === null) {
            return null;
        }

        // A param a condition selected is checked when selected, before the
        // empty-value skip: literals were already checked at construction, so only a
        // value taken from the data can fail here.
        if (RuleParameters::isConditional($ruleName, $ruleValue)) {
            RuleParameters::check($ruleName, $effectiveParam, $declarationPath);
        }

        // Central empty-skip. The rule instances do not skip empty values
        // themselves. required always fires; mincount/maxcount on an array fire on
        // the empty array too.
        if ($ruleName !== 'required' && EmptyValue::is($value)) {
            $isCountRuleOnArray = (is_array($value) || $value instanceof \stdClass)
                && in_array($ruleName, ['mincount', 'maxcount'], true);
            if (!$isCountRuleOnArray) {
                return null;
            }
        }

        // unique with a filter/field-reference param needs the CRUDUI expression
        // engine and the array path form. Run the CRUDUI native unique here (JS rules/unique parity).
        if ($ruleName === 'unique') {
            $ok = $this->validateUnique($value, $effectiveParam, $path, $allData);
            return $ok ? null : $this->buildMessage('unique', $effectiveParam, $messages);
        }

        $rule = $this->rules[$ruleName] ?? null;
        if ($rule === null) {
            // Unregistered rule: no error (VALIDATION-RULES §4).
            return null;
        }

        $ok = $rule->validate($value, $effectiveParam, $allData, $this->pathToString($path));
        if ($ok) {
            return null;
        }

        return $this->buildMessage($ruleName, $effectiveParam, $messages);
    }

    /**
     * Resolve a rule value to the effective param (G1).
     *
     * The value is Evaluated<V> = literal | Expression(string) | ConditionMap.
     *   - Path-reference / literal-param / regex rules keep their string param
     *     verbatim (SPEC §10) — never evaluated as a condition.
     *   - A ConditionMap (plain object whose keys are expressions) is evaluated in
     *     declaration order; first truthy key's value is the param; else `true`
     *     key; else null (disabled).
     *   - A string is evaluated as a ternary (value-returning branch) or a plain
     *     condition expression.
     *   - Anything else is a literal param.
     *
     * @param list<string> $path
     * @param array<string, mixed> $allData
     */
    private function resolveRuleValue(
        string $ruleName,
        mixed $ruleValue,
        array $path,
        array $allData,
    ): mixed {
        // Verbatim-param rules: never evaluate (field reference / literal / regex /
        // membership set). A membership param object is a value→label map (G3),
        // not a condition map, so it is preserved verbatim for the rule's flatten.
        if (in_array($ruleName, RuleParameters::UNCHANGED, true)) {
            return $ruleValue;
        }

        // ConditionMap: a plain object of expression→value, declaration-ordered.
        if ($ruleValue instanceof \stdClass || (is_array($ruleValue) && !array_is_list($ruleValue) && $ruleValue !== [])) {
            return ConditionMap::resolve($ruleValue, $allData, $path);
        }

        // String: ternary value-return or plain condition.
        if (is_string($ruleValue)) {
            $ternary = $this->tryEvaluateTernary($ruleValue, $path, $allData);
            if ($ternary['handled']) {
                return $ternary['value'];
            }
            if ($this->isConditionExpression($ruleValue) && preg_match('/\?[^:]*:/', $ruleValue) !== 1) {
                return $this->evaluateExpressionValue($ruleValue, $path, $allData);
            }
        }

        // Literal param (number, boolean, array such as rangelength/range).
        return $ruleValue;
    }

    /**
     * Evaluate a complete ternary AST; other strings remain literal parameters.
     *
     * @param list<string> $path
     * @param array<string, mixed> $allData
     * @return array{handled: bool, value?: mixed}
     */
    private function tryEvaluateTernary(string $expression, array $path, array $allData): array
    {
        try {
            $node = Expression::parse($expression);
            if (!$node instanceof \CRUDUI\Validator\Expr\TernaryNode) {
                return ['handled' => false];
            }
            return ['handled' => true, 'value' => Expression::evaluateValue($expression, $allData, $path)];
        } catch (\Throwable) {
            return ['handled' => false];
        }
    }

    /** @param list<string> $path @param array<string, mixed> $allData */
    private function evaluateCondition(string $expression, array $path, array $allData): bool
    {
        try {
            return Expression::evaluate($expression, $allData, $path);
        } catch (\Throwable) {
            return false;
        }
    }

    /** @param list<string> $path @param array<string, mixed> $allData */
    private function evaluateExpressionValue(string $expression, array $path, array $allData): mixed
    {
        try {
            return Expression::evaluateValue($expression, $allData, $path);
        } catch (\Throwable) {
            return false;
        }
    }

    // =========================================================================
    // unique (CRUDUI native; JS rules/unique parity — filter condition + paths).
    // =========================================================================

    /**
     * Unique rule (two modes). A string param that is a condition expression acts
     * as a per-item filter (only items passing the condition participate); a
     * non-condition string param is a field name within array items.
     *
     * @param list<string> $pathSegments
     * @param array<string, mixed> $allData
     */
    private function validateUnique(
        mixed $value,
        mixed $ruleParam,
        array $pathSegments,
        array $allData,
    ): bool {
        if ($ruleParam === false || $ruleParam === null) {
            return true;
        }

        $isFilterCondition = is_string($ruleParam) && $this->isConditionExpression($ruleParam);

        if (is_array($value) || $value instanceof \stdClass) {
            // Array-level: the field value is the array itself.
            $valuesToCheck = [];
            if ($isFilterCondition) {
                foreach ($value as $i => $element) {
                    $itemPath = [...$pathSegments, (string) $i];
                    if (!$this->itemPassesCondition($ruleParam, $itemPath, $allData)) {
                        continue;
                    }
                    if (!EmptyValue::is($element)) {
                        $valuesToCheck[] = $element;
                    }
                }
            } elseif (is_string($ruleParam)) {
                foreach ($value as $item) {
                    if (is_array($item) || $item instanceof \stdClass) {
                        $fv = ((array) $item)[$ruleParam] ?? null;
                        if (!EmptyValue::is($fv)) {
                            $valuesToCheck[] = $fv;
                        }
                    }
                }
            } else {
                foreach ($value as $v) {
                    if (!EmptyValue::is($v)) {
                        $valuesToCheck[] = $v;
                    }
                }
            }

            if (count($valuesToCheck) === 0) {
                return true;
            }
            return $this->areAllUnique($valuesToCheck);
        }

        // Item-level: scalar field inside a repeated group.
        // Parent layout: <containerPath>.<itemKey>.<fieldName>.
        if (count($pathSegments) < 2) {
            return true;
        }
        $fieldName = $pathSegments[count($pathSegments) - 1];
        $itemKey = $pathSegments[count($pathSegments) - 2];
        $containerPath = array_slice($pathSegments, 0, -2);
        $container = $this->getValueByPath($allData, $containerPath);

        // Ordered (key, item) entries for array or object containers.
        $entries = [];
        if (is_array($container) && array_is_list($container)) {
            if (preg_match('/^\d+$/', $itemKey) !== 1) {
                return true;
            }
            foreach ($container as $i => $item) {
                $entries[] = [(string) $i, $item];
            }
        } elseif (is_array($container) || $container instanceof \stdClass) {
            foreach ($container as $k => $item) {
                $entries[] = [(string) $k, $item];
            }
        } else {
            return true;
        }

        // Empty values never count as duplicates.
        if (EmptyValue::is($value)) {
            return true;
        }

        // A filter condition that excludes the current item drops it entirely.
        if ($isFilterCondition && !$this->itemPassesCondition($ruleParam, $pathSegments, $allData)) {
            return true;
        }

        $currentKey = $this->comparisonKey($value);
        foreach ($entries as [$key, $item]) {
            if ($key === $itemKey) {
                // Only earlier siblings (so the error lands on the later dup).
                break;
            }
            if (!is_array($item) && !$item instanceof \stdClass) {
                continue;
            }
            if ($isFilterCondition) {
                $siblingFieldPath = [...$containerPath, $key, $fieldName];
                if (!$this->itemPassesCondition($ruleParam, $siblingFieldPath, $allData)) {
                    continue;
                }
            }
            $siblingValue = ((array) $item)[$fieldName] ?? null;
            if (EmptyValue::is($siblingValue)) {
                continue;
            }
            if ($this->comparisonKey($siblingValue) === $currentKey) {
                return false;
            }
        }

        return true;
    }

    /**
     * Evaluate a filter condition for an item, as if validating the same field on
     * that item (JS itemPassesCondition).
     *
     * @param list<string> $itemFieldPath
     * @param array<string, mixed> $allData
     */
    private function itemPassesCondition(string $condition, array $itemFieldPath, array $allData): bool
    {
        try {
            return Expression::evaluate($condition, $allData, $itemFieldPath);
        } catch (\Throwable) {
            return false;
        }
    }

    /** @param list<mixed> $values */
    private function areAllUnique(array $values): bool
    {
        $seen = [];
        foreach ($values as $value) {
            $key = $this->comparisonKey($value);
            if (in_array($key, $seen, true)) {
                return false;
            }
            $seen[] = $key;
        }
        return true;
    }

    /** Build a comparison key: objects/arrays compare by JSON, scalars by value. */
    private function comparisonKey(mixed $value): mixed
    {
        if (is_array($value) || $value instanceof \stdClass) {
            return json_encode($value);
        }
        return $value;
    }

    /**
     * Whether a string looks like a condition expression (JS isConditionExpression):
     * starts with `.`, `identifier.`, contains a comparison/logical/in operator,
     * or contains a ternary `?...:`.
     */
    private function isConditionExpression(string $value): bool
    {
        return Expression::isConditionExpression($value);
    }

    // =========================================================================
    // Slot / message / value helpers.
    // =========================================================================

    /**
     * Normalize a polymorphic `validate` slot to a rule map. false/true/null → no
     * rules; a list/empty array → no rules; an assoc array → the rule map itself.
     *
     * @return array<string, mixed>|null
     */
    private function normalizeValidateSlot(mixed $slot): ?array
    {
        if ($slot === false || $slot === true || $slot === null) {
            return null;
        }
        if ($slot instanceof \stdClass || (is_array($slot) && !array_is_list($slot) && $slot !== [])) {
            return (array) $slot;
        }
        return null;
    }

    /**
     * Read the per-field custom messages (the `messages` map).
     *
     * @return array<string, string>|null
     */
    private function fieldMessages(array $field): ?array
    {
        $m = $field['messages'] ?? null;
        if ($m instanceof \stdClass || (is_array($m) && !array_is_list($m))) {
            /** @var array<string, string> $m */
            return (array) $m;
        }
        return null;
    }

    /**
     * Build the display message: per-field override → DEFAULT_MESSAGES → fallback,
     * with {0}/{1} replaced from the (possibly array) effective param.
     *
     * @param array<string, mixed>|null $messages
     */
    private function buildMessage(string $ruleName, mixed $param, ?array $messages): string
    {
        $message = $messages[$ruleName]
            ?? self::DEFAULT_MESSAGES[$ruleName]
            ?? 'Validation failed.';

        if ($message instanceof \stdClass) $message = (array) $message;
        if (is_array($message)) {
            $message = $message['en'] ?? $message['ko'] ?? (reset($message) ?: 'Validation failed.');
        }

        if (is_array($param)) {
            foreach ($param as $index => $paramValue) {
                $message = str_replace('{' . $index . '}', $this->stringify($paramValue), $message);
            }
        } else {
            $message = str_replace('{0}', $this->stringify($param), $message);
        }

        return $message;
    }

    /** Scalar stringification for {0}/{1} placeholders (PHP (string) parity). */
    private function stringify(mixed $value): string
    {
        if ($value === true) {
            return '1';
        }
        if ($value === false || $value === null) {
            return '';
        }
        if (is_array($value) || $value instanceof \stdClass) {
            return '';
        }
        return (string) $value;
    }

    /**
     * Assemble an error record matching the shared fixture shape.
     *
     * @param list<string> $path
     * @return array<string, mixed>
     */
    private function makeError(array $path, string $rule, string $message, mixed $value): array
    {
        return [
            'path' => $this->pathToString($path),
            'field' => $this->getFieldName($path),
            'rule' => $rule,
            'message' => $message,
            'value' => $value,
        ];
    }

    /** @param list<string> $path */
    private function pathToString(array $path): string
    {
        return implode('.', $path);
    }

    /** @param list<string> $path */
    private function getFieldName(array $path): string
    {
        return count($path) > 0 ? $path[count($path) - 1] : '';
    }

    /**
     * A per-field key so the first error per field wins (later errors on the same
     * path are ignored). The dot-path is unique per field instance.
     *
     * @param list<string> $path
     */
    private function pathKey(array $path): string
    {
        return $this->pathToString($path);
    }

    /**
     * Read the value at a concrete path (JS getValueByPath). Missing → null.
     *
     * @param array<string, mixed> $data
     * @param list<string> $path
     */
    private function getValueByPath(array $data, array $path): mixed
    {
        $current = $data;
        foreach ($path as $segment) {
            if ((!is_array($current) && !$current instanceof \stdClass) || !array_key_exists($segment, (array) $current)) {
                return null;
            }
            $current = ((array) $current)[$segment];
        }
        return $current;
    }
}

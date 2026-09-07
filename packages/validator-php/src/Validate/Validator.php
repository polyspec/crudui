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

/**
 * CRUDUI form validator — schema §2 G5→§3→§2 G1. Port of validator-ts
 * src/validate/validator.ts (Validator), function-for-function.
 *
 * This is the THIRD pass of the CRUDUI pipeline. It consumes a CRUDUI field model (the
 * validate/design/behavior/options role slots) AFTER the compose pass has
 * expanded $ref/$patch into a single spec (Validate::run runs compose first).
 * It does NOT touch the legacy Validator (R7 parallel run) and it does NOT
 * re-implement the rule semantics or the expression engine — it CALLS the
 * existing legacy rule instances (CRUDUI\Validator\Rules) and the existing CRUDUI
 * expression engine (CRUDUI\Validator\Expr). The only CRUDUI-new logic here is:
 *   (a) reading the `validate` slot instead of the legacy `rules` key,
 *   (b) evaluating a rule value that is an expression OR a condition map (G1 —
 *       the condition is the value's expression, never a separate if/when key),
 *   (c) dropping the legacy display_switch/display_target visibility gates (G1
 *       forbids those meta keys; visibility-driven requiredness is
 *       required:'<expr>').
 *
 * The legacy rule instances return a bool and skip nothing on empty values (the legacy
 * Validator centralizes the empty-skip in applyRule), so this engine reproduces
 * that central empty-skip and builds the error message itself (DEFAULT_MESSAGES
 * + per-field `messages` override) exactly as the legacy Validator does. The shared
 * 4-language fixture (tests/fixtures/validate/cases.json) carries those default
 * messages, so the JS reference output is matched bit-for-bit.
 */
final class Validator
{
    /**
     * Rules that apply to the whole array of a `multiple` field (the rest apply
     * to each element). VALIDATION-RULES §array-level.
     */
    private const ARRAY_LEVEL_RULES = ['required', 'unique', 'mincount', 'maxcount'];

    /**
     * Rules whose param is a field reference (relative path / filter condition) —
     * preserved verbatim, never evaluated as a condition. PATH-REFERENCE-RULES.
     */
    private const PATH_REFERENCE_RULES = ['equalTo', 'notEqual', 'unique'];

    /**
     * Rules whose string param is a literal value, never a condition. An `accept`
     * param like `.jpg` would otherwise be misread as a relative field reference.
     */
    private const LITERAL_PARAM_RULES = ['accept'];

    /**
     * `match`/`pattern` carry a regex string preserved verbatim (schema §10: a
     * regex exists only as a `match` argument).
     */
    private const REGEX_PARAM_RULES = ['match', 'pattern'];

    /**
     * Membership rules whose param is the allowed-value SET (an array, comma
     * string, or a static value→label map, schema §2 G3). The param is data, NOT
     * a condition map — an object param is the value→label map (key = option
     * value, value = display label), so it is kept verbatim and never evaluated
     * key-by-key as expressions. The rule's flatten reads keys for a value→label
     * map (the label, possibly a LangMap or null, is display-only).
     */
    private const MEMBERSHIP_PARAM_RULES = ['in'];

    /**
     * Default error messages per rule (identical to the legacy Validator table). The
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

    /** @var array<string, RuleInterface> reused legacy rule instances */
    private array $rules;

    /** @var array<string, mixed> the composed root field map (composition-free) */
    private readonly array $properties;

    /**
     * @param array<string, mixed> $composedSpec a composed CRUDUI root spec — a group
     *        with `properties` (already free of $ref/$patch).
     */
    public function __construct(array $composedSpec)
    {
        $props = $composedSpec['properties'] ?? null;
        $this->properties = (is_array($props) && !array_is_list($props)) ? $props : [];
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
        $this->validateProperties($this->properties, $data, [], $data, $errors);

        return new ValidationResult(count($errors) === 0, array_values($errors));
    }

    /** Register the reused legacy rule instances. `pattern`/`match` share one. */
    private function registerRules(): void
    {
        $pattern = new Pattern();
        $this->rules = [
            'required' => new Required(),
            'email' => new Email(),
            'minlength' => new MinLength(),
            'maxlength' => new MaxLength(),
            'min' => new Min(),
            'max' => new Max(),
            'match' => $pattern,
            'pattern' => $pattern,
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
    // Field traversal (schema §3; legacy Validator.validateProperties skeleton).
    // =========================================================================

    /**
     * @param array<string, mixed> $properties
     * @param array<string, mixed> $data
     * @param list<string>         $currentPath
     * @param array<string, mixed> $allData
     * @param array<int, array<string, mixed>> $errors
     */
    private function validateProperties(
        array $properties,
        array $data,
        array $currentPath,
        array $allData,
        array &$errors,
    ): void {
        foreach ($properties as $propertyKey => $field) {
            if (!is_array($field)) {
                continue;
            }

            $fieldName = (string) $propertyKey;
            $isMultiple = $this->isMultiple($field);
            $fieldPath = [...$currentPath, $fieldName];
            $fieldValue = $data[$fieldName] ?? null;

            // NOTE: no display_switch / display_target gate (G1 — those meta keys
            // do not exist in CRUDUI; visibility-conditioned requiredness is
            // required:'<expr>').

            $childProps = $this->childProperties($field);

            if (($field['type'] ?? null) === 'group' && $childProps !== null) {
                $isArrayMultiple = $isMultiple && is_array($fieldValue) && array_is_list($fieldValue);
                $isObjectMultiple = $isMultiple
                    && is_array($fieldValue)
                    && !array_is_list($fieldValue);

                if ($isArrayMultiple) {
                    // Repeatable group: each index is items.i.
                    foreach ($fieldValue as $i => $itemData) {
                        $this->validateProperties(
                            $childProps,
                            is_array($itemData) ? $itemData : [],
                            [...$fieldPath, (string) $i],
                            $allData,
                            $errors,
                        );
                    }
                    $this->validateFieldRules($field, $fieldValue, $fieldPath, $allData, $errors);
                } elseif ($isObjectMultiple) {
                    // Object-key multiple: deterministic sorted-key traversal so
                    // the first reported error matches JS/Go/Rust (their maps
                    // carry no insertion order). Keys (items.__uid__) preserved.
                    $keys = array_keys($fieldValue);
                    sort($keys);
                    foreach ($keys as $key) {
                        $itemData = $fieldValue[$key];
                        $this->validateProperties(
                            $childProps,
                            is_array($itemData) ? $itemData : [],
                            [...$fieldPath, (string) $key],
                            $allData,
                            $errors,
                        );
                    }
                    $this->validateFieldRules($field, $fieldValue, $fieldPath, $allData, $errors);
                } elseif (!$isMultiple) {
                    // Single nested group.
                    $this->validateProperties(
                        $childProps,
                        is_array($fieldValue) ? $fieldValue : [],
                        $fieldPath,
                        $allData,
                        $errors,
                    );
                    $this->validateFieldRules($field, $fieldValue, $fieldPath, $allData, $errors);
                }
                // multiple set but data shape mismatched: skip (legacy parity).
            } elseif ($isMultiple && is_array($fieldValue)) {
                // Non-group multiple field: array-level rules on the whole array,
                // the rest on each element.
                $this->validateMultipleFieldRules($field, $fieldValue, $fieldPath, $allData, $errors);
            } else {
                $this->validateFieldRules($field, $fieldValue, $fieldPath, $allData, $errors);
            }
        }
    }

    /** Whether a CRUDUI field repeats (multiple:true or multiple:{ … }). */
    private function isMultiple(array $field): bool
    {
        $m = $field['multiple'] ?? null;
        return $m === true || (is_array($m) && !array_is_list($m));
    }

    /**
     * The child field map of a group (composed, plain object), or null.
     *
     * @return array<string, mixed>|null
     */
    private function childProperties(array $field): ?array
    {
        $props = $field['properties'] ?? null;
        if (is_array($props) && !array_is_list($props)) {
            return $props;
        }
        return null;
    }

    // =========================================================================
    // validate-slot evaluation (schema §3 slots.validate).
    // =========================================================================

    /**
     * Array-level + element rules for a non-group `multiple` field.
     *
     * @param list<mixed>  $values
     * @param list<string> $fieldPath
     * @param array<string, mixed> $allData
     * @param array<int, array<string, mixed>> $errors
     */
    private function validateMultipleFieldRules(
        array $field,
        array $values,
        array $fieldPath,
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
                $error = $this->runRule($ruleName, $ruleValue, $values, $fieldPath, $field, $messages, $allData);
                if ($error !== null) {
                    $errors[$this->pathKey($fieldPath)] = $this->makeError($fieldPath, $ruleName, $error, $values);
                    return;
                }
            }
        }

        // 2. Element-level rules per index (items.i).
        if (!array_is_list($values)) {
            ksort($values, SORT_STRING);
        }
        foreach ($values as $i => $value) {
            $this->validateElementRules($field, $value, [...$fieldPath, (string) $i], $allData, $errors);
        }
    }

    /**
     * Element-level rules for one element of a `multiple` field (no array-level).
     *
     * @param list<string> $itemPath
     * @param array<string, mixed> $allData
     * @param array<int, array<string, mixed>> $errors
     */
    private function validateElementRules(
        array $field,
        mixed $value,
        array $itemPath,
        array $allData,
        array &$errors,
    ): void {
        $messages = $this->fieldMessages($field);
        $rules = $this->normalizeValidateSlot($field['validate'] ?? null);

        if ($this->runImplicitNumber($field, $rules, $value, $itemPath, $messages, $allData, $errors)) {
            return;
        }
        if ($rules === null) {
            return;
        }
        foreach ($rules as $ruleName => $ruleValue) {
            if (in_array($ruleName, self::ARRAY_LEVEL_RULES, true)) {
                continue;
            }
            $error = $this->runRule($ruleName, $ruleValue, $value, $itemPath, $field, $messages, $allData);
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
     * @param array<string, mixed> $allData
     * @param array<int, array<string, mixed>> $errors
     */
    private function validateFieldRules(
        array $field,
        mixed $value,
        array $fieldPath,
        array $allData,
        array &$errors,
    ): void {
        $messages = $this->fieldMessages($field);
        $rules = $this->normalizeValidateSlot($field['validate'] ?? null);

        if ($this->runImplicitNumber($field, $rules, $value, $fieldPath, $messages, $allData, $errors)) {
            return;
        }
        if ($rules === null) {
            return;
        }
        foreach ($rules as $ruleName => $ruleValue) {
            $error = $this->runRule($ruleName, $ruleValue, $value, $fieldPath, $field, $messages, $allData);
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
     * @param array<string, string>|null $messages
     * @param array<string, mixed> $allData
     * @param array<int, array<string, mixed>> $errors
     */
    private function runImplicitNumber(
        array $field,
        ?array $rules,
        mixed $value,
        array $path,
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
        $error = $this->runRule('number', true, $value, $path, $field, $messages, $allData);
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
     * param, apply the central empty-skip, then call the rule instance and build
     * the message. Returns the error message or null.
     *
     * @param list<string> $path
     * @param array<string, string>|null $messages
     * @param array<string, mixed> $allData
     */
    private function runRule(
        string $ruleName,
        mixed $ruleValue,
        mixed $value,
        array $path,
        array $field,
        ?array $messages,
        array $allData,
    ): ?string {
        $effectiveParam = $this->resolveRuleValue($ruleName, $ruleValue, $path, $allData);

        // A false/null effective param disables the rule (VALIDATION-RULES §3).
        if ($effectiveParam === false || $effectiveParam === null) {
            return null;
        }

        // Central empty-skip (legacy Validator::applyRule). The reused legacy rule
        // instances do NOT skip empty themselves. required always fires;
        // mincount/maxcount on an array fire on the empty array too.
        if ($ruleName !== 'required' && $this->isEmpty($value)) {
            $isCountRuleOnArray = is_array($value)
                && in_array($ruleName, ['mincount', 'maxcount'], true);
            if (!$isCountRuleOnArray) {
                return null;
            }
        }

        // unique with a filter/field-reference param needs the CRUDUI expression
        // engine and the array path form, which the legacy rule lacks. Run the CRUDUI
        // native unique here (JS rules/unique parity).
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
     *     verbatim (schema §10) — never evaluated as a condition.
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
        if (
            in_array($ruleName, self::PATH_REFERENCE_RULES, true)
            || in_array($ruleName, self::LITERAL_PARAM_RULES, true)
            || in_array($ruleName, self::REGEX_PARAM_RULES, true)
            || in_array($ruleName, self::MEMBERSHIP_PARAM_RULES, true)
        ) {
            return $ruleValue;
        }

        // ConditionMap: a plain object of expression→value, declaration-ordered.
        if (is_array($ruleValue) && !array_is_list($ruleValue) && $ruleValue !== []) {
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
     * Try to read a string param as a value-returning ternary (`cond ? a : b`).
     * Returns ['handled' => false] when the string is not a ternary or its
     * condition part is not a parseable condition (so a regex such as
     * `^https?://...` containing `?...:` is NOT mistaken for a ternary).
     *
     * @param list<string> $path
     * @param array<string, mixed> $allData
     * @return array{handled: bool, value?: mixed}
     */
    private function tryEvaluateTernary(string $expression, array $path, array $allData): array
    {
        $questionPos = $this->findTernaryOperator($expression, '?');
        if ($questionPos === -1) {
            return ['handled' => false];
        }
        $colonPos = $this->findTernaryOperator($expression, ':', $questionPos + 1);
        if ($colonPos === -1) {
            return ['handled' => false];
        }
        $condition = trim(substr($expression, 0, $questionPos));
        if (!$this->isConditionExpression($condition)) {
            return ['handled' => false];
        }
        try {
            Expression::parse($condition);
        } catch (\Throwable) {
            return ['handled' => false];
        }
        $conditionResult = $this->evaluateCondition($condition, $path, $allData);
        $branch = $conditionResult
            ? trim(substr($expression, $questionPos + 1, $colonPos - $questionPos - 1))
            : trim(substr($expression, $colonPos + 1));

        if (preg_match('/\?[^:]*:/', $branch) === 1) {
            $nested = $this->tryEvaluateTernary($branch, $path, $allData);
            if ($nested['handled']) {
                return $nested;
            }
        }
        return ['handled' => true, 'value' => $this->parseTernaryBranchValue($branch)];
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

        if (is_array($value)) {
            // Array-level: the field value is the array itself.
            $valuesToCheck = [];
            if ($isFilterCondition) {
                foreach ($value as $i => $element) {
                    $itemPath = [...$pathSegments, (string) $i];
                    if (!$this->itemPassesCondition($ruleParam, $itemPath, $allData)) {
                        continue;
                    }
                    if (!$this->isEmpty($element)) {
                        $valuesToCheck[] = $element;
                    }
                }
            } elseif (is_string($ruleParam)) {
                foreach ($value as $item) {
                    if (is_array($item)) {
                        $fv = $item[$ruleParam] ?? null;
                        if (!$this->isEmpty($fv)) {
                            $valuesToCheck[] = $fv;
                        }
                    }
                }
            } else {
                foreach ($value as $v) {
                    if (!$this->isEmpty($v)) {
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
        } elseif (is_array($container)) {
            foreach ($container as $k => $item) {
                $entries[] = [(string) $k, $item];
            }
        } else {
            return true;
        }

        // Empty values never count as duplicates.
        if ($this->isEmpty($value)) {
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
            if (!is_array($item)) {
                continue;
            }
            if ($isFilterCondition) {
                $siblingFieldPath = [...$containerPath, $key, $fieldName];
                if (!$this->itemPassesCondition($ruleParam, $siblingFieldPath, $allData)) {
                    continue;
                }
            }
            $siblingValue = $item[$fieldName] ?? null;
            if ($this->isEmpty($siblingValue)) {
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
        if (is_array($value)) {
            return json_encode($value);
        }
        return $value;
    }

    // =========================================================================
    // Ternary helpers (string-split, regex-safe; JS findTernaryOperator parity).
    // =========================================================================

    /**
     * Position of a top-level ternary `?`/`:` respecting quotes, parens, brackets
     * and nested ternaries (JS findTernaryOperator / PHP legacy ConditionParser).
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
            if (($char === '"' || $char === "'") && !$inQuote) {
                $inQuote = true;
                $quoteChar = $char;
            } elseif ($char === $quoteChar && $inQuote) {
                $inQuote = false;
                $quoteChar = '';
            }
            if (!$inQuote) {
                if ($char === '(' || $char === '[') {
                    $depth++;
                } elseif ($char === ')' || $char === ']') {
                    $depth--;
                }
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
     * Parse a ternary branch string into a typed value (JS parseTernaryBranchValue
     * / PHP legacy ConditionParser::parseValue for scalars). A regex-pattern branch
     * survives as a raw string.
     */
    private function parseTernaryBranchValue(string $raw): mixed
    {
        $value = trim($raw);
        if (preg_match('/^["\'](.*)["\']$/s', $value, $m) === 1) {
            return $m[1];
        }
        if ($value === 'true') {
            return true;
        }
        if ($value === 'false') {
            return false;
        }
        if ($value === 'null') {
            return null;
        }
        if ($value !== '' && is_numeric($value)) {
            return str_contains($value, '.') ? (float) $value : (int) $value;
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
        $trimmed = trim($value);
        if ($trimmed === '') {
            return false;
        }
        return str_starts_with($trimmed, '.')
            || preg_match('/^[a-zA-Z_][a-zA-Z0-9_]*\./', $trimmed) === 1
            || preg_match('/\s+(==|!=|>|>=|<|<=|&&|\|\||in|not\s+in)\s+/', $trimmed) === 1
            || preg_match('/\?.*:/', $trimmed) === 1;
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
        if (is_array($slot) && !array_is_list($slot) && $slot !== []) {
            return $slot;
        }
        return null;
    }

    /**
     * Read the per-field custom messages (CRUDUI keeps the legacy `messages` map).
     *
     * @return array<string, string>|null
     */
    private function fieldMessages(array $field): ?array
    {
        $m = $field['messages'] ?? null;
        if (is_array($m) && !array_is_list($m)) {
            /** @var array<string, string> $m */
            return $m;
        }
        return null;
    }

    /**
     * Build the display message: per-field override → DEFAULT_MESSAGES → fallback,
     * with {0}/{1} replaced from the (possibly array) effective param. Mirrors the
     * legacy Validator::getErrorMessage.
     *
     * @param array<string, mixed>|null $messages
     */
    private function buildMessage(string $ruleName, mixed $param, ?array $messages): string
    {
        $message = $messages[$ruleName]
            ?? self::DEFAULT_MESSAGES[$ruleName]
            ?? 'Validation failed.';

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
        if (is_array($value)) {
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
            if (!is_array($current) || !array_key_exists($segment, $current)) {
                return null;
            }
            $current = $current[$segment];
        }
        return $current;
    }

    /**
     * Empty test (VALIDATION-RULES isEmpty / JS isEmpty): null, trim-empty string,
     * empty array/object. 0, '0', false are NOT empty.
     */
    private function isEmpty(mixed $value): bool
    {
        if ($value === null) {
            return true;
        }
        if (is_string($value)) {
            return trim($value) === '';
        }
        if (is_array($value)) {
            return count($value) === 0;
        }
        return false;
    }
}

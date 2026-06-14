<?php

declare(strict_types=1);

namespace CRUDUI\Validator\Legacy;

use CRUDUI\Validator\PathResolver;

use CRUDUI\Validator\Rules\RuleInterface;
use CRUDUI\Validator\Rules\Required;
use CRUDUI\Validator\Rules\Email;
use CRUDUI\Validator\Rules\MinLength;
use CRUDUI\Validator\Rules\MaxLength;
use CRUDUI\Validator\Rules\Min;
use CRUDUI\Validator\Rules\Max;
use CRUDUI\Validator\Rules\Pattern;
use CRUDUI\Validator\Rules\Unique;
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

/**
 * Core validator class for crudui system.
 * Validates form data against YAML specifications.
 */
class Validator
{
    /**
     * Rules that apply to a multiple field's array as a whole,
     * never to its individual entries.
     */
    public const ARRAY_LEVEL_RULES = ['required', 'unique', 'mincount', 'maxcount'];

    /**
     * Rules whose string param is a literal value, never a condition
     * expression. An accept param such as ".jpg" starts with a dot and would
     * otherwise be misread as a relative field reference and the rule skipped.
     */
    public const LITERAL_PARAM_RULES = ['accept'];

    /**
     * Default error messages for each rule.
     * 'pattern' and 'match' are aliases of the same rule.
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

    /**
     * @var array<string, RuleInterface|callable>
     */
    private array $rules = [];

    /**
     * @var array The form specification
     */
    private readonly array $spec;

    private readonly ConditionParser $conditionParser;

    private readonly PathResolver $pathResolver;

    /**
     * Create a new Validator instance.
     *
     * @param array $spec The form specification
     */
    public function __construct(array $spec)
    {
        $this->spec = $spec;
        $this->conditionParser = new ConditionParser();
        $this->pathResolver = new PathResolver();
        $this->registerDefaultRules();
    }

    /**
     * Register default validation rules.
     */
    private function registerDefaultRules(): void
    {
        $this->rules['required'] = new Required();
        $this->rules['email'] = new Email();
        $this->rules['minlength'] = new MinLength();
        $this->rules['maxlength'] = new MaxLength();
        $this->rules['min'] = new Min();
        $this->rules['max'] = new Max();
        // 'pattern' and 'match' are aliases of the same rule (fixtures use 'pattern')
        $patternRule = new Pattern();
        $this->rules['match'] = $patternRule;
        $this->rules['pattern'] = $patternRule;
        $this->rules['unique'] = new Unique();
        $this->rules['in'] = new In();
        $this->rules['range'] = new Range();
        $this->rules['rangelength'] = new RangeLength();
        $this->rules['number'] = new Number();
        $this->rules['digits'] = new Digits();
        $this->rules['equalTo'] = new EqualTo();
        $this->rules['notEqual'] = new NotEqual();
        $this->rules['date'] = new Date();
        $this->rules['dateISO'] = new DateISO();
        $this->rules['enddate'] = new EndDate();
        $this->rules['url'] = new Url();
        $this->rules['accept'] = new Accept();
        $this->rules['mincount'] = new MinCount();
        $this->rules['maxcount'] = new MaxCount();
        $this->rules['step'] = new Step();
    }

    /**
     * Validate data against the specification.
     *
     * @param array $data The data to validate
     * @return ValidationResult The validation result
     */
    public function validate(array $data): ValidationResult
    {
        $errors = [];
        $this->validateProperties($this->spec, $data, '', $data, $errors);

        return new ValidationResult(empty($errors), $errors);
    }

    /**
     * Validate a single field.
     *
     * @param string $path The field path (dot notation)
     * @param mixed $value The field value
     * @param array $allData All form data
     * @return string|null Error message or null if valid
     */
    public function validateField(string $path, mixed $value, array $allData): ?string
    {
        $fieldSpec = $this->getFieldSpec($path);
        if ($fieldSpec === null) {
            return null;
        }

        $rules = $fieldSpec['rules'] ?? [];
        if (empty($rules)) {
            return null;
        }

        foreach ($rules as $ruleName => $ruleParam) {
            $error = $this->applyRule($ruleName, $ruleParam, $value, $path, $allData, $fieldSpec);
            if ($error !== null) {
                return $error;
            }
        }

        return null;
    }

    /**
     * Add a custom validation rule.
     *
     * @param string $name The rule name
     * @param callable $fn The validation function: fn($value, $param, $allData, $path) => bool
     */
    public function addRule(string $name, callable $fn): void
    {
        $this->rules[$name] = $fn;
    }

    /**
     * Validate properties recursively.
     */
    private function validateProperties(
        array $spec,
        array $data,
        string $basePath,
        array $allData,
        array &$errors
    ): void {
        $properties = $spec['properties'] ?? [];

        foreach ($properties as $propertyKey => $propertySpec) {
            // A field spec must be an object/array; a malformed spec (e.g. a bare
            // string) is skipped rather than crashing, matching JS/Go behavior.
            if (!is_array($propertySpec)) {
                continue;
            }

            // Handle array notation (e.g., "items[]")
            $isArray = str_ends_with($propertyKey, '[]');
            $cleanKey = $isArray ? rtrim($propertyKey, '[]') : $propertyKey;

            $currentPath = $basePath === '' ? $cleanKey : "{$basePath}.{$cleanKey}";
            $value = $data[$cleanKey] ?? null;

            // Check if field should be validated based on conditions
            if (!$this->shouldValidateField($propertySpec, $currentPath, $allData)) {
                continue;
            }

            $type = $propertySpec['type'] ?? 'text';

            if ($type === 'group') {
                $multiple = $propertySpec['multiple'] ?? false;

                $multipleEnabled = $isArray || $multiple === true;

                // Check if this is a true array (multiple: true with list data)
                $isArrayMultiple = $multipleEnabled && is_array($value) && array_is_list($value);

                // A repeatable group whose rows are stored as an object keyed by
                // unique ids (__abc1234567__). Legacy Legacy's []-suffix path
                // iterates such an object preserving the key in the error path
                // (rows.__abc1234567__.v), so the row key must survive here too.
                // Without this the object would fall through to single-group
                // handling and the uniqid would be dropped (rows.v), diverging
                // from JS/Go/Rust.
                $isObjectMultiple = $multipleEnabled && is_array($value) && !array_is_list($value) && $multiple !== 'only';

                // Check if this is "only" mode (multiple: "only" with object data)
                $isOnlyMultiple = $multiple === 'only' && is_array($value) && !array_is_list($value);

                if ($isArrayMultiple) {
                    // Array-level rules (mincount/maxcount/...) on the group array itself
                    $this->validateFieldRules($propertySpec, $value, $currentPath, $allData, $errors, RuleScope::ArrayLevel);
                    if (isset($errors[$currentPath])) {
                        continue; // First error per field: skip item validation
                    }

                    // Handle array of groups (repeatable group)
                    foreach ($value as $index => $itemData) {
                        if (is_array($itemData)) {
                            $indexPath = "{$currentPath}.{$index}";
                            $this->validateProperties($propertySpec, $itemData, $indexPath, $allData, $errors);
                        }
                    }
                } elseif ($isObjectMultiple) {
                    // Group-level rules (mincount/maxcount/...) on the object itself
                    $this->validateFieldRules($propertySpec, $value, $currentPath, $allData, $errors, RuleScope::ArrayLevel);
                    if (isset($errors[$currentPath])) {
                        continue; // First error per field: skip item validation
                    }

                    // Repeatable group stored as object with unique keys.
                    // Keys are sorted so the first reported error is deterministic
                    // across languages (Go/Rust/JS all sort their key list too).
                    $keys = array_keys($value);
                    sort($keys);
                    foreach ($keys as $key) {
                        $itemData = $value[$key];
                        if (is_array($itemData)) {
                            $keyPath = "{$currentPath}.{$key}";
                            $this->validateProperties($propertySpec, $itemData, $keyPath, $allData, $errors);
                        }
                    }
                } elseif ($isOnlyMultiple) {
                    // Handle "only" mode - treat as single object without index
                    $this->validateProperties($propertySpec, $value, $currentPath, $allData, $errors);
                } else {
                    // Handle single group
                    $groupData = is_array($value) ? $value : [];
                    $this->validateProperties($propertySpec, $groupData, $currentPath, $allData, $errors);
                }
            } else {
                // Handle regular fields
                $isFieldMultiple = $isArray || ($propertySpec['multiple'] ?? false) === true;

                if ($isFieldMultiple && is_array($value)) {
                    // Array-level rules (required/unique/mincount/maxcount) on the array as a whole
                    $this->validateFieldRules($propertySpec, $value, $currentPath, $allData, $errors, RuleScope::ArrayLevel);
                    if (isset($errors[$currentPath])) {
                        continue; // First error per field: skip item validation
                    }

                    // Then validate each item individually (format rules, min/max, etc.)
                    foreach ($value as $index => $itemValue) {
                        $indexPath = "{$currentPath}.{$index}";
                        $this->validateFieldRules($propertySpec, $itemValue, $indexPath, $allData, $errors, RuleScope::ItemLevel);
                    }
                } else {
                    $this->validateFieldRules($propertySpec, $value, $currentPath, $allData, $errors);
                }
            }
        }
    }

    /**
     * Validate rules for a single field within the given scope.
     */
    private function validateFieldRules(
        array $fieldSpec,
        mixed $value,
        string $path,
        array $allData,
        array &$errors,
        RuleScope $scope = RuleScope::Single
    ): void {
        $rules = $fieldSpec['rules'] ?? [];
        $fieldType = $fieldSpec['type'] ?? 'text';

        // For number type fields, implicitly run number validation first
        // if there's no explicit number rule (to catch invalid numbers before min/max).
        // The implicit check targets scalar values, never the array of a multiple field.
        if (
            $scope !== RuleScope::ArrayLevel
            && $fieldType === 'number'
            && !isset($rules['number'])
            && !$this->isEmpty($value)
        ) {
            $error = $this->applyRule('number', true, $value, $path, $allData, $fieldSpec);
            if ($error !== null) {
                $errors[$path] = [
                    'field' => $path,
                    'rule' => 'number',
                    'message' => $error,
                    'value' => $value,
                ];
                return; // Stop at first error
            }
        }

        foreach ($rules as $ruleName => $ruleParam) {
            if (!$scope->appliesTo($ruleName)) {
                continue;
            }

            $error = $this->applyRule($ruleName, $ruleParam, $value, $path, $allData, $fieldSpec);
            if ($error !== null) {
                $errors[$path] = [
                    'field' => $path,
                    'rule' => $ruleName,
                    'message' => $error,
                    'value' => $value,
                ];
                break; // Stop on first error for this field
            }
        }
    }

    /**
     * Apply a single validation rule.
     */
    private function applyRule(
        string $ruleName,
        mixed $ruleParam,
        mixed $value,
        string $path,
        array $allData,
        array $fieldSpec
    ): ?string {
        $isLiteralParamRule = in_array($ruleName, self::LITERAL_PARAM_RULES, true);

        // Handle ternary expressions (e.g., min: ".type == 1 ? 100 : 0").
        // Literal-param rules (accept) keep their string param verbatim.
        if (!$isLiteralParamRule && is_string($ruleParam) && $this->isTernaryExpression($ruleParam)) {
            $ruleParam = $this->conditionParser->evaluateTernary($ruleParam, $path, $allData);
            // If result is null or false, skip the rule
            if ($ruleParam === null || $ruleParam === false) {
                return null;
            }
        }
        // Handle conditional rules (e.g., required: ".field == 'value'")
        elseif (!$isLiteralParamRule && is_string($ruleParam) && $this->isConditionExpression($ruleParam)) {
            $conditionMet = $this->conditionParser->evaluate($ruleParam, $path, $allData);
            if (!$conditionMet) {
                return null; // Condition not met, skip this rule
            }
            // If condition is met, treat as if the param is true
            $ruleParam = true;
        }

        // Handle object-style conditional rules (e.g., required: { when: ".field == 'value'" })
        if (is_array($ruleParam) && isset($ruleParam['when'])) {
            $conditionMet = $this->conditionParser->evaluate($ruleParam['when'], $path, $allData);
            if (!$conditionMet) {
                return null;
            }
            $ruleParam = true;
        }

        // Skip if rule param is explicitly false
        if ($ruleParam === false) {
            return null;
        }

        // For non-required fields, skip validation if value is empty.
        // Exception: mincount/maxcount must still fire on empty arrays
        // (an empty multiple field violates mincount - tests/cases/multiple-fields.json).
        if ($ruleName !== 'required' && $this->isEmpty($value)) {
            $isCountRuleOnArray = is_array($value) && in_array($ruleName, ['mincount', 'maxcount'], true);
            if (!$isCountRuleOnArray) {
                return null;
            }
        }

        // Get the rule handler
        $rule = $this->rules[$ruleName] ?? null;
        if ($rule === null) {
            return null; // Unknown rule, skip
        }

        // Execute the rule
        $isValid = false;
        if ($rule instanceof RuleInterface) {
            $isValid = $rule->validate($value, $ruleParam, $allData, $path);
        } elseif (is_callable($rule)) {
            $isValid = $rule($value, $ruleParam, $allData, $path);
        }

        if (!$isValid) {
            return $this->getErrorMessage($ruleName, $ruleParam, $fieldSpec);
        }

        return null;
    }

    /**
     * Check if a string is a condition expression.
     */
    private function isConditionExpression(string $value): bool
    {
        // Condition expressions start with . or contain comparison operators (but not ternary)
        if ($this->isTernaryExpression($value)) {
            return false;
        }
        return $this->looksLikeCondition($value);
    }

    /**
     * Check if a string is a ternary expression (condition ? trueValue : falseValue).
     *
     * The part before '?' must itself look like a condition. This keeps regex
     * params like "^https?://..." (where '?' is a quantifier) out of the
     * ternary path while ".country == KR ? A : B" stays in.
     */
    private function isTernaryExpression(string $value): bool
    {
        if (preg_match('/\?[^:]*:/', $value) !== 1) {
            return false;
        }

        $questionPos = strpos($value, '?');
        $condition = trim(substr($value, 0, (int)$questionPos));

        return $condition !== '' && $this->looksLikeCondition($condition);
    }

    /**
     * Check if a string looks like a condition (path reference or comparison).
     */
    private function looksLikeCondition(string $value): bool
    {
        return preg_match('/^\./', $value) === 1 ||
               preg_match('/\s*(==|!=|>=|<=|>|<|\s+in\s+|\s+not\s+in\s+)\s*/', $value) === 1;
    }

    /**
     * Check if field should be validated based on display conditions.
     */
    private function shouldValidateField(array $fieldSpec, string $path, array $allData): bool
    {
        // Check display_switch condition.
        // Boolean values short-circuit: false = always hidden (skip validation),
        // true = always shown. Only string expressions are evaluated.
        if (isset($fieldSpec['display_switch'])) {
            $displaySwitch = $fieldSpec['display_switch'];

            if ($displaySwitch === false) {
                return false;
            }

            if (is_string($displaySwitch)) {
                // Relative paths in a group's own condition resolve from the
                // group's scope (see PathResolver::resolveRelativePath)
                $fromGroup = ($fieldSpec['type'] ?? 'text') === 'group';
                if (!$this->conditionParser->evaluate($displaySwitch, $path, $allData, $fromGroup)) {
                    return false;
                }
            }
        }

        // Check display_target condition
        if (isset($fieldSpec['display_target'])) {
            $targetField = $fieldSpec['display_target'];
            $targetValue = $this->pathResolver->resolve($targetField, $path, $allData);
            if (empty($targetValue) && $targetValue !== '0' && $targetValue !== 0) {
                return false;
            }
        }

        return true;
    }

    /**
     * Get the field specification for a given path.
     */
    private function getFieldSpec(string $path): ?array
    {
        $parts = explode('.', $path);
        $currentSpec = $this->spec;

        foreach ($parts as $part) {
            // Skip numeric indices
            if (is_numeric($part)) {
                continue;
            }

            $properties = $currentSpec['properties'] ?? [];

            // Check for exact match or array notation
            if (isset($properties[$part])) {
                $currentSpec = $properties[$part];
            } elseif (isset($properties["{$part}[]"])) {
                $currentSpec = $properties["{$part}[]"];
            } else {
                return null;
            }
        }

        return $currentSpec;
    }

    /**
     * Get error message for a rule.
     */
    private function getErrorMessage(string $ruleName, mixed $ruleParam, array $fieldSpec): string
    {
        $messages = $fieldSpec['messages'] ?? [];

        // Check for custom message
        $message = $messages[$ruleName] ?? self::DEFAULT_MESSAGES[$ruleName] ?? 'Validation failed.';

        // Handle multi-language messages
        if (is_array($message)) {
            $message = $message['en'] ?? $message['ko'] ?? reset($message) ?: 'Validation failed.';
        }

        // Replace placeholders
        if (is_array($ruleParam)) {
            foreach ($ruleParam as $index => $paramValue) {
                $message = str_replace("{{$index}}", (string)$paramValue, $message);
            }
        } else {
            $message = str_replace('{0}', (string)$ruleParam, $message);
        }

        return $message;
    }

    /**
     * Check if a value is empty.
     */
    private function isEmpty(mixed $value): bool
    {
        if ($value === null) {
            return true;
        }
        if (is_string($value) && trim($value) === '') {
            return true;
        }
        if (is_array($value) && count($value) === 0) {
            return true;
        }
        return false;
    }
}

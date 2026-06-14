<?php

declare(strict_types=1);

namespace Polyspec\Validator\Rules;

/**
 * In list validation rule.
 * Validates that a value is one of the allowed values.
 */
class In implements RuleInterface
{
    /**
     * Validate that a value is in the allowed list.
     */
    public function validate(mixed $value, mixed $param, array $allData, string $path): bool
    {
        if ($param === false) {
            return true;
        }

        // Build the allowed values list
        $allowedValues = $this->flattenValues($param);

        if (empty($allowedValues)) {
            return true;
        }

        // Handle array values (check if all items are in allowed list)
        if (is_array($value)) {
            foreach ($value as $item) {
                if (!$this->isInList($item, $allowedValues)) {
                    return false;
                }
            }
            return true;
        }

        return $this->isInList($value, $allowedValues);
    }

    /**
     * Flatten a nested array of values.
     */
    private function flattenValues(mixed $param): array
    {
        if (!is_array($param)) {
            // Handle comma-separated string
            if (is_string($param)) {
                return array_map('trim', explode(',', $param));
            }
            return [$param];
        }

        // Static value→label content map (SPEC §2 G3): the option VALUE is the
        // KEY; the entry value is its display label (string, LangMap array
        // {ko,en}, or null empty label). The label is display-only and never a
        // member, so membership uses the KEYS. A null label slot has no effect.
        //
        // PHP assoc-decode loses the JSON string-key/list distinction: a 0-based
        // numeric-keyed value→label map (e.g. {"0":{ko,en},"1":{ko,en}}) decodes
        // to a LIST whose elements are LangMap arrays. So a value→label map shows
        // up either as a non-list assoc map of labels OR as a list whose elements
        // are all LangMap (assoc) arrays — both use the KEYS (the indices are the
        // option values 0,1,…). A plain list of primitives, and nested
        // allowed-value lists, keep the recursive values-flatten.
        if ($this->isValueLabelMap($param)) {
            return array_keys($param);
        }

        $result = [];
        array_walk_recursive($param, function ($value) use (&$result) {
            $result[] = $value;
        });

        return $result;
    }

    /**
     * Whether $param is a static value→label content map (G3) — membership uses
     * its KEYS. Two shapes (PHP assoc-decode erases JSON key typing):
     *   1. a non-list assoc array whose values are all labels (string | LangMap
     *      array | null), e.g. {"1":"Bronze","2":null}; OR
     *   2. a list whose elements are all LangMap (non-list assoc) arrays, e.g.
     *      [{ko,en},{ko,en}] — a 0-based numeric-keyed value→label map decoded as
     *      a list.
     * A plain list of primitives, and arrays carrying any non-label scalar (int,
     * float, bool) outside a LangMap, are NOT content maps.
     *
     * @param array<mixed, mixed> $param
     */
    private function isValueLabelMap(array $param): bool
    {
        if ($param === []) {
            return false;
        }
        if (array_is_list($param)) {
            // Shape 2: a value→label map flattened to a 0-based list — every
            // element must be a LangMap (a non-list, non-empty assoc array).
            foreach ($param as $value) {
                if (!is_array($value) || $value === [] || array_is_list($value)) {
                    return false;
                }
            }
            return true;
        }
        // Shape 1: an assoc value→label map — every value is a label.
        foreach ($param as $value) {
            if ($value !== null && !is_string($value) && !is_array($value)) {
                return false;
            }
        }
        return true;
    }

    /**
     * Check if a value is in the allowed list (with loose comparison).
     */
    private function isInList(mixed $value, array $allowedValues): bool
    {
        // Normalize the value for comparison
        $normalizedValue = $this->normalize($value);

        foreach ($allowedValues as $allowed) {
            $normalizedAllowed = $this->normalize($allowed);

            // Strict string comparison after normalization
            if ($normalizedValue === $normalizedAllowed) {
                return true;
            }

            // Also try numeric comparison
            if (is_numeric($normalizedValue) && is_numeric($normalizedAllowed)) {
                if ((float)$normalizedValue === (float)$normalizedAllowed) {
                    return true;
                }
            }
        }

        return false;
    }

    /**
     * Normalize a value for comparison.
     */
    private function normalize(mixed $value): string
    {
        if ($value === null) {
            return '';
        }
        if (is_bool($value)) {
            return $value ? '1' : '0';
        }
        return trim((string)$value);
    }

    /**
     * Returns the default error message for this rule.
     *
     * @return string Default message, with {0}, {1} placeholders where applicable
     */
    public function getDefaultMessage(): string
    {
        return 'Please select a valid option.';
    }
}

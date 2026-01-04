<?php

declare(strict_types=1);

namespace FormSpec\Validator;

/**
 * Resolves field paths in form data.
 *
 * Path syntax:
 * - .field              Reference field in current group
 * - ..field             Reference field in parent group
 * - ...field            Reference field in grandparent group
 * - field.subfield      Nested field access
 * - field.0.subfield    Array index access
 * - *.field             Wildcard matching in arrays
 */
class PathResolver
{
    /**
     * Resolve a path expression to get the field value.
     *
     * @param string $expression The path expression (e.g., ".fieldName", "..parentField")
     * @param string $currentPath The current field's path (dot notation)
     * @param array $allData All form data
     * @return mixed The resolved value
     */
    public function resolveExpression(string $expression, string $currentPath, array $allData): mixed
    {
        $expression = trim($expression);

        // Handle relative path notation (., .., ...)
        if (str_starts_with($expression, '.')) {
            $absolutePath = $this->resolveRelativePath($expression, $currentPath);
            return $this->getValueByPath($absolutePath, $allData);
        }

        // Handle absolute path
        return $this->getValueByPath($expression, $allData);
    }

    /**
     * Resolve a path expression with wildcard support.
     * Wildcards (*) are replaced with the current array index from the context path.
     *
     * @param string $expression The path expression (e.g., "items.*.is_close")
     * @param string $currentPath The current field's path (dot notation, e.g., "items.0.price")
     * @param array $allData All form data
     * @return mixed The resolved value
     */
    public function resolveExpressionWithWildcard(string $expression, string $currentPath, array $allData): mixed
    {
        $expression = trim($expression);

        // Handle relative path notation (., .., ...)
        if (str_starts_with($expression, '.')) {
            $absolutePath = $this->resolveRelativePath($expression, $currentPath);
            return $this->getValueByPath($absolutePath, $allData);
        }

        // Check if expression contains wildcards
        if (str_contains($expression, '*')) {
            // Replace wildcards with the corresponding index from the current path
            $resolvedPath = $this->replaceWildcardsWithCurrentIndex($expression, $currentPath, $allData);
            return $this->getValueByPath($resolvedPath, $allData);
        }

        // Handle absolute path
        return $this->getValueByPath($expression, $allData);
    }

    /**
     * Replace wildcards in a path with the corresponding indices from the current path.
     *
     * Example:
     * - expression: "items.*.is_close"
     * - currentPath: "items.0.price"
     * - result: "items.0.is_close"
     *
     * For paths like "option_single.items.*.is_close" with currentPath "option_single.items.0.price"
     * - result: "option_single.items.0.is_close"
     *
     * For multiple: "only" pattern where data is an object:
     * - expression: "option_single.items.*.is_close"
     * - currentPath: "option_single.items.price"
     * - data: option_single.items is an object (not array)
     * - result: "option_single.items.is_close" (wildcard is skipped)
     *
     * @param string $expression The path with wildcards
     * @param string $currentPath The current field path
     * @param array $allData All form data
     * @return string The path with wildcards replaced
     */
    private function replaceWildcardsWithCurrentIndex(string $expression, string $currentPath, array $allData): string
    {
        $exprParts = $this->pathToParts($expression);
        $currentParts = $this->pathToParts($currentPath);

        // Extract numeric indices from current path by matching path structure
        $result = [];

        foreach ($exprParts as $i => $part) {
            if ($part === '*') {
                // Get the path up to this point
                $pathBeforeWildcard = implode('.', $result);
                $valueAtPath = $pathBeforeWildcard === '' ? $allData : $this->getValueByPath($pathBeforeWildcard, $allData);

                // Check if the value is an object (not an array) - this is the "multiple: only" pattern
                if (is_array($valueAtPath) && !array_is_list($valueAtPath)) {
                    // Skip the wildcard for "only" pattern - the data is an object, not an array
                    continue;
                }

                // Find the corresponding index from current path
                $index = $this->findMatchingIndex($exprParts, $i, $currentParts, $allData);
                if ($index !== null) {
                    $result[] = (string)$index;
                } else {
                    // If no matching index found, keep the wildcard (will be resolved later)
                    $result[] = '*';
                }
            } else {
                $result[] = $part;
            }
        }

        return implode('.', $result);
    }

    /**
     * Find the matching index for a wildcard at position $wildcardPos in the expression.
     *
     * @param array $exprParts Expression path parts
     * @param int $wildcardPos Position of the wildcard in expression parts
     * @param array $currentParts Current path parts
     * @param array $allData All form data
     * @return int|null The matching index or null
     */
    private function findMatchingIndex(array $exprParts, int $wildcardPos, array $currentParts, array $allData): ?int
    {
        // Build the path prefix before the wildcard in the expression
        $exprPrefix = array_slice($exprParts, 0, $wildcardPos);

        // Find where this prefix matches in the current path
        // We need to find a numeric index in the current path that corresponds to this wildcard
        $currentIndex = 0;
        $wildcardCount = 0;

        // Count wildcards before this position in expression to know which index we need
        for ($i = 0; $i < $wildcardPos; $i++) {
            if ($exprParts[$i] === '*') {
                $wildcardCount++;
            }
        }

        // Now find the (wildcardCount + 1)th numeric index in current path that matches
        // the structure of the expression
        $numericIndicesFound = 0;

        // Match the expression prefix against current path
        $exprIdx = 0;
        $curIdx = 0;

        while ($exprIdx < count($exprPrefix) && $curIdx < count($currentParts)) {
            $exprPart = $exprPrefix[$exprIdx] ?? null;
            $curPart = $currentParts[$curIdx] ?? null;

            if ($exprPart === '*') {
                // Skip to the numeric index in current path
                if (is_numeric($curPart)) {
                    $numericIndicesFound++;
                    $curIdx++;
                    $exprIdx++;
                } else {
                    $curIdx++;
                }
            } elseif ($exprPart === $curPart) {
                $exprIdx++;
                $curIdx++;
            } else {
                // Mismatch - try to skip numeric indices in current path
                if (is_numeric($curPart)) {
                    $curIdx++;
                } else {
                    break;
                }
            }
        }

        // Now find the numeric index after the matching prefix
        while ($curIdx < count($currentParts)) {
            $curPart = $currentParts[$curIdx];
            if (is_numeric($curPart)) {
                return (int)$curPart;
            }
            $curIdx++;
        }

        // Fallback: find any numeric index in current path that could match
        foreach ($currentParts as $part) {
            if (is_numeric($part)) {
                return (int)$part;
            }
        }

        return null;
    }

    /**
     * Resolve a simple field reference (for display_target etc.).
     *
     * @param string $fieldName The field name
     * @param string $currentPath The current field's path
     * @param array $allData All form data
     * @return mixed The resolved value
     */
    public function resolve(string $fieldName, string $currentPath, array $allData): mixed
    {
        // If it looks like a path expression, use resolveExpression
        if (str_starts_with($fieldName, '.')) {
            return $this->resolveExpression($fieldName, $currentPath, $allData);
        }

        // Otherwise, look for the field in the same group
        $currentParts = $this->pathToParts($currentPath);
        if (count($currentParts) > 0) {
            array_pop($currentParts); // Remove current field
            $currentParts[] = $fieldName;
            $path = implode('.', $currentParts);
            return $this->getValueByPath($path, $allData);
        }

        return $this->getValueByPath($fieldName, $allData);
    }

    /**
     * Resolve a relative path to an absolute path.
     *
     * @param string $relativePath The relative path (e.g., ".field", "..field")
     * @param string $currentPath The current field's absolute path
     * @return string The absolute path
     */
    private function resolveRelativePath(string $relativePath, string $currentPath): string
    {
        $currentParts = $this->pathToParts($currentPath);

        // Remove the current field name from path
        if (count($currentParts) > 0) {
            array_pop($currentParts);
        }

        // Count leading dots
        $dots = 0;
        for ($i = 0; $i < strlen($relativePath); $i++) {
            if ($relativePath[$i] === '.') {
                $dots++;
            } else {
                break;
            }
        }

        // Get the field path after dots
        $fieldPath = substr($relativePath, $dots);

        // Go up directories based on dot count (. = same level, .. = parent, etc.)
        $levelsUp = $dots - 1;
        for ($i = 0; $i < $levelsUp && count($currentParts) > 0; $i++) {
            // Pop non-numeric parts (skip array indices)
            while (count($currentParts) > 0 && is_numeric(end($currentParts))) {
                array_pop($currentParts);
            }
            if (count($currentParts) > 0) {
                array_pop($currentParts);
            }
        }

        // Add the new field path
        if ($fieldPath !== '') {
            $fieldParts = $this->pathToParts($fieldPath);
            $currentParts = array_merge($currentParts, $fieldParts);
        }

        return implode('.', $currentParts);
    }

    /**
     * Convert a path string to array of parts.
     */
    private function pathToParts(string $path): array
    {
        if ($path === '') {
            return [];
        }
        return explode('.', $path);
    }

    /**
     * Get value from data by dot-notation path.
     *
     * @param string $path The path (e.g., "field.subfield.0.value")
     * @param array $data The data to search
     * @return mixed The value or null if not found
     */
    public function getValueByPath(string $path, array $data): mixed
    {
        if ($path === '') {
            return $data;
        }

        $parts = $this->pathToParts($path);

        // Handle wildcard paths
        if (in_array('*', $parts, true)) {
            return $this->resolveWildcardPath($parts, $data);
        }

        $current = $data;

        foreach ($parts as $part) {
            if (is_array($current)) {
                if (array_key_exists($part, $current)) {
                    $current = $current[$part];
                } elseif (is_numeric($part) && array_key_exists((int)$part, $current)) {
                    $current = $current[(int)$part];
                } else {
                    return null;
                }
            } else {
                return null;
            }
        }

        return $current;
    }

    /**
     * Resolve a path with wildcards.
     *
     * @param array $parts Path parts including '*'
     * @param array $data The data to search
     * @return array All matching values
     */
    private function resolveWildcardPath(array $parts, array $data): array
    {
        $results = [$data];

        foreach ($parts as $part) {
            $newResults = [];

            foreach ($results as $current) {
                if (!is_array($current)) {
                    continue;
                }

                if ($part === '*') {
                    // Expand all items
                    foreach ($current as $item) {
                        $newResults[] = $item;
                    }
                } else {
                    // Regular field access
                    if (array_key_exists($part, $current)) {
                        $newResults[] = $current[$part];
                    } elseif (is_numeric($part) && array_key_exists((int)$part, $current)) {
                        $newResults[] = $current[(int)$part];
                    }
                }
            }

            $results = $newResults;
        }

        return $results;
    }

    /**
     * Convert bracket notation to dot notation.
     * e.g., "field[0][subfield]" -> "field.0.subfield"
     */
    public function bracketToDot(string $path): string
    {
        // Replace ][, [, ] with dots
        $path = str_replace('][', '.', $path);
        $path = str_replace('[', '.', $path);
        $path = str_replace(']', '', $path);
        return $path;
    }

    /**
     * Convert dot notation to bracket notation.
     * e.g., "field.0.subfield" -> "field[0][subfield]"
     */
    public function dotToBracket(string $path): string
    {
        $parts = $this->pathToParts($path);
        if (count($parts) === 0) {
            return '';
        }

        $first = array_shift($parts);
        if (count($parts) === 0) {
            return $first;
        }

        return $first . '[' . implode('][', $parts) . ']';
    }
}

<?php

declare(strict_types=1);

namespace CRUDUI\Validator;

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
     * Resolve a relative path to an absolute path.
     *
     * Each extra dot climbs one group: . = sibling, .. = parent's sibling.
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
        $levelsUp = max(0, $dots - 1);
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
    private function getValueByPath(string $path, array $data): mixed
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
            if ($current instanceof \stdClass) $current = (array) $current;
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
                if ($current instanceof \stdClass) $current = (array) $current;
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
}

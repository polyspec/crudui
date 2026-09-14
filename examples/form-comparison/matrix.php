<?php
declare(strict_types=1);

/**
 * Read the browser matrix (API actions, rendering paths and frameworks), defined once in
 * the comparison runner's runtime-paths.json and shared with the JavaScript, Go and Rust code.
 */
function browserMatrix(string $sourceRoot): stdClass
{
    $matrix = json_decode((string) file_get_contents($sourceRoot . '/examples/form-comparison/src/runtime-paths.json'), false, 512, JSON_THROW_ON_ERROR);
    foreach (['actions', 'renderingPaths', 'frameworks'] as $key) {
        $values = $matrix instanceof stdClass ? ($matrix->$key ?? null) : null;
        if (!is_array($values) || $values === [] || array_filter($values, 'is_string') !== $values) throw new RuntimeException('Invalid browser matrix: ' . $key);
    }
    return $matrix;
}

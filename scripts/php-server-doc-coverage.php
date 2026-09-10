<?php
/**
 * php-server-doc-coverage.php — doc-coverage checker for the php-api example.
 *
 * Asserts that every named top-level function in the php-api router files
 * (api.php, validate.php, index.php) carries a docblock immediately above its
 * declaration. Exits non-zero when any function is undocumented.
 *
 * Dependency-free: tokenizes each file with PHP's own tokenizer rather than
 * loading it, so the closures and `exit`-driven router scripts (which must not
 * actually run during a check) are inspected statically. This mirrors the
 * library checker (scripts/php-doc-coverage.php) but targets the example
 * server's procedural function declarations instead of classes/methods.
 *
 * Usage: php scripts/php-server-doc-coverage.php
 */

declare(strict_types=1);

/**
 * Scan a PHP source file and return the names of top-level functions whose
 * declaration is not immediately preceded by a docblock (T_DOC_COMMENT).
 *
 * Only `function NAME(` forms are checked. Anonymous closures (used by
 * validate.php) are not named declarations and are skipped here; their intent
 * is documented inline at the assignment site.
 *
 * @param string $file absolute path to a PHP source file
 * @return string[] undocumented function names (empty when all documented)
 */
function crudui_php_server_doc_gaps(string $file): array
{
    $code = file_get_contents($file);
    if ($code === false) {
        return ["<unreadable: {$file}>"];
    }

    $tokens = token_get_all($code);
    $gaps = [];

    for ($i = 0, $n = count($tokens); $i < $n; $i++) {
        $tok = $tokens[$i];
        if (!is_array($tok) || $tok[0] !== T_FUNCTION) {
            continue;
        }

        // The next meaningful token must be the function name (T_STRING).
        // A closure (`function (` or `function () use`) has no name here and is
        // skipped: its next significant token is "(", not a T_STRING.
        $j = $i + 1;
        while ($j < $n && is_array($tokens[$j]) && in_array($tokens[$j][0], [T_WHITESPACE, T_COMMENT], true)) {
            $j++;
        }
        if ($j >= $n || !is_array($tokens[$j]) || $tokens[$j][0] !== T_STRING) {
            continue; // anonymous function / closure
        }
        $name = $tokens[$j][1];

        // Walk backwards over whitespace/attributes to the preceding token;
        // a docblock must sit directly above the declaration.
        $k = $i - 1;
        while ($k >= 0 && is_array($tokens[$k]) && $tokens[$k][0] === T_WHITESPACE) {
            $k--;
        }
        $hasDoc = $k >= 0 && is_array($tokens[$k]) && $tokens[$k][0] === T_DOC_COMMENT;
        if (!$hasDoc) {
            $gaps[] = basename($file) . ': function ' . $name . '()';
        }
    }

    return $gaps;
}

/**
 * Resolve the php-api router files to check.
 *
 * @return string[] absolute paths that exist
 */
function crudui_php_server_files(): array
{
    $dir = realpath(__DIR__ . '/../examples/legacy/php-api');
    if ($dir === false) {
        return [];
    }
    $files = [];
    foreach (['api.php', 'validate.php', 'index.php'] as $f) {
        $path = $dir . '/' . $f;
        if (is_file($path)) {
            $files[] = $path;
        }
    }
    return $files;
}

// --- run (only when invoked directly as a CLI) ---
if (PHP_SAPI === 'cli' && isset($argv[0]) && realpath($argv[0]) === realpath(__FILE__)) {
    $files = crudui_php_server_files();
    if (count($files) === 0) {
        fwrite(STDERR, "[php-server-doc-coverage] no php-api router files found\n");
        exit(2);
    }

    $gaps = [];
    foreach ($files as $file) {
        $gaps = array_merge($gaps, crudui_php_server_doc_gaps($file));
    }
    sort($gaps);

    if (count($gaps) > 0) {
        fwrite(STDERR, '[php-server-doc-coverage] FAIL: ' . count($gaps) . " undocumented function(s):\n");
        foreach ($gaps as $g) {
            fwrite(STDERR, "  $g\n");
        }
        exit(1);
    }
    fwrite(STDOUT, "[php-server-doc-coverage] PASS: all php-api router functions documented\n");
    exit(0);
}

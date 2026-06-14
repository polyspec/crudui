<?php
/**
 * php-doc-coverage.php — standalone PHP doc-coverage checker.
 *
 * Asserts that every public class and public method in Polyspec\Validator
 * carries a docblock. Exits non-zero (RED) when any public symbol is
 * undocumented. Dependency-free: uses tokenizer + reflection over the source
 * tree, so it runs without composer/phpunit installed.
 *
 * It is also exercised as a PHPUnit test (see DocCoverageTest) when the test
 * suite runs.
 */

declare(strict_types=1);

/**
 * Scan the validator-php src tree and return a list of undocumented public
 * symbols ("Class" and "Class::method" entries).
 *
 * @param string $srcDir absolute path to the package src directory
 * @return string[] undocumented public symbol descriptions (empty when all documented)
 */
function polyspec_php_doc_gaps(string $srcDir): array
{
    // Bootstrap the composer autoloader so dependent classes resolve regardless
    // of file order. Falls back gracefully if vendor is absent.
    $autoload = dirname($srcDir) . '/vendor/autoload.php';
    if (is_file($autoload)) {
        require_once $autoload;
    }

    $gaps = [];
    $rii = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator($srcDir, FilesystemIterator::SKIP_DOTS)
    );
    foreach ($rii as $file) {
        if ($file->getExtension() !== 'php') {
            continue;
        }
        $code = file_get_contents($file->getPathname());
        if ($code === false) {
            continue;
        }

        // Discover declared class-like names (class/interface/trait/enum).
        if (!preg_match_all('/^\s*(?:final\s+|abstract\s+)?(?:class|interface|trait|enum)\s+(\w+)/m', $code, $m)) {
            continue;
        }

        $fqcnBase = resolve_fqcn($code, '');
        foreach ($m[1] as $shortName) {
            $fqcn = $fqcnBase . $shortName;
            if (!class_exists($fqcn) && !interface_exists($fqcn) && !trait_exists($fqcn) && !enum_exists($fqcn)) {
                continue;
            }
            $rc = new ReflectionClass($fqcn);
            if ($rc->getDocComment() === false) {
                $gaps[] = $rc->getName();
            }
            foreach ($rc->getMethods(ReflectionMethod::IS_PUBLIC) as $method) {
                if ($method->getDeclaringClass()->getName() !== $rc->getName()) {
                    continue; // only own methods, not inherited
                }
                if ($method->isInternal()) {
                    continue;
                }
                if ($method->getDocComment() === false) {
                    $gaps[] = $rc->getName() . '::' . $method->getName() . '()';
                }
            }
        }
    }
    sort($gaps);
    return $gaps;
}

/**
 * Read the `namespace` declared in source and build a fully-qualified name.
 *
 * @param string $code      file contents
 * @param string $shortName declared class short name (use "" to get the namespace prefix only)
 * @return string fully-qualified class name, or the namespace prefix ending in "\\"
 */
function resolve_fqcn(string $code, string $shortName): string
{
    if (preg_match('/^\s*namespace\s+([^;]+);/m', $code, $nm)) {
        return trim($nm[1]) . '\\' . $shortName;
    }
    return $shortName;
}

// --- run (only when invoked directly as a CLI, not when required by a test) ---
if (PHP_SAPI === 'cli' && isset($argv[0]) && realpath($argv[0]) === realpath(__FILE__)) {
    $srcDir = realpath(__DIR__ . '/../packages/validator-php/src');
    if ($srcDir === false) {
        fwrite(STDERR, "[php-doc-coverage] src dir not found\n");
        exit(2);
    }

    $gaps = polyspec_php_doc_gaps($srcDir);
    if (count($gaps) > 0) {
        fwrite(STDERR, '[php-doc-coverage] RED: ' . count($gaps) . " undocumented public symbol(s):\n");
        foreach ($gaps as $g) {
            fwrite(STDERR, "  $g\n");
        }
        exit(1);
    }
    fwrite(STDOUT, "[php-doc-coverage] GREEN: all public classes/methods documented\n");
    exit(0);
}

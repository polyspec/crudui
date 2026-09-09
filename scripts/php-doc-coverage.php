<?php
/** Check documentation and source provenance for both public PHP packages. */
declare(strict_types=1);

/**
 * Return missing documentation or unresolved source declarations in a package.
 *
 * @param string $srcDir Absolute package source directory.
 * @return string[] Source or documentation failures, sorted by name.
 */
function crudui_php_doc_gaps(string $srcDir): array
{
    $autoload = dirname($srcDir) . '/vendor/autoload.php';
    if (!is_file($autoload)) {
        throw new RuntimeException('Composer autoload is required: ' . $autoload);
    }
    require_once $autoload;
    $gaps = [];
    $declarations = 0;
    $files = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($srcDir, FilesystemIterator::SKIP_DOTS));
    foreach ($files as $file) {
        if ($file->getExtension() !== 'php') {
            continue;
        }
        $code = file_get_contents($file->getPathname());
        if ($code === false) {
            throw new RuntimeException('Cannot read PHP source: ' . $file->getPathname());
        }
        foreach (crudui_php_source_classes($code) as $name) {
            $declarations++;
            if (!class_exists($name) && !interface_exists($name) && !trait_exists($name) && !enum_exists($name)) {
                $gaps[] = $name . ' (source declaration cannot be loaded)';
                continue;
            }
            $class = new ReflectionClass($name);
            if ($class->isInternal() || realpath((string) $class->getFileName()) !== realpath($file->getPathname())) {
                $gaps[] = $name . ' (loaded class does not match its source file)';
                continue;
            }
            if ($class->getDocComment() === false) {
                $gaps[] = $name;
            }
            foreach ($class->getMethods(ReflectionMethod::IS_PUBLIC) as $method) {
                if ($method->getDeclaringClass()->getName() === $name && !$method->isInternal() && $method->getDocComment() === false) {
                    $gaps[] = $name . '::' . $method->getName() . '()';
                }
            }
        }
    }
    if ($declarations === 0) {
        $gaps[] = $srcDir . ' (no class declarations found)';
    }
    sort($gaps);
    return $gaps;
}

/**
 * Read named class, interface, trait and enum declarations using PHP tokens.
 *
 * @param string $code PHP source code.
 * @return string[] Fully qualified declaration names in source order.
 */
function crudui_php_source_classes(string $code): array
{
    $tokens = token_get_all($code, TOKEN_PARSE);
    $namespace = '';
    $names = [];
    $count = count($tokens);
    for ($index = 0; $index < $count; $index++) {
        $token = $tokens[$index];
        if (!is_array($token)) {
            continue;
        }
        if ($token[0] === T_NAMESPACE) {
            $namespace = '';
            while (++$index < $count && $tokens[$index] !== ';' && $tokens[$index] !== '{') {
                $part = $tokens[$index];
                if (is_array($part) && in_array($part[0], [T_STRING, T_NAME_QUALIFIED, T_NS_SEPARATOR], true)) {
                    $namespace .= $part[1];
                }
            }
        } elseif (in_array($token[0], [T_CLASS, T_INTERFACE, T_TRAIT, T_ENUM], true)) {
            $next = $index + 1;
            while ($next < $count && is_array($tokens[$next]) && in_array($tokens[$next][0], [T_WHITESPACE, T_COMMENT, T_DOC_COMMENT], true)) {
                $next++;
            }
            if ($next < $count && is_array($tokens[$next]) && $tokens[$next][0] === T_STRING) {
                $names[] = ($namespace === '' ? '' : $namespace . '\\') . $tokens[$next][1];
            }
        }
    }
    return $names;
}

if (PHP_SAPI === 'cli' && isset($argv[0]) && realpath($argv[0]) === realpath(__FILE__)) {
    $failed = false;
    foreach (['validator-php', 'generator-php'] as $package) {
        try {
            $directory = realpath(__DIR__ . '/../packages/' . $package . '/src');
            if ($directory === false) {
                throw new RuntimeException('Source directory is missing: ' . $package);
            }
            $gaps = crudui_php_doc_gaps($directory);
            if ($gaps !== []) {
                throw new RuntimeException(implode("\n  ", $gaps));
            }
            fwrite(STDOUT, '[php-doc-coverage] ' . $package . ": PASS\n");
        } catch (Throwable $error) {
            $failed = true;
            fwrite(STDERR, '[php-doc-coverage] ' . $package . ': FAIL: ' . $error->getMessage() . "\n");
        }
    }
    exit($failed ? 1 : 0);
}

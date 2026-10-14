<?php

declare(strict_types=1);

namespace Polyspec\Crudui\Docs;

use FilesystemIterator;
use RecursiveDirectoryIterator;
use RecursiveIteratorIterator;
use ReflectionClass;
use ReflectionMethod;
use RuntimeException;

/**
 * The documentation and source provenance check of the public PHP packages: scripts/php-doc-coverage.php runs it on
 * both packages, and the DocCoverageTest of each package on its own source.
 */
final class DocCoverage
{
    /**
     * Return missing documentation or unresolved source declarations in a package.
     *
     * @param string $srcDir Absolute package source directory.
     * @param string|null $autoload Composer autoload file; vendor/autoload.php of the development root when null.
     * @return string[] Source or documentation failures, sorted by name.
     */
    public static function gaps(string $srcDir, ?string $autoload = null): array
    {
        $autoload ??= __DIR__ . '/../../../vendor/autoload.php';
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
            foreach (self::sourceClasses($code) as $name) {
                $declarations++;
                if (!class_exists($name) && !interface_exists($name) && !trait_exists($name) && !enum_exists($name)) {
                    $gaps[] = $name . ' (source declaration cannot be loaded)';
                    continue;
                }
                $class = new ReflectionClass($name);
                if (
                    $class->isInternal()
                    || realpath((string) $class->getFileName()) !== realpath($file->getPathname())
                ) {
                    $gaps[] = $name . ' (loaded class does not match its source file)';
                    continue;
                }
                if ($class->getDocComment() === false) {
                    $gaps[] = $name;
                }
                foreach ($class->getMethods(ReflectionMethod::IS_PUBLIC) as $method) {
                    if (
                        $method->getDeclaringClass()->getName() === $name
                        && !$method->isInternal()
                        && $method->getDocComment() === false
                    ) {
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
    public static function sourceClasses(string $code): array
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
                while (
                    $next < $count
                    && is_array($tokens[$next])
                    && in_array($tokens[$next][0], [T_WHITESPACE, T_COMMENT, T_DOC_COMMENT], true)
                ) {
                    $next++;
                }
                if ($next < $count && is_array($tokens[$next]) && $tokens[$next][0] === T_STRING) {
                    $names[] = ($namespace === '' ? '' : $namespace . '\\') . $tokens[$next][1];
                }
            }
        }
        return $names;
    }
}

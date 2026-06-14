<?php

declare(strict_types=1);

namespace CRUDUI\Validator\Tests;

use PHPUnit\Framework\TestCase;

/**
 * Doc-coverage gate (PHP arm). Asserts that every public class and public
 * method in the validator-php source carries a docblock. Adding an
 * undocumented public symbol turns this test RED.
 *
 * The check logic lives in scripts/php-doc-coverage.php (also runnable
 * standalone without phpunit); this test wraps it for the suite.
 */
final class DocCoverageTest extends TestCase
{
    /**
     * Every public class/method in src must be documented.
     */
    public function testAllPublicSymbolsAreDocumented(): void
    {
        require_once __DIR__ . '/../../../scripts/php-doc-coverage.php';

        $srcDir = realpath(__DIR__ . '/../src');
        self::assertNotFalse($srcDir, 'validator-php src directory not found');

        $gaps = crudui_php_doc_gaps($srcDir);

        self::assertSame(
            [],
            $gaps,
            "Undocumented public symbol(s):\n  " . implode("\n  ", $gaps)
        );
    }
}

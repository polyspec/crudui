<?php

declare(strict_types=1);

namespace Polyspec\Crudui\Validator\Tests;

use PHPUnit\Framework\TestCase;
use Polyspec\Crudui\Docs\DocCoverage;

/**
 * Requires a docblock on every public class and public method in the
 * validator-php source. An undocumented public symbol fails the test.
 *
 * The check is Polyspec\Crudui\Docs\DocCoverage of tests/docs/php, which
 * scripts/php-doc-coverage.php also runs; this test runs it for the suite.
 */
final class DocCoverageTest extends TestCase
{
    /**
     * Every public class/method in src must be documented.
     */
    public function testAllPublicSymbolsAreDocumented(): void
    {
        $srcDir = realpath(__DIR__ . '/../src');
        self::assertNotFalse($srcDir, 'validator-php src directory not found');

        $gaps = DocCoverage::gaps($srcDir);

        self::assertSame(
            [],
            $gaps,
            "Undocumented public symbol(s):\n  " . implode("\n  ", $gaps)
        );
    }
}

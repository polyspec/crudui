<?php

declare(strict_types=1);

namespace CRUDUI\Generator\Tests\Internal;

use CRUDUI\Generator\InterfaceMessages;
use PHPUnit\Framework\TestCase;

/**
 * The embedded interface messages equal contracts/interface-messages.json, and the
 * generated source is what the generator writes today.
 */
final class InterfaceMessagesTest extends TestCase
{
    private const ROOT = __DIR__ . '/../../../..';

    /** @return array<string, mixed> */
    private static function contract(): array
    {
        return json_decode((string) file_get_contents(self::ROOT . '/contracts/interface-messages.json'), true, 512, JSON_THROW_ON_ERROR);
    }

    public function testEmbeddedMessagesEqualsTheContract(): void
    {
        $contract = self::contract();
        self::assertSame($contract['form'], InterfaceMessages::MESSAGES);
    }

    public function testGeneratedSourceIsCurrent(): void
    {
        $source = dirname(__DIR__, 2) . '/src/Internal/InterfaceMessages.php';
        $expected = file_get_contents($source);
        $script = dirname(__DIR__, 2) . '/scripts/generate-interface-messages.php';
        $output = [];
        $status = 0;
        exec(escapeshellarg(PHP_BINARY) . ' ' . escapeshellarg($script) . ' --stdout', $output, $status);
        self::assertSame(0, $status, 'Generator script failed; run: php packages/generator-php/scripts/generate-interface-messages.php');
        self::assertSame($expected, implode("\n", $output) . "\n", 'Generated source does not match; run: php packages/generator-php/scripts/generate-interface-messages.php');
    }
}

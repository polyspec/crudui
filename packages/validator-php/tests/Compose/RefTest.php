<?php

declare(strict_types=1);

namespace FormSpec\Validator\Tests\Compose;

use FormSpec\Validator\Compose\Compose;
use FormSpec\Validator\Compose\ComposeLoadError;
use FormSpec\Validator\Compose\MemoryLoader;
use FormSpec\Validator\Compose\Ref;
use PHPUnit\Framework\TestCase;

/**
 * legacy-parity unit tests for $ref resolution edge cases not isolated in cases.json:
 * self-cycle, three-node cycle, diamond-not-cycle, empty-path format error, and
 * the declaration-order rule (a sibling BEFORE $ref is overridden by the base; a
 * sibling AFTER $ref overrides the base). Port of
 * validator-js/src/compose/ref.test.ts.
 */
final class RefTest extends TestCase
{
    // --- $ref cycle detection (legacy infinite-recurses; CRUDUI must throw) -------

    public function testSelfCycle(): void
    {
        $loader = new MemoryLoader(['a.yml' => ['properties' => ['$ref' => 'a.yml']]]);
        try {
            Ref::resolve('a.yml', '', $loader);
            $this->fail('expected cycle error');
        } catch (ComposeLoadError $e) {
            $this->assertSame('REF_CYCLE', $e->code);
        }
    }

    public function testThreeNodeCycle(): void
    {
        $loader = new MemoryLoader([
            'a.yml' => ['properties' => ['$ref' => 'b.yml']],
            'b.yml' => ['properties' => ['$ref' => 'c.yml']],
            'c.yml' => ['properties' => ['$ref' => 'a.yml']],
        ]);
        try {
            Ref::resolve('a.yml', '', $loader);
            $this->fail('expected cycle error');
        } catch (ComposeLoadError $e) {
            $this->assertSame('REF_CYCLE', $e->code);
        }
    }

    public function testDiamondIsNotACycle(): void
    {
        $loader = new MemoryLoader([
            'leaf.yml' => ['properties' => ['x' => ['type' => 'text']]],
            'left.yml' => ['properties' => ['$ref' => 'leaf.yml']],
            'right.yml' => ['properties' => ['$ref' => 'leaf.yml']],
        ]);
        $out = Compose::properties(['$ref' => ['left.yml', 'right.yml']], $loader);
        $this->assertSame(['x' => ['type' => 'text']], $out);
    }

    // --- $ref format errors ----------------------------------------------

    public function testEmptyStringPathIsFormatError(): void
    {
        $loader = new MemoryLoader([]);
        try {
            Ref::resolve('', '', $loader);
            $this->fail('expected format error');
        } catch (ComposeLoadError $e) {
            $this->assertSame('REF_FORMAT_ERROR', $e->code);
        }
    }

    public function testEmptyPathInsideParensIsFormatError(): void
    {
        $loader = new MemoryLoader([]);
        try {
            Ref::resolve('().keys', '', $loader);
            $this->fail('expected load error');
        } catch (ComposeLoadError $e) {
            $this->assertSame('REF_FORMAT_ERROR', $e->code);
        }
    }

    // --- $ref declaration order (legacy positional array_merge) ---------------

    public function testSiblingBeforeRefIsOverriddenByBase(): void
    {
        $loader = new MemoryLoader(['base.yml' => ['properties' => ['a' => ['from' => 'base']]]]);
        // a declared first, then $ref → base overrides a.
        $out = Compose::properties(['a' => ['from' => 'own'], '$ref' => 'base.yml'], $loader);
        $this->assertSame(['a' => ['from' => 'base']], $out);
    }

    public function testSiblingAfterRefOverridesBase(): void
    {
        $loader = new MemoryLoader(['base.yml' => ['properties' => ['a' => ['from' => 'base']]]]);
        $out = Compose::properties(['$ref' => 'base.yml', 'a' => ['from' => 'own']], $loader);
        $this->assertSame(['a' => ['from' => 'own']], $out);
    }
}

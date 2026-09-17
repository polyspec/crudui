<?php

declare(strict_types=1);

namespace CRUDUI\Generator\Tests;

use CRUDUI\Form;
use CRUDUI\FormError;
use CRUDUI\Generator;
use CRUDUI\Validator\Compose\ComposeLoadError;
use PHPUnit\Framework\TestCase;
use stdClass;

/**
 * Byte strings that are not UTF-8 are invalid text in every generator input
 * (docs/spec/input-text.md); the shared JSON cases run through the native generator suite.
 */
final class InputTextTest extends TestCase
{
    private static function failure(callable $run): array
    {
        try {
            $run();
        } catch (ComposeLoadError $error) {
            return ['INVALID_TEXT' === $error->getErrorCode() ? 'load' : 'other', \implode('.', $error->getCompositionTrace())];
        } catch (FormError $error) {
            return [$error->getErrorCode(), $error->getMessage()];
        }
        return ['none', ''];
    }

    public function testGeneratorOperationsRejectInvalidUtf8(): void
    {
        $bad = \chr(0xed) . \chr(0xa0) . \chr(0x80);
        $message = static fn (string $name) => ['INVALID_FORM_INPUT', 'Text must be Unicode scalar values: ' . $name];
        $spec = static fn (mixed $label) => (object) ['type' => 'group', 'properties' => (object) ['name' => (object) ['type' => 'text', 'label' => $label], 'rows' => (object) ['type' => 'group', 'multiple' => true, 'properties' => (object) ['v' => (object) ['type' => 'text']]]]];
        self::assertSame(['load', 'properties.name.label'], self::failure(static fn () => Generator::compileForm($spec('x' . $bad))));
        self::assertSame(['load', 'b.yml.x'], self::failure(static fn () => Generator::compileForm($spec('x'), ['files' => ['b.yml' => (object) ['x' => $bad]]])));
        self::assertSame($message('options.keyPrefix'), self::failure(static fn () => Generator::compileForm($spec('x'), ['keyPrefix' => $bad])));
        $template = Generator::compileForm($spec('x'));
        self::assertSame($message('data.rows.k.v'), self::failure(static fn () => Generator::bindForm($template, ['rows' => ['k' => ['v' => $bad]]])));
        self::assertSame($message('options.language'), self::failure(static fn () => Generator::bindButtons($template, [], ['unsupported' => $bad, 'language' => $bad])));
        $tampered = clone $template;
        $tampered->keyPrefix = $bad;
        self::assertSame($message('template.keyPrefix'), self::failure(static fn () => new Form($tampered, [$bad => 1])));
        $form = new Form($template, ['rows' => ['k' => ['v' => 'a']]]);
        self::assertSame($message('path'), self::failure(static fn () => $form->setValue('name' . $bad, 'x')));
        self::assertSame($message('value.1'), self::failure(static fn () => $form->setValue('name', ['ok', $bad])));
        self::assertSame($message('options.afterKey'), self::failure(static fn () => $form->addRow('rows', ['key' => $bad, 'afterKey' => $bad])));
        self::assertSame($message('newKey'), self::failure(static fn () => $form->rekeyRow('rows', 'k', $bad)));
        $list = ['columns' => ['v' => ['field' => 'v']]];
        self::assertSame($message('rows.1.v'), self::failure(static fn () => Generator::renderList($list, [['v' => 'a'], ['v' => $bad]], ['page' => 0])));
        self::assertSame($message('options.data.a'), self::failure(static fn () => Generator::buildList($list, [], ['layout' => $bad, 'data' => ['a' => $bad]])));
        self::assertSame($message('record.v'), self::failure(static fn () => Generator::renderDetail(['fields' => ['v' => ['field' => 'v']]], ['v' => $bad])));
        self::assertSame(['none', ''], self::failure(static fn () => Generator::buildDetail(['fields' => new stdClass()], ['v' => "\u{1F600}"])));
    }
}

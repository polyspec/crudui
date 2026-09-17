<?php

declare(strict_types=1);

namespace CRUDUI\Generator\Tests;

use PHPUnit\Framework\TestCase;
use CRUDUI\Generator;
use CRUDUI\Generator\Buttons;
use CRUDUI\Generator\Messages;
use CRUDUI\Generator\Rendering;
use CRUDUI\Generator\Value;
use stdClass;

final class RenderingConformanceTest extends TestCase
{
    public static function forms(): array
    {
        return self::fixtures('form-render');
    }

    private static function fixtures(string $directory): array
    {
        $cases = json_decode(file_get_contents(__DIR__ . '/../../../tests/fixtures/' . $directory . '/cases.json'), false, 512, JSON_THROW_ON_ERROR);
        $out = [];
        foreach ($cases as $case) {
            $out[$case->name] = [$case];
        }
        return $out;
    }

    /** @dataProvider forms */
    public function testFormLayoutMatchesTheSharedFixture(stdClass $case): void
    {
        try {
            $options = (array) ($case->options ?? new stdClass());
            $template = Generator::compileForm($case->spec, $options);
            $fields = Generator::bindForm($template, $case->data ?? [], $options);
            $language = $options['language'] ?? 'ko';
            $buttons = Buttons::bind($template, Value::object($case->data ?? []), $language);
            $messages = Messages::forLanguage($language);
            $actual = Rendering::form($fields, $buttons, $messages);
        } catch (\Throwable $error) {
            if (!isset($case->expectError)) {
                throw $error;
            }
            self::assertTrue(method_exists($error, 'getErrorCode'));
            self::assertSame($case->expectError->code, $error->getErrorCode());
            return;
        }
        self::assertFalse(isset($case->expectError), 'Expected generation error');
        self::assertSame(self::html($case->expected_html), self::html($actual));
        self::assertSame($actual, Rendering::form(Generator::bindForm($template, $case->data ?? [], $options), $buttons, $messages));
    }

    /**
     * Parse layout structure with the HTML5 parser, as the shared JavaScript normalizer does,
     * while retaining all field identifiers, values and script text.
     */
    private static function html(string $html): array
    {
        $document = \Dom\HTMLDocument::createFromString('<!doctype html><html><body>' . $html . '</body></html>', LIBXML_NOERROR, 'UTF-8');
        return self::children($document->body, false);
    }

    private static function children(\Dom\Node $parent, bool $preserve): array
    {
        $out = [];
        foreach ($parent->childNodes as $node) {
            if ($node instanceof \Dom\Text) {
                if ($preserve || trim($node->wholeText) !== '') {
                    $out[] = ['text' => $node->wholeText];
                }
                continue;
            }
            if (!$node instanceof \Dom\Element) {
                continue;
            }
            $attrs = [];
            foreach ($node->attributes as $attribute) {
                $value = $attribute->value;
                if (in_array($attribute->name, ['checked', 'selected', 'disabled', 'readonly', 'multiple', 'required', 'autofocus'], true)) {
                    $value = '';
                }
                if ($attribute->name === 'style') {
                    $value = \CRUDUI\Generator\Style::canonical($value) ?? '';
                }
                if (in_array($attribute->name, ['class', 'style'], true) && $value === '') {
                    continue;
                }
                $attrs[$attribute->name] = $value;
            }
            ksort($attrs, SORT_STRING);
            $out[] = ['tag' => $node->localName, 'attributes' => $attrs, 'children' => self::children($node, $preserve || in_array($node->localName, ['textarea', 'pre', 'script', 'style'], true))];
        }
        return $out;
    }
}

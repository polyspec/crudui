<?php

declare(strict_types=1);

namespace CRUDUI\Generator\Tests;

use PHPUnit\Framework\TestCase;
use CRUDUI\Generator;
use CRUDUI\Generator\Rendering;
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
            $actual = Rendering::element('div', ['class' => 'form-group'], Rendering::fields($fields));
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
        self::assertSame($actual, Rendering::element('div', ['class' => 'form-group'], Rendering::fields(Generator::bindForm($template, $case->data ?? [], $options))));
    }

    /** Parse layout structure while retaining all field identifiers, values and script text. */
    private static function html(string $html): array
    {
        $document = new \DOMDocument();
        $errors = libxml_use_internal_errors(true);
        try {
            $document->loadHTML('<?xml encoding="UTF-8"?><html><body>' . $html . '</body></html>', LIBXML_NONET | LIBXML_NOERROR | LIBXML_NOWARNING);
        } finally {
            libxml_clear_errors();
            libxml_use_internal_errors($errors);
        }
        $body = $document->getElementsByTagName('body')->item(0);
        return self::children($body, false);
    }

    private static function children(\DOMNode $parent, bool $preserve): array
    {
        $out = [];
        foreach ($parent->childNodes as $node) {
            if ($node instanceof \DOMText) {
                if ($preserve || trim($node->wholeText) !== '') {
                    $out[] = ['text' => $node->wholeText];
                }
                continue;
            }
            if (!$node instanceof \DOMElement) {
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
            $out[] = ['tag' => $node->tagName, 'attributes' => $attrs, 'children' => self::children($node, $preserve || in_array($node->tagName, ['textarea', 'pre', 'script', 'style'], true))];
        }
        return $out;
    }
}

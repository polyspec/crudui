<?php

declare(strict_types=1);

namespace CRUDUI\Generator\Tests;

use PHPUnit\Framework\TestCase;
use CRUDUI\Form;
use CRUDUI\FormError;
use CRUDUI\Generator;
use stdClass;

final class FormTest extends TestCase
{
    public function testInvalidUtf8ValuesAndObjectKeysPreserveTheCompleteFormState(): void
    {
        $form = new Form(Generator::compileForm(self::object('{"type":"group","properties":{"name":{"type":"text"}}}')), ['name' => '한글 🎉']);
        $before = json_encode([$form->getData(), $form->getFields(), Generator::renderForm($form), $form->getRevision()], JSON_THROW_ON_ERROR);
        foreach ([['name' => "\xC3\x28"], (object) ["key\xFF" => 'value']] as $data) {
            try {
                $form->setData($data);
                self::fail('Invalid UTF-8 must fail before committing form data');
            } catch (FormError $error) {
                self::assertSame('INVALID_FORM_INPUT', $error->getErrorCode());
            }
            self::assertSame($before, json_encode([$form->getData(), $form->getFields(), Generator::renderForm($form), $form->getRevision()], JSON_THROW_ON_ERROR));
        }
    }

    private static function object(string $json): stdClass
    {
        return json_decode($json, false, 512, JSON_THROW_ON_ERROR);
    }

    private static function template(): stdClass
    {
        return Generator::compileForm(self::object(<<<'JSON'
        {"type":"group","properties":{"enabled":{"type":"checkbox","label":"Enabled"},"note":{"type":"textarea","label":"Note","design":{"show":".enabled","class":{".enabled":"active","true":""}}},"options":{"type":"multichoice","items":{"a":"Alpha","b":"Beta"}},"companies":{"type":"group","multiple":{"copy":true,"sortable":true},"properties":{"name":{"type":"text","default":"New company"},"stores":{"type":"group","multiple":true,"properties":{"name":{"type":"text","default":"New store"},"id":{"type":"text"}}}}}}}
        JSON), ['keyPrefix' => 'form']);
    }

    private static function record(): stdClass
    {
        return self::object(<<<'JSON'
        {"enabled":true,"note":"A\nB","options":["b","a"],"companies":{"__0000000000005__":{"name":"Five","stores":{"__0000000000005__":{"name":"Five store","id":"ordinary-value"}}},"__0000000000007__":{"name":"Seven","stores":{}},"__0000000000001__":{"name":"One","stores":{}}}}
        JSON);
    }

    public function testCachedStructureAndInjectionProduceIdenticalHtmlAndData(): void
    {
        $template = self::template();
        $cache = json_encode($template, JSON_THROW_ON_ERROR);
        $initial = new Form($template, self::record(), ['language' => 'en', 'idPrefix' => 'record']);
        $injected = new Form(self::object($cache), ['companies' => new stdClass()], ['language' => 'en', 'idPrefix' => 'record']);
        $injected->setData(self::record());
        $html = Generator::renderForm($initial);
        self::assertSame($html, Generator::renderForm($injected));
        self::assertSame(json_encode($initial->getData()), json_encode($injected->getData()));
        $injected->setData(self::record());
        self::assertSame($html, Generator::renderForm($injected));
        $other = self::record();
        $other->enabled = false;
        $other->note = 'Replacement';
        $other->options = [];
        $injected->setData($other);
        self::assertStringContainsString('<div class="crudui-node crudui-node--field" data-field-path="note" hidden="">', Generator::renderForm($injected));
        $injected->setData(self::record());
        self::assertSame($html, Generator::renderForm($injected));
        self::assertSame($cache, json_encode($template, JSON_THROW_ON_ERROR));
        self::assertSame(['__0000000000005__', '__0000000000007__', '__0000000000001__'], array_keys((array) $initial->getData()->companies));
    }

    public function testCompilationPreservesObjectAndArrayDefaultsAndReferenceOrder(): void
    {
        $template = Generator::compileForm(self::object('{"type":"group","properties":{"$ref":"base","$patch":{"replace":{"payload.default.empty":{}}}}}'), ['files' => self::object('{"base":{"properties":{"payload":{"type":"text","default":{"empty":[],"array":[],"null":null,"numeric":{"0":"a","1":"b"}}},"last":{"type":"text"}}}}')]);
        self::assertSame(['payload', 'last'], array_map(static fn ($field) => $field->name, $template->fields));
        $default = $template->fields[0]->spec->default;
        self::assertInstanceOf(stdClass::class, $default->empty);
        self::assertSame([], $default->array);
        self::assertNull($default->null);
        self::assertInstanceOf(stdClass::class, $default->numeric);
        $form = new Form($template);
        self::assertSame(json_encode($default), json_encode($form->getData()->payload));
    }

    public function testReturnedDataFieldsAndTemplateAreDetached(): void
    {
        $template = self::template();
        $form = new Form($template, self::record());
        $html = Generator::renderForm($form);
        $template->fields[0]->spec->label = 'Modified';
        $form->getTemplate()->fields[0]->spec->label = 'Modified again';
        $form->getData()->companies->__0000000000005__->name = 'Changed';
        $form->getFields()[0]->label = 'Changed';
        self::assertSame($html, Generator::renderForm($form));
        self::assertSame('Five', $form->getData()->companies->__0000000000005__->name);
    }

    public function testPatchRemovalPreservesAnEmptyObjectDefault(): void
    {
        $spec = self::object('{"type":"group","properties":{"value":{"type":"text","$patch":{"default.x":1,"remove":["default.x"]}}}}');
        $template = Generator::compileForm($spec);
        self::assertSame('{"kind":"crudui/form-template","fields":[{"name":"value","spec":{"type":"text","default":{}},"children":[]}]}', json_encode($template, JSON_UNESCAPED_SLASHES));
        self::assertSame('{"value":{}}', json_encode((new Form($template))->getData()));
    }

    public function testCopyIsScopedAndRegeneratesOnlyCopiedNestedKeys(): void
    {
        $form = new Form(self::template(), self::record());
        $key = $form->copyRow('companies', '__0000000000005__', ['key' => 'copy']);
        self::assertSame('copy', $key);
        $data = $form->getData();
        $keys = array_keys((array) $data->companies->copy->stores);
        self::assertCount(1, $keys);
        self::assertMatchesRegularExpression('/^__[a-f0-9]{13}__$/', $keys[0]);
        self::assertNotSame('__0000000000005__', $keys[0]);
        self::assertSame('ordinary-value', $data->companies->copy->stores->{$keys[0]}->id);
        self::assertSame('Five store', $data->companies->__0000000000005__->stores->__0000000000005__->name);
        self::assertSame(['__0000000000005__', 'copy', '__0000000000007__', '__0000000000001__'], array_keys((array) $data->companies));
        $form->copyRow('companies.__0000000000005__.stores', '__0000000000005__', ['key' => 'new-store']);
        self::assertSame('Five', $form->getData()->companies->__0000000000005__->name);
        self::assertCount(2, (array) $form->getData()->companies->__0000000000005__->stores);
    }

    public function testRowsReorderRekeyRemoveAndAddAfterExplicitEmpty(): void
    {
        $form = new Form(self::template(), self::record());
        $form->moveRow('companies', '__0000000000001__', 0);
        self::assertSame(['__0000000000001__', '__0000000000005__', '__0000000000007__'], array_keys((array) $form->getData()->companies));
        $form->rekeyRow('companies', '__0000000000005__', Generator::sequenceRowKey(42));
        self::assertStringContainsString('form[companies][__0000000000042__][stores][__0000000000005__][name]', Generator::renderForm($form));
        self::assertStringContainsString('companies[][stores][][name]', Generator::renderForm($form));
        foreach (array_keys((array) $form->getData()->companies) as $key) {
            $form->removeRow('companies', $key);
        }
        self::assertInstanceOf(stdClass::class, $form->getData()->companies);
        self::assertSame('{}', json_encode($form->getData()->companies));
        self::assertStringContainsString('<div class="crudui-node__footer"><div class="crudui-controls" role="group" aria-label="컬렉션 컨트롤"><button type="button" class="crudui-action" data-crudui-action="add-row" aria-label="추가"></button></div></div>', Generator::renderForm($form));
        $form->addRow('companies', ['key' => 'blank', 'value' => ['stores' => new stdClass()]]);
        self::assertSame('New company', $form->getData()->companies->blank->name);
        self::assertSame('{}', json_encode($form->getData()->companies->blank->stores));
    }

    public function testInvalidOperationsLeaveDataFieldsAndRevisionUnchanged(): void
    {
        $form = new Form(self::template(), self::record());
        $before = [json_encode($form->getData()), json_encode($form->getFields()), Generator::renderForm($form), $form->getRevision()];
        $operations = [fn () => $form->addRow('companies', ['key' => '__0000000000005__']), fn () => $form->addRow('companies', ['key' => 'valid', 'afterKey' => 'absent']), fn () => $form->addRow('companies', ['key' => '13']), fn () => $form->addRow('companies', ['value' => null]), fn () => $form->moveRow('companies', '__0000000000005__', 99), fn () => $form->rekeyRow('companies', 'absent', 'new'), fn () => $form->rekeyRow('companies', '__0000000000005__', '__0000000000007__'), fn () => $form->removeRow('companies', 'absent'), fn () => $form->setData(['companies' => []]), fn () => $form->setValue('companies', null), fn () => $form->addRow('companies.__0000000000005__.unknown')];
        foreach ($operations as $operation) {
            try {
                $operation();
                self::fail('Invalid operation must fail');
            } catch (FormError $error) {
                self::assertSame('INVALID_FORM_INPUT', $error->getErrorCode());
            }
            self::assertSame($before, [json_encode($form->getData()), json_encode($form->getFields()), Generator::renderForm($form), $form->getRevision()]);
        }
    }

    public function testRowLimitsRejectChangesAtomically(): void
    {
        $template = Generator::compileForm(self::object('{"type":"group","properties":{"tags":{"type":"text","multiple":{"min":1,"max":1}}}}'));
        $form = new Form($template, ['tags' => ['one' => 'A']]);
        foreach ([fn () => $form->addRow('tags', ['key' => 'two']), fn () => $form->removeRow('tags', 'one')] as $operation) {
            try {
                $operation();
                self::fail('Row count limit must fail');
            } catch (FormError) {
            }
            self::assertSame('{"tags":{"one":"A"}}', json_encode($form->getData()));
            self::assertSame(0, $form->getRevision());
        }
    }

    public function testMissingAndExplicitNullObjectAndArrayRemainDistinct(): void
    {
        $template = Generator::compileForm(self::object('{"type":"group","properties":{"value":{"type":"text","default":"default"},"tags":{"type":"text","multiple":true}}}'));
        $form = new Form($template, ['value' => null, 'tags' => new stdClass(), 'empty' => new stdClass(), 'array' => []]);
        self::assertSame('{"value":null,"tags":{},"empty":{},"array":[]}', json_encode($form->getData()));
        $form->addRow('tags', ['key' => 'null-row', 'value' => null]);
        self::assertNull($form->getData()->tags->{'null-row'});
        $form->addRow('tags', ['key' => 'empty-row']);
        self::assertSame('', $form->getData()->tags->{'empty-row'});
        self::assertSame('default', (new Form($template, ['tags' => new stdClass()]))->getData()->value);
    }

    public function testLabelsSelectionsAndEscapingUseTheResolvedControlIds(): void
    {
        $form = new Form(self::template(), self::record(), ['idPrefix' => 'scope[]']);
        $html = Generator::renderForm($form);
        $dom = new \DOMDocument();
        @$dom->loadHTML('<?xml encoding="utf-8" ?>' . $html);
        $xpath = new \DOMXPath($dom);
        foreach ($xpath->query('//label[@for]') as $label) {
            self::assertNotNull($dom->getElementById($label->getAttribute('for')));
        }
        self::assertSame(2, $xpath->query('//input[@type="checkbox" and @name="form[options][]" and @checked]')->length);
        $form->setValue('note', '<script>bad</script> & "quoted"');
        self::assertStringContainsString('&lt;script&gt;bad&lt;/script&gt; &amp; &quot;quoted&quot;', Generator::renderForm($form));
        self::assertStringNotContainsString('<script>bad</script>', Generator::renderForm($form));
    }

    public function testRowsHaveTitlesStickyHeadersAndControlPlacement(): void
    {
        $template = Generator::compileForm(self::object('{"type":"group","properties":{"items":{"type":"group","label":"Items","multiple":{"title":"name","controls":"footer","header":"sticky","max":2},"properties":{"name":{"type":"text"},"tags":{"type":"text","multiple":{"controls":"outline"}}}}}}'));
        $form = new Form($template, ['items' => ['first' => ['name' => '', 'tags' => ['a' => 'x', 'b' => 'y']], 'second' => ['name' => 'Second', 'tags' => new stdClass()]]], ['language' => 'en', 'idPrefix' => 'f']);
        $row = $form->getFields()[0]->children[0];
        self::assertSame(['kind', 'key', 'className', 'hidden', 'controls', 'sticky', 'stickyDepth', 'header', 'body', 'collapsible', 'expanded', 'toggleLabel', 'children'], array_keys((array) $row));
        self::assertSame('{"className":"","label":"Items","number":"1","title":"(untitled)","summary":"Nested rows: 2"}', json_encode($row->header));
        self::assertSame([true, true], [$row->controls->actions[0]->disabled, !property_exists($row->children[1], 'controls')]);
        $html = Generator::renderForm($form);
        self::assertStringContainsString('<div class="crudui-node crudui-node--row crudui-node--sticky" style="--crudui-sticky-depth:0" data-crudui-row-key="first"><div class="crudui-node__header">', $html);
        self::assertStringContainsString('<span class="crudui-node__title">Second</span>', $html);
        self::assertStringContainsString('<div class="crudui-node__footer"><div class="crudui-controls" role="group" aria-label="Row controls">', $html);
        // An empty collection keeps its controls in the form even with multiple.controls: outline.
        self::assertStringContainsString('<div class="crudui-node__footer"><div class="crudui-controls" role="group" aria-label="Collection controls">', $html);
    }

    public function testMultipleDeclarationsAndLanguagesAreRejected(): void
    {
        $cases = [
            ['{"type":"text","multiple":{"title":"name"}}', 'Invalid multiple.title at rows: expected a repeated group'],
            ['{"type":"group","multiple":{"title":"missing"},"properties":{"name":{"type":"text"}}}', 'Invalid multiple.title at rows: expected the name of a direct child field without multiple, properties or lang'],
            ['{"type":"group","multiple":{"title":"name"},"properties":{"name":{"type":"text","lang":true}}}', 'Invalid multiple.title at rows: expected the name of a direct child field without multiple, properties or lang'],
            ['{"type":"group","multiple":{"controls":"side"},"properties":{}}', 'Invalid multiple.controls at rows: expected header, footer or outline'],
            ['{"type":"text","multiple":{"header":true}}', 'Invalid multiple.header at rows: expected static or sticky'],
            ['{"type":"text","lang":null}', 'Invalid lang at rows: expected a boolean or an object'],
            ['{"type":"text","lang":"ko"}', 'Invalid lang at rows: expected a boolean or an object'],
            ['{"type":"text","lang":["ko"]}', 'Invalid lang at rows: expected a boolean or an object'],
            ['{"type":"text","multiple":"yes","lang":null}', 'Invalid multiple at rows: expected a boolean or an object'],
            ['{"type":"text","lang":null,"design":[]}', 'Invalid lang at rows: expected a boolean or an object'],
            ['{"type":"text","lang":{"only":"ko"}}', 'Invalid lang.only at rows: expected a list of language codes or an object'],
            ['{"type":"text","lang":{"only":null}}', 'Invalid lang.only at rows: expected a list of language codes or an object'],
            ['{"type":"text","lang":{"only":["ko",3]}}', 'Invalid lang.only at rows: expected a list of language codes or an object'],
        ];
        foreach (['{"type":"text","lang":{"only":[]}}', '{"type":"text","lang":{"only":{}}}', '{"type":"text","lang":{"only":["ko","en"]}}'] as $field) {
            self::assertCount(1, Generator::compileForm(self::object('{"type":"group","properties":{"rows":' . $field . '}}'))->fields);
        }
        $options = [[['language' => 5, 'keyPrefix' => 1], 'Language must be a string'], [['language' => 'fr', 'keyPrefix' => 1], 'keyPrefix must be a string'], [['idPrefix' => ['x'], 'unsupported' => true], 'idPrefix must be a string'], [['language' => 'fr', 'unsupported' => false], 'unsupported must be throw or marker'], [['language' => 'fr', 'unsupported' => 'other'], 'unsupported must be throw or marker'], [['idPrefix' => 'x', 'unsupported' => 'Marker'], 'unsupported must be throw or marker'], [['language' => 'fr', 'idPrefix' => null, 'keyPrefix' => null, 'unsupported' => null], 'Unsupported language: fr']];
        foreach ($options as [$option, $message]) {
            foreach ([fn () => Generator::bindForm(self::template(), [], $option), fn () => new Form(self::template(), [], $option)] as $operation) {
                try {
                    $operation();
                    self::fail('Invalid option must fail');
                } catch (FormError $error) {
                    self::assertSame(['INVALID_FORM_INPUT', $message, ''], [$error->getErrorCode(), $error->getMessage(), $error->getPath()]);
                }
            }
        }
        foreach (['{"type":"text","lang":{}}', '{"type":"text","lang":false}', '{"type":"text","lang":{"only":["en"]}}'] as $field) {
            self::assertCount(1, Generator::compileForm(self::object('{"type":"group","properties":{"rows":' . $field . '}}'))->fields);
        }
        foreach ($cases as [$field, $message]) {
            try {
                Generator::compileForm(self::object('{"type":"group","properties":{"rows":' . $field . '}}'));
                self::fail('Invalid declaration must fail');
            } catch (FormError $error) {
                self::assertSame(['INVALID_FORM_INPUT', $message], [$error->getErrorCode(), $error->getMessage()]);
            }
        }
        $languages = [['fr', 'Unsupported language: fr'], ['', 'Unsupported language: '], [5, 'Language must be a string'], [true, 'Language must be a string'], [['ko'], 'Language must be a string'], [(object) ['ko' => 1], 'Language must be a string']];
        foreach ($languages as [$language, $message]) {
            foreach ([fn () => Generator::bindForm(self::template(), [], ['language' => $language]), fn () => new Form(self::template(), [], ['language' => $language])] as $operation) {
                try {
                    $operation();
                    self::fail('Unsupported language must fail');
                } catch (FormError $error) {
                    self::assertSame(['INVALID_FORM_INPUT', $message, ''], [$error->getErrorCode(), $error->getMessage(), $error->getPath()]);
                }
            }
        }
        self::assertSame('0개', Generator::bindForm(self::template(), ['companies' => new stdClass()], ['language' => null])[3]->header->count);
    }

    public function testUnsupportedTypeHasStableCodeAndPath(): void
    {
        $template = Generator::compileForm(self::object('{"type":"group","properties":{"custom":{"type":"unknown"}}}'));
        try {
            new Form($template);
            self::fail('Unsupported field must fail');
        } catch (FormError $error) {
            self::assertSame('UNSUPPORTED_FIELD_TYPE', $error->getErrorCode());
            self::assertSame('custom', $error->getPath());
        }
    }

    public function testSequenceKeysAndRandomKeys(): void
    {
        self::assertSame('__0000000000000__', Generator::sequenceRowKey(0));
        self::assertSame('__9999999999999__', Generator::sequenceRowKey('9999999999999'));
        foreach ([-1, '10000000000000', '1.5', 'bad'] as $input) {
            try {
                Generator::sequenceRowKey($input);
                self::fail('Invalid sequence must fail');
            } catch (FormError) {
                self::assertTrue(true);
            }
        }
        $keys = [];
        for ($i = 0; $i < 50; $i++) {
            $key = Generator::createRowKey();
            self::assertMatchesRegularExpression('/^__[a-f0-9]{13}__$/', $key);
            $keys[] = $key;
        }
        self::assertCount(50, array_unique($keys));
    }

    public function testRecursiveAndUnsupportedValuesFail(): void
    {
        $template = self::template();
        $object = new stdClass();
        $object->self = $object;
        foreach ([$object, ['bad' => new \DateTimeImmutable()], ['bad' => INF]] as $data) {
            try {
                new Form($template, $data);
                self::fail('Unsupported value must fail');
            } catch (FormError $error) {
                self::assertSame('INVALID_FORM_INPUT', $error->getErrorCode());
            }
        }
    }
}

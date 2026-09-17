<?php

declare(strict_types=1);

namespace CRUDUI\Generator\Tests;

use CRUDUI\FormError;
use CRUDUI\Generator;
use PHPUnit\Framework\TestCase;

/** Public button binding and markup match the JavaScript output byte for byte. */
final class ButtonsTest extends TestCase
{
    private const SPEC = <<<'JSON'
{"type":"group","properties":{"name":{"type":"string"}},"buttons":[
 {"type":"link","text":{"ko":"목록","en":"List"},"href":"/items?a=1&b=\"2\""},
 {"type":"submit","name":"intent","value":"save"},
 {"type":"button","text":"Hi <b>&","design":{"class":{".name == 'A'":"wide","true":"narrow"},"style":"color: red"},"behavior":{"onclick":"go(\"x\")"}},
 {"type":"reset","behavior":{"onclick":{"label":"L","script":"reset()"}}}
]}
JSON;

    /** JavaScript bindButtons and formButtonsHtml results for each case. */
    private const EXPECTED = [
        'declaredEn' => ['[{"type":"link","tag":"a","text":"List","attrs":{"class":"crudui-action crudui-action--text","href":"/items?a=1&b=\\"2\\""}},{"type":"submit","tag":"button","text":"Save","attrs":{"type":"submit","class":"crudui-action crudui-action--text","name":"intent","value":"save"}},{"type":"button","tag":"button","text":"Hi <b>&","attrs":{"type":"button","class":"crudui-action crudui-action--text wide","style":"color: red","onclick":"go(\\"x\\")"}},{"type":"reset","tag":"button","text":"Reset","attrs":{"type":"reset","class":"crudui-action crudui-action--text","onclick":"reset()"}}]', '<a class="crudui-action crudui-action--text" href="/items?a=1&amp;b=&quot;2&quot;">List</a><button type="submit" class="crudui-action crudui-action--text" name="intent" value="save">Save</button><button type="button" class="crudui-action crudui-action--text wide" style="color: red" onclick="go(&quot;x&quot;)">Hi &lt;b&gt;&amp;</button><button type="reset" class="crudui-action crudui-action--text" onclick="reset()">Reset</button>'],
        'declaredKo' => ['[{"type":"link","tag":"a","text":"목록","attrs":{"class":"crudui-action crudui-action--text","href":"/items?a=1&b=\\"2\\""}},{"type":"submit","tag":"button","text":"저장","attrs":{"type":"submit","class":"crudui-action crudui-action--text","name":"intent","value":"save"}},{"type":"button","tag":"button","text":"Hi <b>&","attrs":{"type":"button","class":"crudui-action crudui-action--text narrow","style":"color: red","onclick":"go(\\"x\\")"}},{"type":"reset","tag":"button","text":"초기화","attrs":{"type":"reset","class":"crudui-action crudui-action--text","onclick":"reset()"}}]', '<a class="crudui-action crudui-action--text" href="/items?a=1&amp;b=&quot;2&quot;">목록</a><button type="submit" class="crudui-action crudui-action--text" name="intent" value="save">저장</button><button type="button" class="crudui-action crudui-action--text narrow" style="color: red" onclick="go(&quot;x&quot;)">Hi &lt;b&gt;&amp;</button><button type="reset" class="crudui-action crudui-action--text" onclick="reset()">초기화</button>'],
        'defaultKo' => ['[{"type":"submit","tag":"button","text":"저장","attrs":{"type":"submit","class":"crudui-action crudui-action--text"}}]', '<button type="submit" class="crudui-action crudui-action--text">저장</button>'],
        'defaultEn' => ['[{"type":"submit","tag":"button","text":"Save","attrs":{"type":"submit","class":"crudui-action crudui-action--text"}}]', '<button type="submit" class="crudui-action crudui-action--text">Save</button>'],
    ];

    public static function cases(): iterable
    {
        yield 'declared buttons in English' => ['declaredEn', self::SPEC, ['name' => 'A'], ['language' => 'en']];
        yield 'declared buttons in Korean' => ['declaredKo', self::SPEC, [], []];
        yield 'default submit button' => ['defaultKo', '{"type":"group","properties":{}}', [], []];
        yield 'default submit button in English' => ['defaultEn', '{"type":"group","properties":{}}', [], ['language' => 'en']];
    }

    #[\PHPUnit\Framework\Attributes\DataProvider('cases')]
    public function testButtonsMatchJavaScript(string $name, string $spec, array $data, array $options): void
    {
        [$json, $html] = self::EXPECTED[$name];
        $buttons = Generator::bindButtons(Generator::compileForm(json_decode($spec)), $data, $options);
        self::assertSame($json, json_encode($buttons, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR));
        self::assertSame($html, Generator::formButtonsHtml($buttons));
        self::assertSame($html, Generator::formButtonsHtml(json_decode($json)));
    }

    public function testInputChecksMatchFormBinding(): void
    {
        $template = Generator::compileForm(json_decode('{"type":"group","properties":{}}'));
        foreach ([
            [fn () => Generator::bindButtons((object) ['kind' => 'other']), 'Unsupported form template'],
            [fn () => Generator::bindButtons($template, [], ['language' => 1]), 'Language must be a string'],
        ] as [$call, $message]) {
            try {
                $call();
                self::fail('Expected a form error');
            } catch (FormError $error) {
                self::assertSame('INVALID_FORM_INPUT', $error->getErrorCode());
                self::assertSame($message, $error->getMessage());
            }
        }
    }

    public static function invalidButtons(): iterable
    {
        yield 'not an object' => ['[1]'];
        yield 'null element' => ['[null]'];
        yield 'list element' => ['[[]]'];
        yield 'missing tag' => ['[{"text":"A","attrs":{}}]'];
        yield 'unknown tag' => ['[{"tag":"div","text":"A","attrs":{}}]'];
        yield 'text not a string' => ['[{"tag":"a","text":1,"attrs":{}}]'];
        yield 'missing attrs' => ['[{"tag":"a","text":"A"}]'];
        yield 'attrs a list' => ['[{"tag":"a","text":"A","attrs":[]}]'];
        yield 'unknown attribute' => ['[{"tag":"a","text":"A","attrs":{"id":"x"}}]'];
        yield 'attribute not a string' => ['[{"tag":"button","text":"A","attrs":{"type":1}}]'];
        yield 'valid then invalid' => ['[{"tag":"a","text":"A","attrs":{}},{"tag":"a"}]'];
    }

    #[\PHPUnit\Framework\Attributes\DataProvider('invalidButtons')]
    public function testFormButtonsHtmlRejectsUnevaluatedButtons(string $buttons): void
    {
        $this->expectFormError(fn () => Generator::formButtonsHtml(json_decode($buttons)), 'Form buttons must be evaluated button objects');
        $expected = '{"error":{"code":"INVALID_FORM_INPUT","message":"Form buttons must be evaluated button objects","at":""}}';
        self::assertSame($expected, self::invoke(['operation' => 'formButtonsHtml', 'buttons' => json_decode($buttons)]));
    }

    public function testFormButtonsHtmlRequiresAList(): void
    {
        $this->expectFormError(fn () => Generator::formButtonsHtml(['a' => json_decode('{"tag":"a","text":"A","attrs":{}}')]), 'Form buttons must be a list');
        foreach (['{}', '"x"', 'null', '1'] as $buttons) {
            self::assertSame('{"error":{"code":"INVALID_FORM_INPUT","message":"Form buttons must be a list","at":""}}', self::invoke(['operation' => 'formButtonsHtml', 'buttons' => json_decode($buttons)]));
        }
    }

    public function testFormButtonsHtmlIgnoresOtherMembers(): void
    {
        self::assertSame('<a>A</a>', Generator::formButtonsHtml(json_decode('[{"type":1,"extra":[],"tag":"a","text":"A","attrs":{}}]')));
    }

    private function expectFormError(callable $call, string $message): void
    {
        try {
            $call();
            self::fail('Expected a form error');
        } catch (FormError $error) {
            self::assertSame(['INVALID_FORM_INPUT', $message, ''], [$error->getErrorCode(), $error->getMessage(), $error->getPath()]);
        }
    }

    public function testCliServesButtonOperations(): void
    {
        $template = Generator::compileForm(json_decode('{"type":"group","properties":{}}'));
        $buttons = self::invoke(['operation' => 'bindButtons', 'template' => $template, 'data' => new \stdClass(), 'options' => ['language' => 'en']]);
        self::assertSame(self::EXPECTED['defaultEn'][0], $buttons);
        self::assertSame(json_encode(self::EXPECTED['defaultEn'][1], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), self::invoke(['operation' => 'formButtonsHtml', 'buttons' => json_decode($buttons)]));
        self::assertStringContainsString('"code":"INVALID_FORM_INPUT"', self::invoke(['operation' => 'formButtonsHtml', 'buttons' => [1]]));
        self::assertStringContainsString('"code":"INVALID_FORM_INPUT"', self::invoke(['operation' => 'bindButtons']));
    }

    private static function invoke(array $request): string
    {
        $process = proc_open([PHP_BINARY, __DIR__ . '/../bin/generate.php'], [['pipe', 'r'], ['pipe', 'w'], ['pipe', 'w']], $pipes);
        fwrite($pipes[0], json_encode($request, JSON_THROW_ON_ERROR));
        fclose($pipes[0]);
        $output = stream_get_contents($pipes[1]);
        fclose($pipes[1]);
        fclose($pipes[2]);
        proc_close($process);
        return rtrim($output, "\n");
    }
}

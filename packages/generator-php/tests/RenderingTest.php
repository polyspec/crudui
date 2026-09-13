<?php

declare(strict_types=1);

namespace CRUDUI\Generator\Tests;

use PHPUnit\Framework\TestCase;
use CRUDUI\Form;
use CRUDUI\Generator;
use CRUDUI\Generator\Style;

final class RenderingTest extends TestCase
{
    public function testImagesIncludeOrderedDeduplicatedPreloadsAndKeepRawHtml(): void
    {
        $spec = json_decode('{"columns":{"image":{"field":".image","format":"image"},"raw":{"field":".raw","format":"html"}}}');
        $rows = json_decode('[{"image":"/b.png","raw":"<img src=\"/raw.png\">"},{"image":"/a.png"},{"image":"/b.png"},{"image":"data:image/png;base64,AA=="}]');
        $expected = '<link rel="preload" as="image" href="/b.png"/><link rel="preload" as="image" href="/a.png"/>' . '<div class="list-view"><table class="list-table"><thead><tr><th class="list-th" data-field=".image"><span class="list-th-label">image</span></th><th class="list-th" data-field=".raw"><span class="list-th-label">raw</span></th></tr></thead><tbody>' . '<tr><td class="list-td list-td-image"><img src="/b.png" alt=""/></td><td class="list-td list-td-html"><img src="/raw.png"></td></tr>' . '<tr><td class="list-td list-td-image"><img src="/a.png" alt=""/></td><td class="list-td list-td-html"></td></tr>' . '<tr><td class="list-td list-td-image"><img src="/b.png" alt=""/></td><td class="list-td list-td-html"></td></tr>' . '<tr><td class="list-td list-td-image"><img src="data:image/png;base64,AA==" alt=""/></td><td class="list-td list-td-html"></td></tr>' . '</tbody></table></div>';
        self::assertSame($expected, Generator::renderList($spec, $rows));
    }

    public function testCssPreservesQuotedSeparatorsCommentsNestedBlocksAndRepeatedProperties(): void
    {
        $source = ' color /* property */ : red; content: "a;b:c"; background: url("data:image/svg+xml;a:b"); --tokens: {a:[b;c]}; color: blue !important; tail: calc(1px + var(--x, 2px));';
        self::assertSame([['color', 'red'], ['content', '"a;b:c"'], ['background', 'url("data:image/svg+xml;a:b")'], ['--tokens', '{a:[b;c]}'], ['color', 'blue !important'], ['tail', 'calc(1px + var(--x, 2px))']], Style::declarations($source));
        self::assertSame('color:blue !important;content:"a;b:c";background:url("data:image/svg+xml;a:b");--tokens:{a:[b;c]};tail:calc(1px + var(--x, 2px))', Style::rendered($source));
        self::assertSame([['content', '"unterminated; text']], Style::declarations('content: "unterminated; text'));
        self::assertSame([['--x', '(a]; b:c)'], ['color', 'red']], Style::declarations('--x: (a]; b:c); color:red'));
    }

    public function testExplicitNullDisplayValuesDoNotUseDefaults(): void
    {
        $spec = json_decode('{"type":"group","properties":{"display":{"type":"dummy","default":"Default"}}}');
        $form = new Form(Generator::compileForm($spec), ['display' => null]);
        self::assertSame('<div class="crudui-form"><div class="crudui-form__body"><div class="crudui-node crudui-node--field" data-field-path="display"><div class="crudui-node__body"><div></div></div></div></div></div>', Generator::renderForm($form));
    }
}

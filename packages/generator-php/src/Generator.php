<?php

declare(strict_types=1);

namespace CRUDUI;

use CRUDUI\Generator\Binding;
use CRUDUI\Generator\Buttons;
use CRUDUI\Generator\Details;
use CRUDUI\Generator\InputText;
use CRUDUI\Generator\Lists;
use CRUDUI\Generator\Rendering;
use CRUDUI\Generator\Template;
use stdClass;

/** Compile form structures, bind values and render forms or lists. */
final class Generator
{
    /** Compile a JSON-serializable structure without record data. */
    public static function compileForm(array|stdClass $spec, array $options = []): stdClass
    {
        InputText::specification($spec, $options);
        InputText::inputs([], $options, ['basepath', 'keyPrefix']);
        return Template::compile($spec, $options);
    }

    /** Evaluate fields without modifying template or record data. */
    public static function bindForm(stdClass $template, array|stdClass $data = [], array $options = []): array
    {
        InputText::inputs([['template', $template], ['data', $data]], $options, InputText::BIND);
        return Binding::bind($template, $data, $options);
    }

    /** Evaluate the template buttons for a record as objects with type, tag, text and ordered attrs. */
    public static function bindButtons(stdClass $template, array|stdClass $data = [], array $options = []): array
    {
        InputText::inputs([['template', $template], ['data', $data]], $options, InputText::BIND);
        return Buttons::bindPublic($template, $data, $options);
    }

    /** Render evaluated buttons as the markup every renderer places in the form footer; reject any other element. */
    public static function formButtonsHtml(array $buttons): string
    {
        return Buttons::htmlPublic($buttons);
    }

    /** Render the current instance inside its crudui-form block. */
    public static function renderForm(Form $form): string
    {
        return Rendering::form($form->getFields(), $form->getButtons(), $form->getMessages());
    }

    /** Render supplied list rows using the table or card layout. */
    public static function renderList(array|stdClass $spec, array $rows, array $options = []): string
    {
        self::checkDisplay($spec, ['rows', $rows], $options);
        return Lists::render($spec, $rows, $options);
    }

    /** Build one read-only list model from supplied rows. */
    public static function buildList(array|stdClass $spec, array $rows = [], array $options = []): stdClass
    {
        self::checkDisplay($spec, ['rows', $rows], $options);
        return Lists::buildPublic($spec, $rows, $options);
    }

    /** Render one read-only detail from a supplied record. */
    public static function renderDetail(array|stdClass $spec, array|stdClass $record = new stdClass(), array $options = []): string
    {
        self::checkDisplay($spec, ['record', $record], $options);
        return Details::render($spec, $record, $options);
    }

    /** Build one read-only detail model from a supplied record. */
    public static function buildDetail(array|stdClass $spec, array|stdClass $record = new stdClass(), array $options = []): stdClass
    {
        self::checkDisplay($spec, ['record', $record], $options);
        return Details::build($spec, $record, $options);
    }

    /**
     * Input text of a list or detail operation: the specification, the files, the rows or record,
     * then the display options.
     *
     * @param array{0: string, 1: mixed} $input
     */
    private static function checkDisplay(array|stdClass $spec, array $input, array $options): void
    {
        InputText::specification($spec, $options);
        InputText::inputs([$input], $options, InputText::DISPLAY);
    }

    /** Format a nonnegative sequence with thirteen decimal digits. */
    public static function sequenceRowKey(int|string $sequence): string
    {
        if (!preg_match('/^\d{1,13}$/D', (string) $sequence)) {
            throw new FormError('INVALID_FORM_INPUT', 'A sequence must contain 1–13 decimal digits');
        }
        return '__' . str_pad((string) $sequence, 13, '0', STR_PAD_LEFT) . '__';
    }

    /** Generate a thirteen-character hexadecimal row key. */
    public static function createRowKey(): string
    {
        return '__' . substr(bin2hex(random_bytes(7)), 0, 13) . '__';
    }
}

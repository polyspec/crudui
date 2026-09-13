<?php

declare(strict_types=1);

namespace CRUDUI;

use CRUDUI\Generator\Binding;
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
        return Template::compile($spec, $options);
    }

    /** Evaluate fields without modifying template or record data. */
    public static function bindForm(stdClass $template, array|stdClass $data = [], array $options = []): array
    {
        return Binding::bind($template, $data, $options);
    }

    /** Render the current instance inside its crudui-form block. */
    public static function renderForm(Form $form): string
    {
        return Rendering::form($form->getFields(), $form->getButtons(), $form->getMessages());
    }

    /** Render supplied list rows using the table or card layout. */
    public static function renderList(array|stdClass $spec, array $rows, array $options = []): string
    {
        return Lists::render($spec, $rows, $options);
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

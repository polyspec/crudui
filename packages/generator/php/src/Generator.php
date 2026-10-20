<?php

declare(strict_types=1);

namespace Polyspec\Crudui;

use Polyspec\Crudui\Generator\Binding;
use Polyspec\Crudui\Generator\Buttons;
use Polyspec\Crudui\Generator\Details;
use Polyspec\Crudui\Generator\FormRender;
use Polyspec\Crudui\Generator\InputText;
use Polyspec\Crudui\Generator\Lists;
use Polyspec\Crudui\Generator\Outline;
use Polyspec\Crudui\Generator\Rendering;
use Polyspec\Crudui\Generator\Template;
use Polyspec\Crudui\Generator\View;
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

    /**
     * Evaluate fields without modifying template or record data. The option `collapsed` lists the row paths
     * `{collection}.{key}` rendered collapsed.
     */
    public static function bindForm(stdClass $template, array|stdClass $data = [], array $options = []): array
    {
        InputText::inputs([['template', $template], ['data', $data]], $options, InputText::BIND);
        return Binding::bind($template, $data, $options);
    }

    /**
     * Build the structure map of evaluated nodes: the rows of the form, each with the rows nested in it and the
     * row controls placed in the map (`multiple.controls: outline`).
     *
     * @param list<stdClass> $nodes the evaluated nodes that bindForm returns
     * @return list<stdClass>
     */
    public static function buildOutline(array $nodes): array
    {
        return Outline::build($nodes);
    }

    /** The view with no collapsed row; a view is `['collapsed' => list of row paths]`. */
    public static function initialView(): array
    {
        return View::initial();
    }

    /** Expand a collapsed row or collapse an expanded one. */
    public static function toggleRowView(array $view, string $rowPath): array
    {
        return View::toggle($view, $rowPath);
    }

    /**
     * The row paths `{collection}.{key}` of every collapsible row of the evaluated nodes.
     *
     * @param list<stdClass> $nodes the evaluated nodes that bindForm returns
     * @return list<string>
     */
    public static function collapsibleRows(array $nodes): array
    {
        return View::collapsibleRows($nodes);
    }

    /**
     * The view with no collapsed row, or the view that collapses every collapsible row of the nodes.
     *
     * @param list<stdClass> $nodes the evaluated nodes that bindForm returns
     */
    public static function setAllExpandedView(array $nodes, bool $expanded): array
    {
        return View::setAllExpanded($nodes, $expanded);
    }

    /** Drop the collapsed state of a removed row and of the rows inside it. */
    public static function removeRowView(array $view, string $rowPath): array
    {
        return View::removeRow($view, $rowPath);
    }

    /** Move the collapsed state of a rekeyed row and of the rows inside it to the new row path. */
    public static function rekeyRowView(array $view, string $oldPath, string $newPath): array
    {
        return View::rekeyRow($view, $oldPath, $newPath);
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

    /**
     * Render the current instance as the complete form (form-runtime.md, "Complete form").
     *
     * @param mixed $options an object with optional action, hidden, formErrors and errors members
     * @throws FormError INVALID_FORM_INPUT for options outside the contract
     */
    public static function renderForm(Form $form, mixed $options = []): string
    {
        $fields = $form->getFields();
        $model = FormRender::model($fields, $form->getTemplate()->action ?? null, $options);
        return Rendering::form($fields, $form->getButtons(), $form->getMessages(), $model, $form->getDescription());
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
    public static function renderDetail(
        array|stdClass $spec,
        array|stdClass $record = new stdClass(),
        array $options = []
    ): string {
        self::checkDisplay($spec, ['record', $record], $options);
        return Details::render($spec, $record, $options);
    }

    /** Build one read-only detail model from a supplied record. */
    public static function buildDetail(
        array|stdClass $spec,
        array|stdClass $record = new stdClass(),
        array $options = []
    ): stdClass {
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

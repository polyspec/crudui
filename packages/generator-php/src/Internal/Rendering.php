<?php

declare(strict_types=1);

namespace CRUDUI\Generator;

use stdClass;

/** Serialize evaluated form models as HTML. */
final class Rendering
{
    /** Escape ordinary text or explicit raw-control text. */
    public static function text(string $value, bool $raw = false): string
    {
        return strtr($value, $raw ? ['&' => '&amp;', '<' => '&lt;', '>' => '&gt;'] : ['&' => '&amp;', '<' => '&lt;', '>' => '&gt;', '"' => '&quot;', "'" => '&#x27;']);
    }

    /** Reject javascript URLs in ordinary link and image attributes. */
    public static function url(string $value): string
    {
        if (preg_match('/^[\x00-\x1f ]*j[\r\n\t]*a[\r\n\t]*v[\r\n\t]*a[\r\n\t]*s[\r\n\t]*c[\r\n\t]*r[\r\n\t]*i[\r\n\t]*p[\r\n\t]*t[\r\n\t]*:/i', $value)) {
            return "javascript:throw new Error('React has blocked a javascript: URL as a security precaution.')";
        }
        return $value;
    }

    /** Escape attributes and serialize ordinary or explicit raw styles. */
    public static function attrs(array|stdClass $attrs, bool $raw = false): string
    {
        $out = '';
        foreach ($attrs as $name => $value) {
            if (!$raw && $name === 'style' && is_string($value)) {
                $value = Style::rendered($value);
            }
            if ($value === null || $value === Missing::Value) {
                continue;
            }
            $escaped = $raw ? strtr(Value::scalar($value), ['&' => '&amp;', '"' => '&quot;', '<' => '&lt;']) : self::text(Value::scalar($value));
            if (!$raw) {
                $name = ['autocomplete' => 'autoComplete', 'readonly' => 'readOnly', 'autofocus' => 'autofocus', 'tabindex' => 'tabindex', 'maxlength' => 'maxLength', 'minlength' => 'minLength', 'colspan' => 'colSpan', 'rowspan' => 'rowSpan'][$name] ?? $name;
            }
            $out .= ' ' . $name . '="' . $escaped . '"';
        }
        return $out;
    }

    /** Serialize a non-void element with an already rendered body. */
    public static function element(string $tag, array|stdClass $attrs = [], string $body = '', bool $raw = false): string
    {
        return '<' . $tag . self::attrs($attrs, $raw) . '>' . $body . '</' . $tag . '>';
    }

    private static function input(array|stdClass $attrs, bool $raw = false): string
    {
        if (!$raw) {
            $attrs = (array) $attrs;
            $values = [];
            foreach (['name', 'checked', 'value'] as $key) {
                if (array_key_exists($key, $attrs)) {
                    $values[$key] = $attrs[$key];
                    unset($attrs[$key]);
                }
            }
            $attrs = [...self::controlAttrs($attrs), ...$values];
        }
        return '<input' . self::attrs($attrs, $raw) . ($raw ? '>' : '/>');
    }

    private static function controlAttrs(array|stdClass $attrs): array
    {
        $attrs = (array) $attrs;
        if (array_key_exists('style', $attrs)) {
            $style = $attrs['style'];
            unset($attrs['style']);
            $attrs['style'] = $style;
        }
        return $attrs;
    }

    private static function script(string $script): string
    {
        return '<script nonce="">' . $script . '</script>';
    }

    /** Render top-level nodes inside the crudui-form block. */
    public static function form(array $nodes): string
    {
        return self::element('div', ['class' => 'crudui-form'], self::element('div', ['class' => 'crudui-form__body'], implode('', array_map(self::node(...), $nodes))));
    }

    /** Join non-empty class names without normalizing their contents. */
    private static function classes(string ...$parts): string
    {
        return implode(' ', array_filter($parts, static fn ($part) => $part !== ''));
    }

    /** Open a div with an optional valueless hidden attribute last. */
    private static function open(array $attrs, bool $hidden): string
    {
        return '<div' . self::attrs($attrs) . ($hidden ? ' hidden=""' : '') . '>';
    }

    private static function node(stdClass $vm): string
    {
        $attrs = ['class' => self::classes('crudui-node', 'crudui-node--' . $vm->kind, ($vm->sticky ?? false) ? 'crudui-node--sticky' : '', $vm->className), 'style' => $vm->style ?? null];
        if ($vm->kind !== 'row' && $vm->kind !== 'lang-item' && isset($vm->path)) {
            $attrs['data-field-path'] = $vm->path;
        }
        if (isset($vm->key)) {
            $attrs['data-crudui-row-key'] = $vm->key;
        }
        if (isset($vm->lang)) {
            $attrs['data-lang'] = $vm->lang;
        }
        $footer = ($vm->controls->placement ?? null) === 'footer' ? self::element('div', ['class' => 'crudui-node__footer'], self::controls($vm->controls)) : '';
        return self::open($attrs, $vm->hidden) . self::header($vm) . self::body($vm) . $footer . '</div>';
    }

    private static function header(stdClass $vm): string
    {
        $header = $vm->header ?? new stdClass();
        $parts = '';
        if ($vm->collapsible ?? false) {
            $parts .= '<button' . self::attrs(['type' => 'button', 'class' => 'crudui-action', 'data-crudui-action' => 'toggle-row', 'aria-expanded' => ($vm->expanded ?? false) === true ? 'true' : 'false', 'aria-controls' => $vm->body->id ?? null, 'aria-label' => $vm->toggleLabel ?? null]) . '></button>';
        }
        if (isset($header->label)) {
            $label = self::text(Value::scalar($header->label));
            $parts .= ($header->labelFor ?? '') !== '' ? self::element('label', ['class' => 'crudui-node__label', 'for' => $header->labelFor], $label) : self::element('span', ['class' => 'crudui-node__label'], $label);
        }
        if (isset($header->description)) {
            $parts .= self::element('p', ['class' => 'crudui-node__description'], self::text($header->description));
        }
        foreach (['number', 'title'] as $part) {
            if (isset($header->{$part})) {
                $parts .= self::element('span', ['class' => 'crudui-node__' . $part], self::text($header->{$part}));
            }
        }
        if (isset($header->summary)) {
            $parts .= '<span class="crudui-node__summary"' . (($vm->expanded ?? false) === true ? ' hidden=""' : '') . '>' . self::text($header->summary) . '</span>';
        }
        if (isset($header->count)) {
            $parts .= self::element('span', ['class' => 'crudui-node__count'], self::text($header->count));
        }
        if (($vm->controls->placement ?? null) === 'header') {
            $parts .= self::controls($vm->controls);
        }
        if ($parts === '') {
            return '';
        }
        $style = implode('; ', array_filter([$header->style ?? '', ($vm->sticky ?? false) ? '--crudui-sticky-depth: ' . ($vm->stickyDepth ?? 0) : ''], static fn ($part) => $part !== ''));
        return self::element('div', ['class' => self::classes('crudui-node__header', $header->className ?? ''), 'style' => $style], $parts);
    }

    private static function body(stdClass $vm): string
    {
        $attrs = ['class' => self::classes('crudui-node__body', $vm->body->className), 'style' => $vm->body->style ?? null, 'id' => $vm->body->id ?? null];
        if (isset($vm->checkbox)) {
            $box = $vm->checkbox;
            $input = ['class' => $box->className, 'id' => $box->id, 'name' => $box->name, 'type' => 'checkbox', 'value' => '1'];
            if ($box->checked) {
                $input['checked'] = '';
            }
            $inner = self::input($input) . self::element('label', ['for' => $box->id], self::text($box->caption));
        } elseif (isset($vm->widget)) {
            $inner = self::widget($vm->widget);
        } else {
            $inner = implode('', array_map(self::node(...), $vm->children ?? []));
        }
        return self::open($attrs, ($vm->collapsible ?? false) === true && ($vm->expanded ?? false) !== true) . $inner . '</div>';
    }

    private static function controls(stdClass $controls): string
    {
        $buttons = '';
        foreach ($controls->actions as $action) {
            $buttons .= '<button' . self::attrs(['type' => 'button', 'class' => 'crudui-action', 'data-crudui-action' => $action->name, 'aria-label' => $action->label]) . ($action->disabled ? ' disabled=""' : '') . '></button>';
        }
        return self::element('div', ['class' => 'crudui-controls', 'role' => 'group', 'aria-label' => $controls->label], $buttons);
    }

    private static function affix(?stdClass $affix, bool $raw = false): string
    {
        return $affix === null ? '' : self::element('span', array_filter(['class' => $affix->class ?? null, 'style' => $affix->style ?? null], static fn ($v) => $v !== null && $v !== ''), self::text($affix->text, $raw), $raw);
    }

    private static function control(stdClass $widget, bool $raw = false): string
    {
        if (($widget->tag ?? '') === 'textarea') {
            $text = $widget->text ?? '';
            return self::element('textarea', $raw ? $widget->attrs : self::controlAttrs($widget->attrs), (!$raw && str_starts_with($text, "\n") ? "\n" : '') . self::text($text, $raw), $raw);
        }
        if (($widget->tag ?? '') === 'select') {
            $options = '';
            foreach ($widget->options ?? [] as $option) {
                $attrs = ['value' => $option->value];
                if ($option->selected) {
                    $attrs['selected'] = $widget->kind === 'search' ? 'selected' : '';
                }
                $options .= self::element('option', $attrs, self::text($option->label, $raw), $raw);
            }
            return self::element('select', $raw ? $widget->attrs : self::controlAttrs($widget->attrs), $options, $raw);
        }
        return self::input($widget->attrs, $raw);
    }

    private static function hasEvents(stdClass $attrs): bool
    {
        foreach ($attrs as $name => $_value) {
            if (preg_match('/^on[a-z]/', $name)) {
                return true;
            }
        }
        return false;
    }

    private static function widget(stdClass $widget): string
    {
        if ($widget->unsupported ?? false) {
            return self::element('div', ['class' => 'form-element-unsupported', 'data-unsupported-type' => $widget->type]);
        }
        $raw = self::hasEvents($widget->attrs);
        switch ($widget->layout) {
            case 'input-group':
                return self::element('div', ['class' => 'input-group'], self::affix($widget->prepend ?? null, $raw) . self::control($widget, $raw) . self::affix($widget->append ?? null, $raw));
            case 'bare':
                return self::control($widget, $raw);
            case 'host-script':
                return self::control($widget, $raw) . self::script($widget->script ?? '');
            case 'btn-group':
                $body = '';
                $radio = $widget->kind === 'choice';
                $raw = self::hasEvents($widget->extra->input ?? new stdClass());
                foreach ($widget->options as $option) {
                    $attrs = [...(array) ($widget->extra->input ?? new stdClass()), 'type' => $radio ? 'radio' : 'checkbox', 'value' => $option->value, 'autocomplete' => 'off', 'class' => 'valid-target btn-check', 'id' => $option->id];
                    if ($radio) {
                        $attrs['data-is-default'] = $option->isDefault ? '1' : '';
                    }
                    if ($option->selected) {
                        $attrs['checked'] = '';
                    }
                    $body .= self::input($attrs, $raw) . self::element('label', ['for' => $option->id, 'class' => $widget->itemLabelClass ?? ''], self::element('span', [], self::text($option->label, $raw), $raw), $raw);
                }
                return self::element('div', self::controlAttrs($widget->attrs), $body);
            case 'file':
                $raw = self::hasEvents($widget->extra->file);
                $body = self::affix($widget->prepend ?? null, $raw);
                if (isset($widget->extra->display)) {
                    $display = $raw ? ['class' => $widget->extra->display->class ?? '', 'readonly' => '', 'type' => 'text', 'value' => ''] : $widget->extra->display;
                    $body .= self::input($display, $raw);
                }
                $body .= self::input($widget->extra->file, $raw);
                if (isset($widget->extra->display)) {
                    $body .= self::element('button', ['class' => 'btn btn-search btn-file-search', 'type' => 'button'], '&nbsp;');
                }
                return self::element('div', ['class' => 'input-group'], $body);
            case 'display':
                return self::element('div', self::controlAttrs($widget->attrs), $widget->rawHtml ?? '');
            case 'search':
                $raw = true;
                return (($widget->styleChrome ?? '') !== '' ? self::element('style', ['nonce' => ''], $widget->styleChrome) : '') . self::script($widget->script ?? '') . self::element('div', ['class' => 'input-group field-search'], self::affix($widget->prepend ?? null, $raw) . self::control($widget, $raw) . self::affix($widget->append ?? null, $raw));
            case 'button':
                return self::script($widget->script ?? '') . self::input($widget->extra->hidden) . self::input($widget->attrs);
        }
        throw new \LogicException('Unknown widget layout: ' . $widget->layout);
    }
}

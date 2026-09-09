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

    /** Render evaluated fields in their existing order. */
    public static function fields(array $fields): string
    {
        return implode('', array_map(self::field(...), $fields));
    }

    private static function field(stdClass $vm): string
    {
        $attrs = ['class' => Value::classes('form-element-wrapper', $vm->design->wrapper->class), 'data-field-path' => $vm->path];
        $style = Value::style(($vm->design->show ? '' : 'display: none; ') . $vm->design->wrapper->style);
        if ($style !== null) {
            $attrs['style'] = $style;
        }
        $groupClass = Value::classes('input-group-wrapper', $vm->design->wrapper->class);
        $description = ($vm->description ?? '') !== '' ? self::element('p', ['class' => 'description'], self::text($vm->description)) : '';
        if ($vm->checkbox ?? false) {
            $input = ['class' => $vm->checkboxClass, 'id' => $vm->checkboxId, 'name' => $vm->checkboxName, 'type' => 'checkbox', 'value' => '1'];
            if ($vm->checkboxChecked) {
                $input['checked'] = '';
            }
            $body = self::element('div', [], self::input($input) . self::element('label', ['for' => $vm->checkboxId], self::text($vm->label ?? '')));
            $body = self::element('h6', [], self::element('div', ['class' => $groupClass, 'data-uniqid' => $vm->uniqid], $body));
            return self::element('div', $attrs, self::element('div', ['class' => 'checkbox'], $body . $description));
        }
        $label = '';
        if (($vm->label ?? '') !== '' && !$vm->omitLabel) {
            $labelAttrs = [];
            if ($vm->design->label->class !== '') {
                $labelAttrs['class'] = $vm->design->label->class;
            }
            if (($labelStyle = Value::style($vm->design->label->style)) !== null) {
                $labelAttrs['style'] = $labelStyle;
            }
            $caption = self::text($vm->label);
            $id = $vm->widget->extra->file->id ?? $vm->widget->attrs->id ?? null;
            if ($id !== null) {
                $caption = self::element('label', ['for' => $id], $caption);
            }
            $label = self::element('h6', $labelAttrs, $caption);
        }
        $body = '';
        if ($vm->shape === 'leaf') {
            $body = self::element('div', ['class' => $groupClass, 'data-uniqid' => $vm->uniqid], self::widget($vm->widget));
        } elseif ($vm->shape === 'group') {
            $inner = ['class' => $vm->groupClass];
            if (isset($vm->groupStyle)) {
                $inner['style'] = $vm->groupStyle;
            }
            $body = self::element('div', ['class' => $groupClass, 'data-uniqid' => $vm->uniqid], self::element('div', $inner, self::fields($vm->children)));
        } elseif ($vm->shape === 'multiple-leaf' || $vm->shape === 'multiple-group') {
            foreach ($vm->rows as $row) {
                $rowBody = $vm->shape === 'multiple-group' ? self::element('div', ['class' => $row->groupClass], self::fields($row->children)) . self::element('span', ['class' => 'btn-group input-group-btn'], self::buttons($vm->multiple)) : self::widget($row->widget) . self::buttons($vm->multiple);
                $body .= self::element('div', ['class' => $row->wrapperClass, 'data-uniqid' => $row->uniqid], $rowBody);
            }
            if ($vm->rows === []) {
                $body = self::element('button', ['type' => 'button', 'class' => 'btn btn-plus', 'aria-label' => '+'], ' ');
            }
        } elseif ($vm->shape === 'lang') {
            $lang = $vm->lang;
            $children = isset($lang->title) ? self::element('div', ['class' => 'lang-title'], self::text($lang->title)) : '';
            foreach ($lang->children as $child) {
                $children .= self::element('div', ['class' => 'lang-child', 'data-lang' => $child->code], self::element('span', ['class' => 'input-group-text lang-code'], self::text($child->code)) . self::widget($child->widget));
            }
            $body = self::element('div', ['class' => $groupClass, 'data-uniqid' => $vm->uniqid], self::element('div', ['class' => $lang->groupClass], $children));
        }
        return self::element('div', $attrs, $label . $description . self::element('div', ['class' => 'form-element'], $body));
    }

    private static function buttons(stdClass $settings): string
    {
        $out = '';
        if ($settings->sortable ?? false) {
            $out .= self::element('button', ['type' => 'button', 'class' => 'btn btn-move-up'], ' ');
            $out .= self::element('button', ['type' => 'button', 'class' => 'btn btn-move-down'], ' ');
        }
        $plus = ['type' => 'button', 'class' => 'btn btn-plus'];
        if (isset($settings->max)) {
            $plus['data-multiple-max'] = (string) $settings->max;
        }
        $out .= self::element('button', $plus, ' ');
        if ($settings->copy ?? false) {
            $out .= self::element('button', ['type' => 'button', 'class' => 'btn btn-copy'], ' ');
        }
        return $out . self::element('button', ['type' => 'button', 'class' => $settings->copy ?? false ? 'btn btn-minus btn-delete' : 'btn btn-minus'], ' ');
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

<?php

declare(strict_types=1);

namespace CRUDUI\Generator;

use stdClass;

/** Form buttons: the actions a spec declares with root buttons, rendered in the form footer. */
final class Buttons
{
    /** Button kinds a spec can declare. A link renders an anchor. */
    public const TYPES = ['submit', 'reset', 'button', 'link'];

    /** The buttons of a form whose spec declares none: one submit button. */
    public const DEFAULT = [['type' => 'submit']];

    /** Evaluate the template buttons for a record in declaration order. */
    public static function bind(stdClass $template, stdClass $data, string $language): array
    {
        $messages = Messages::forLanguage($language);
        $buttons = [];
        foreach ($template->buttons as $button) {
            $button = Value::object($button);
            $type = $button->type;
            $design = Design::resolve($button->design ?? null, $data, []);
            $attrs = new stdClass();
            if ($type !== 'link') {
                $attrs->type = $type;
            }
            $attrs->class = implode(' ', array_filter(['crudui-action', 'crudui-action--text', $design->main->class], static fn ($part) => $part !== ''));
            $style = Value::style($design->main->style);
            if ($style !== null) {
                $attrs->style = $style;
            }
            foreach (['name', 'value', 'href'] as $name) {
                if (is_string($button->{$name} ?? null)) {
                    $attrs->{$name} = $button->{$name};
                }
            }
            $onclick = self::script($button->behavior ?? null, 'onclick');
            if ($onclick !== null) {
                $attrs->onclick = $onclick;
            }
            $buttons[] = (object) [
                'type' => $type,
                'tag' => $type === 'link' ? 'a' : 'button',
                'text' => Value::translate($button->text ?? null, $language, $messages[$type] ?? ''),
                'attrs' => $attrs,
            ];
        }
        return $buttons;
    }

    /** Markup of the form buttons; every renderer inserts this one string into the footer controls group. */
    public static function html(array $buttons): string
    {
        $out = '';
        foreach ($buttons as $button) {
            $out .= '<' . $button->tag;
            foreach ((array) $button->attrs as $name => $value) {
                $out .= ' ' . $name . '="' . strtr($value, ['&' => '&amp;', '"' => '&quot;', '<' => '&lt;']) . '"';
            }
            $out .= '>' . strtr($button->text, ['&' => '&amp;', '<' => '&lt;', '>' => '&gt;']) . '</' . $button->tag . '>';
        }
        return $out;
    }

    /** A behavior script: a string, or the script of a label and script action. */
    private static function script(mixed $behavior, string $action): ?string
    {
        $entry = $behavior instanceof stdClass ? ($behavior->{$action} ?? null) : (is_array($behavior) ? ($behavior[$action] ?? null) : null);
        $script = $entry instanceof stdClass ? ($entry->script ?? null) : (is_array($entry) ? ($entry['script'] ?? null) : $entry);
        return is_string($script) && $script !== '' ? $script : null;
    }
}

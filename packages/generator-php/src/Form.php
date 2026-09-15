<?php

declare(strict_types=1);

namespace CRUDUI;

use CRUDUI\Generator\Binding;
use CRUDUI\Generator\Buttons;
use CRUDUI\Generator\Messages;
use CRUDUI\Generator\Missing;
use CRUDUI\Generator\Template;
use CRUDUI\Generator\Value;
use stdClass;

/** Editable data and evaluated fields for one compiled structure. */
final class Form
{
    private stdClass $template;

    private stdClass $data;

    private array $fields;

    private array $buttons;

    private int $revision = 0;

    private array $options;

    /** Create independent instance data over a copied template. */
    public function __construct(stdClass $template, array|stdClass $data = [], array $options = [])
    {
        Template::check($template);
        $this->template = Value::spec($template);
        $this->options = $options;
        $this->data = $this->normalizeFields($this->template->fields, Value::object($data));
        $this->fields = Binding::bind($this->template, $this->data, $options);
        $this->buttons = Buttons::bind($this->template, $this->data, $this->language());
    }

    /** Return a detached copy of the compiled template. */
    public function getTemplate(): stdClass
    {
        return Value::copy($this->template);
    }

    /** Return detached evaluated field models. */
    public function getFields(): array
    {
        return Value::copy($this->fields);
    }

    /** Return detached evaluated form buttons. */
    public function getButtons(): array
    {
        return Value::copy($this->buttons);
    }

    /** Return the interface text for the instance language. */
    public function getMessages(): array
    {
        return Messages::forLanguage($this->language());
    }

    /** Return the number of successful data updates. */
    public function getRevision(): int
    {
        return $this->revision;
    }

    /** Return detached submission data. */
    public function getData(): stdClass
    {
        return Value::copy($this->data);
    }

    /** Return a detached path value, or null when missing. */
    public function getValue(string $path): mixed
    {
        self::checkedPath($path);
        $value = Value::path($this->data, $path);
        return $value === Missing::Value ? null : Value::copy($value);
    }

    /** Replace the record and reevaluate fields atomically. */
    public function setData(array|stdClass $data): void
    {
        $this->commit($this->normalizeFields($this->template->fields, Value::object($data)));
    }

    /** Replace one path value and reevaluate fields atomically. */
    public function setValue(string $path, mixed $value): void
    {
        $data = self::put($this->data, self::checkedPath($path), Value::copy($value));
        $this->commit($this->normalizeFields($this->template->fields, $data));
    }

    /** Insert one supplied or defaulted row and return its key. */
    public function addRow(string $path, array $options = []): string
    {
        [$field, $rows] = $this->collection($path);
        $maximum = $field->spec->multiple->max ?? null;
        if ((is_int($maximum) || is_float($maximum)) && count((array) $rows) >= $maximum) {
            self::fail('Maximum row count reached: ' . $path);
        }
        $key = $options['key'] ?? self::freshKey(array_keys((array) $rows));
        if (!is_string($key)) {
            self::fail('A row key must be a string');
        }
        self::checkKey($key);
        if (property_exists($rows, $key)) {
            self::fail('Row key already exists: ' . $key);
        }
        $members = (array) $rows;
        $index = count($members);
        if (array_key_exists('afterKey', $options)) {
            $found = array_search($options['afterKey'], array_keys($members), true);
            if ($found === false) {
                self::fail('Unknown row: ' . Value::scalar($options['afterKey']));
            }
            $index = $found + 1;
        }
        $value = $this->normalizeRow($field, array_key_exists('value', $options) ? Value::copy($options['value']) : Missing::Value, implode('.', [...self::checkedPath($path), $key]));
        $next = (object) (array_slice($members, 0, $index, true) + [$key => $value] + array_slice($members, $index, null, true));
        $this->commit(self::put($this->data, self::checkedPath($path), $next));
        return $key;
    }

    /** Copy current row values and regenerate nested repeated keys. */
    public function copyRow(string $path, string $key, array $options = []): string
    {
        [$field, $rows] = $this->collection($path);
        if (!property_exists($rows, $key)) {
            self::fail('Unknown row: ' . $key);
        }
        $options['afterKey'] ??= $key;
        $options['value'] = $this->copyRowValue($field, $rows->{$key});
        return $this->addRow($path, $options);
    }

    /** Remove one row while respecting the minimum count. */
    public function removeRow(string $path, string $key): void
    {
        [$field, $rows] = $this->collection($path);
        if (!property_exists($rows, $key)) {
            self::fail('Unknown row: ' . $key);
        }
        $minimum = $field->spec->multiple->min ?? null;
        if ((is_int($minimum) || is_float($minimum)) && count((array) $rows) <= $minimum) {
            self::fail('Minimum row count reached: ' . $path);
        }
        $next = clone $rows;
        unset($next->{$key});
        $this->commit(self::put($this->data, self::checkedPath($path), $next));
    }

    /** Change row order without changing row identity. */
    public function moveRow(string $path, string $key, int $index): void
    {
        [, $rows] = $this->collection($path);
        if (!property_exists($rows, $key)) {
            self::fail('Unknown row: ' . $key);
        }
        $members = (array) $rows;
        if ($index < 0 || $index >= count($members)) {
            self::fail('Invalid row position: ' . $index);
        }
        if (array_search($key, array_keys($members), true) === $index) {
            return;
        }
        $value = $members[$key];
        unset($members[$key]);
        $next = (object) (array_slice($members, 0, $index, true) + [$key => $value] + array_slice($members, $index, null, true));
        $this->commit(self::put($this->data, self::checkedPath($path), $next));
    }

    /** Replace one row key and regenerate descendant field paths. */
    public function rekeyRow(string $path, string $oldKey, string $newKey): void
    {
        [, $rows] = $this->collection($path);
        self::checkKey($newKey);
        if (!property_exists($rows, $oldKey)) {
            self::fail('Unknown row: ' . $oldKey);
        }
        if ($oldKey === $newKey) {
            return;
        }
        if (property_exists($rows, $newKey)) {
            self::fail('Row key already exists: ' . $newKey);
        }
        $next = new stdClass();
        foreach ($rows as $key => $value) {
            $next->{$key === $oldKey ? $newKey : $key} = $value;
        }
        $this->commit(self::put($this->data, self::checkedPath($path), $next));
    }

    private function commit(stdClass $data): void
    {
        $fields = Binding::bind($this->template, $data, $this->options);
        $buttons = Buttons::bind($this->template, $data, $this->language());
        $this->data = $data;
        $this->fields = $fields;
        $this->buttons = $buttons;
        $this->revision++;
    }

    /** The content and interface language, defaulting to Korean. */
    private function language(): string
    {
        return $this->options['language'] ?? 'ko';
    }

    private static function checkedPath(string $path): array
    {
        $segments = Value::segments($path);
        if (!$segments || array_intersect($segments, ['__proto__', 'prototype', 'constructor'])) {
            self::fail('Invalid form path: ' . $path);
        }
        return $segments;
    }

    private static function checkKey(string $key): void
    {
        if (!preg_match('/^[A-Za-z0-9_-]+$/D', $key) || preg_match('/^\d+$/D', $key) || in_array($key, ['__proto__', 'prototype', 'constructor'], true)) {
            self::fail('Invalid row key: ' . $key . '; use sequenceRowKey for numeric ids');
        }
    }

    private static function put(stdClass $data, array $path, mixed $value): stdClass
    {
        $head = array_shift($path);
        $out = clone $data;
        $out->{$head} = $path ? self::put(($data->{$head} ?? null) instanceof stdClass ? $data->{$head} : new stdClass(), $path, $value) : $value;
        return $out;
    }

    private static function repeats(stdClass $field): bool
    {
        return ($field->spec->multiple ?? null) === true || ($field->spec->multiple ?? null) instanceof stdClass;
    }

    private static function freshKey(array $used): string
    {
        for ($attempt = 0; $attempt < 100; $attempt++) {
            $key = Generator::createRowKey();
            if (!in_array($key, $used, true)) {
                return $key;
            }
        }
        self::fail('Unable to generate an unused row key');
    }

    /** Normalize record data; `$path` is the full data path, empty at the root. */
    private function normalizeFields(array $fields, mixed $value, string $path = ''): stdClass
    {
        if ($value !== Missing::Value && !$value instanceof stdClass) {
            self::fail($path === '' ? 'Form data must be an object' : 'Group data must be an object: ' . $path);
        }
        $data = $value === Missing::Value ? new stdClass() : Value::copy($value);
        foreach ($fields as $field) {
            $raw = Value::get($data, $field->name);
            $fieldPath = $path === '' ? $field->name : $path . '.' . $field->name;
            if (self::repeats($field)) {
                if ($raw !== Missing::Value && !$raw instanceof stdClass) {
                    self::fail('Repeated data must be a keyed object: ' . $fieldPath);
                }
                $rows = new stdClass();
                $entries = $raw === Missing::Value ? (object) [self::freshKey([]) => Missing::Value] : $raw;
                foreach ($entries as $key => $row) {
                    self::checkKey((string) $key);
                    $rows->{$key} = $this->normalizeRow($field, $row, $fieldPath . '.' . $key);
                }
                $data->{$field->name} = $rows;
            } elseif (($field->spec->type ?? null) === 'group') {
                $data->{$field->name} = $this->normalizeFields($field->children, $raw, $fieldPath);
            } elseif ($raw === Missing::Value && property_exists($field->spec, 'default')) {
                $data->{$field->name} = Value::copy($field->spec->default);
            }
        }
        return $data;
    }

    private function normalizeRow(stdClass $field, mixed $value, string $path): mixed
    {
        return ($field->spec->type ?? null) === 'group' ? $this->normalizeFields($field->children, $value, $path) : Value::copy($value === Missing::Value ? $field->spec->default ?? '' : $value);
    }

    private function copyRowValue(stdClass $field, mixed $value): mixed
    {
        return ($field->spec->type ?? null) === 'group' ? $this->copyChildren($field->children, Value::copy($value)) : Value::copy($value);
    }

    private function copyChildren(array $fields, stdClass $value): stdClass
    {
        foreach ($fields as $field) {
            $raw = $value->{$field->name} ?? null;
            if (self::repeats($field) && $raw instanceof stdClass) {
                $used = array_keys((array) $raw);
                $next = new stdClass();
                foreach ($raw as $row) {
                    $key = self::freshKey($used);
                    $used[] = $key;
                    $next->{$key} = $this->copyRowValue($field, $row);
                }
                $value->{$field->name} = $next;
            } elseif (($field->spec->type ?? null) === 'group' && $raw instanceof stdClass) {
                $value->{$field->name} = $this->copyChildren($field->children, $raw);
            }
        }
        return $value;
    }

    private function collection(string $path): array
    {
        $segments = self::checkedPath($path);
        $fields = $this->template->fields;
        $field = null;
        for ($i = 0; $i < count($segments); $i++) {
            $field = null;
            foreach ($fields as $candidate) {
                if ($candidate->name === $segments[$i]) {
                    $field = $candidate;
                    break;
                }
            }
            if ($field === null) {
                self::fail('Unknown collection: ' . $path);
            }
            if ($i === count($segments) - 1) {
                break;
            }
            if (self::repeats($field)) {
                $i++;
            }
            $fields = $field->children;
            $field = null;
        }
        $rows = Value::path($this->data, $path);
        if ($field === null || !self::repeats($field) || !$rows instanceof stdClass) {
            self::fail('Not a keyed collection: ' . $path);
        }
        return [$field, $rows];
    }

    private static function fail(string $message): never
    {
        throw new FormError('INVALID_FORM_INPUT', $message);
    }
}

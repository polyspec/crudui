<?php
declare(strict_types=1);

/**
 * The shape rule of submitted form data, shared by the record save and the benchmark save and
 * validation (docs/spec/form-comparison.md, "Record resource"). JSON members arrive as objects
 * and native fields as arrays. A shape is a `text` or `checkbox` leaf, `texts`, an object of
 * exactly these text members, `fields`, an object of these fields of which only the `required`
 * ones must be present, or `rows`, keyed rows of one object of fields.
 */
final class FormShape
{
    private const DEPARTMENT = ['fields' => ['name' => 'text']];
    private const STORE = ['fields' => ['name' => 'text', 'enabled' => 'checkbox', 'detail' => 'text', 'title' => ['texts' => ['ko', 'en']], 'departments' => ['rows' => self::DEPARTMENT]]];
    private const COMPANY = ['fields' => ['name' => 'text', 'stores' => ['rows' => self::STORE]]];
    /** The submitted `companies`, of the record form and of the benchmark form. */
    public const COMPANIES = ['rows' => self::COMPANY];
    /** The benchmark form, which holds only `companies`. */
    public const SCENARIO = ['fields' => ['companies' => self::COMPANIES]];

    /**
     * Return the submitted `$value` of `$shape` at `$path`, completed and in the member order of
     * the shape, with row keys in submitted order. Form data leaves out a field that holds no
     * value, so an absent field other than a required one completes as its empty value in both
     * media types. Any other difference is rejected.
     */
    public static function shaped(mixed $value, string|array $shape, bool $native, string $path): string|stdClass
    {
        if (is_string($shape)) {
            if (!is_string($value)) throw new InvalidArgumentException("Expected text at $path");
            if ($shape === 'checkbox' && !in_array($value, ['', '1'], true)) throw new InvalidArgumentException("Expected \"\" or \"1\" at $path");
            return $value;
        }
        $given = self::object($value, $native, $path);
        $result = new stdClass();
        if (isset($shape['rows'])) {
            foreach ($given as $key => $row) {
                $key = (string) $key;
                if (!preg_match('/^__[0-9a-f]{13}__$/D', $key)) throw new InvalidArgumentException("Expected a row key at $path: $key");
                $result->$key = self::shaped($row, $shape['rows'], $native, "$path.$key");
            }
            return $result;
        }
        // An object of texts holds every member; a field may be absent unless it is required.
        $members = isset($shape['texts']) ? array_fill_keys($shape['texts'], 'text') : $shape['fields'];
        $required = isset($shape['texts']) ? $shape['texts'] : ($shape['required'] ?? []);
        foreach (array_keys($given) as $name) {
            if (!array_key_exists((string) $name, $members)) throw new InvalidArgumentException("Unexpected member $path.$name");
        }
        foreach ($members as $name => $member) {
            if (array_key_exists($name, $given)) $result->$name = self::shaped($given[$name], $member, $native, "$path.$name");
            elseif (in_array($name, $required, true)) throw new InvalidArgumentException("Missing member $path.$name");
            else $result->$name = self::empty($member);
        }
        return $result;
    }

    /** The value of an absent field: empty text, empty texts or no rows. */
    private static function empty(string|array $shape): string|stdClass
    {
        if (is_string($shape)) return '';
        return (object) array_fill_keys($shape['texts'] ?? [], '');
    }

    /** Return the members of a JSON object or of native nested fields (an array that is not a list). */
    private static function object(mixed $value, bool $native, string $path): array
    {
        if (!$native && $value instanceof stdClass) return get_object_vars($value);
        if ($native && is_array($value) && ($value === [] || !array_is_list($value))) return $value;
        throw new InvalidArgumentException("Expected an object at $path");
    }
}

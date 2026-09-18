<?php
declare(strict_types=1);

/**
 * The shape rule of submitted form data, shared by the record save and the benchmark save and
 * validation (docs/spec/form-comparison.md, "Record resource"). JSON members arrive as objects
 * and carry every member; native fields arrive as arrays and omit an unchecked `enabled`
 * (completed as "") and a collection without rows (completed as no rows).
 */
final class FormShape
{
    /**
     * The members of one row at each level of `companies`, in member order, with the value a
     * native submission omits; null marks a member it always posts.
     */
    private const COMPANY_MEMBERS = ['name' => null, 'stores' => []];
    private const STORE_MEMBERS = ['name' => null, 'enabled' => '', 'detail' => null, 'title' => null, 'departments' => []];
    private const DEPARTMENT_MEMBERS = ['name' => null];
    private const TITLE_MEMBERS = ['ko' => null, 'en' => null];

    /**
     * Require exactly these members of one object (a native one completed with the members it
     * omits) and return them in member order; `$members` maps each name to its omitted value.
     */
    public static function members(mixed $value, bool $native, array $members, string $path): array
    {
        $given = self::object($value, $native, $path);
        if ($native) {
            foreach ($members as $name => $omitted) {
                if ($omitted !== null && !array_key_exists($name, $given)) $given[$name] = $omitted;
            }
        }
        $names = array_keys($members);
        $keys = array_map('strval', array_keys($given));
        sort($keys);
        $sorted = $names;
        sort($sorted);
        if ($keys !== $sorted) throw new InvalidArgumentException('Expected exactly the members ' . implode(', ', $names) . ": $path");
        $ordered = [];
        foreach ($names as $name) $ordered[$name] = $given[$name];
        return $ordered;
    }

    /** Return the members of a JSON object or of native nested fields (an array that is not a list). */
    private static function object(mixed $value, bool $native, string $path): array
    {
        if (!$native && $value instanceof stdClass) return get_object_vars($value);
        if ($native && is_array($value) && ($value === [] || !array_is_list($value))) return $value;
        throw new InvalidArgumentException("Expected an object: $path");
    }

    /** Require one text leaf. */
    public static function text(mixed $value, string $path): string
    {
        if (!is_string($value)) throw new InvalidArgumentException("Expected text member: $path");
        return $value;
    }

    /** Require the `companies` rows of one submission and return them as stored. */
    public static function companies(mixed $value, bool $native): stdClass
    {
        return self::rows($value, $native, 'companies', self::COMPANY_MEMBERS, static fn(array $company, string $path): stdClass => (object) [
            'name' => self::text($company['name'], "$path.name"),
            'stores' => self::rows($company['stores'], $native, "$path.stores", self::STORE_MEMBERS, static function (array $store, string $path) use ($native): stdClass {
                $enabled = self::text($store['enabled'], "$path.enabled");
                if (!in_array($enabled, ['', '1'], true)) throw new InvalidArgumentException("Expected checkbox value 1 or empty text: $path.enabled");
                $title = self::members($store['title'], $native, self::TITLE_MEMBERS, "$path.title");
                return (object) [
                    'name' => self::text($store['name'], "$path.name"),
                    'enabled' => $enabled,
                    'detail' => self::text($store['detail'], "$path.detail"),
                    'title' => (object) ['ko' => self::text($title['ko'], "$path.title.ko"), 'en' => self::text($title['en'], "$path.title.en")],
                    'departments' => self::rows($store['departments'], $native, "$path.departments", self::DEPARTMENT_MEMBERS, static fn(array $department, string $path): stdClass => (object) [
                        'name' => self::text($department['name'], "$path.name"),
                    ]),
                ];
            }),
        ]);
    }

    /**
     * Require one keyed collection of rows with exactly these members and return its rows,
     * converted by `$row`, in submitted order with their submitted keys.
     */
    private static function rows(mixed $value, bool $native, string $path, array $members, callable $row): stdClass
    {
        $rows = new stdClass();
        foreach (self::object($value, $native, $path) as $key => $given) {
            $key = (string) $key;
            if (!preg_match('/^__[0-9a-f]{13}__$/D', $key)) throw new InvalidArgumentException("Expected a row key: $path.$key");
            $rows->$key = $row(self::members($given, $native, $members, "$path.$key"), "$path.$key");
        }
        return $rows;
    }
}

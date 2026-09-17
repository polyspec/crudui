<?php
declare(strict_types=1);
require_once __DIR__ . '/json.php';

/**
 * The customer record store of one PHP server: `records-{server}.json` in the data directory,
 * seeded from the published fixture (docs/spec/form-comparison.md, "Record resource").
 */
final class RecordStore
{
    public const PER_PAGE = 20;
    /** The submitted form members, in record member order. */
    public const FORM_MEMBERS = ['id', 'name', 'status', 'joined', 'score', 'relation', 'markup'];

    public function __construct(private readonly string $file, private readonly string $fixtureFile) {}

    /** Read the fixture records, in id order. */
    public function fixture(): array
    {
        $text = file_get_contents($this->fixtureFile);
        if (!is_string($text)) throw new RuntimeException('Cannot read the record fixture');
        return self::records(FormJson::decode($text), 'record fixture');
    }

    /** Read the stored records, seeding a missing store from the fixture. */
    public function read(): array
    {
        return $this->transaction(static fn(array $records): array => [$records, $records]);
    }

    /** Replace the store with the fixture and return its record count. */
    public function reset(): int
    {
        $fixture = $this->fixture();
        return $this->transaction(static fn(array $records): array => [$fixture, count($fixture)]);
    }

    /**
     * Store the submitted editable members over one stored record and return the stored record,
     * or null when the id is not stored.
     */
    public function save(string $id, stdClass $submitted): ?stdClass
    {
        return $this->transaction(static function (array $records) use ($id, $submitted): array {
            $index = self::indexOf($records, $id);
            if ($index === null) return [$records, null];
            $previous = $records[$index];
            $record = (object) [
                'id' => $previous->id,
                'name' => $submitted->name,
                'status' => $submitted->status,
                'joined' => $submitted->joined,
                'score' => self::number($submitted->score),
                'relation' => (object) ['name' => $submitted->relation->name],
                'avatar' => $previous->avatar,
                'markup' => $submitted->markup,
            ];
            $records[$index] = $record;
            return [$records, $record];
        });
    }

    /** Return the stored record with this id, or null. */
    public static function find(array $records, string $id): ?stdClass
    {
        $index = self::indexOf($records, $id);
        return $index === null ? null : $records[$index];
    }

    /** Return the records of one page, or null beyond the last page. */
    public static function page(array $records, int $page): ?array
    {
        $pages = max(1, intdiv(count($records) + self::PER_PAGE - 1, self::PER_PAGE));
        return $page > $pages ? null : array_slice($records, ($page - 1) * self::PER_PAGE, self::PER_PAGE);
    }

    /** The form data of one stored record: every member as text, without the avatar. */
    public static function formData(stdClass $record): stdClass
    {
        return (object) [
            'id' => $record->id,
            'name' => $record->name,
            'status' => $record->status,
            'joined' => $record->joined,
            'score' => FormJson::numberText($record->score),
            'relation' => (object) ['name' => $record->relation->name],
            'markup' => $record->markup,
        ];
    }

    /**
     * Require exactly the form members, each a string, with `relation` holding exactly `name`, and
     * return them in member order. Native fields arrive as arrays and JSON members as objects.
     */
    public static function submission(mixed $form): stdClass
    {
        $members = self::members($form);
        if ($members === null || !self::sameKeys($members, self::FORM_MEMBERS)) throw new InvalidArgumentException('Expected exactly the form members');
        $relation = self::members($members['relation']);
        if ($relation === null || !self::sameKeys($relation, ['name'])) throw new InvalidArgumentException('Expected relation with exactly name');
        $members['relation'] = (object) $relation;
        foreach (self::FORM_MEMBERS as $name) {
            if ($name !== 'relation' && !is_string($members[$name])) throw new InvalidArgumentException("Expected text member: $name");
        }
        if (!is_string($relation['name'])) throw new InvalidArgumentException('Expected text member: relation.name');
        $ordered = [];
        foreach (self::FORM_MEMBERS as $name) $ordered[$name] = $members[$name];
        return (object) $ordered;
    }

    /** Convert submitted number text as JavaScript's Number conversion does. */
    public static function number(string $text): int|float
    {
        $whitespace = '\x{0009}-\x{000D}\x{0020}\x{00A0}\x{1680}\x{2000}-\x{200A}\x{2028}\x{2029}\x{202F}\x{205F}\x{3000}\x{FEFF}';
        $text = (string) preg_replace('/^[' . $whitespace . ']+|[' . $whitespace . ']+$/u', '', $text);
        if ($text === '') {
            $value = 0.0;
        } elseif (preg_match('/^0([xbo])([0-9a-f]+)$/iD', $text, $match)) {
            $width = ['x' => 4, 'b' => 1, 'o' => 3][strtolower($match[1])];
            $alphabet = substr('0123456789abcdef', 0, 1 << $width);
            $digits = strtolower($match[2]);
            if (strspn($digits, $alphabet) !== strlen($digits)) throw new InvalidArgumentException('Expected a number');
            $bits = '';
            foreach (str_split($digits) as $digit) $bits .= str_pad(decbin(strpos($alphabet, $digit)), $width, '0', STR_PAD_LEFT);
            $bits = ltrim($bits, '0');
            if (strlen($bits) <= 53) {
                $value = (float) bindec($bits === '' ? '0' : $bits);
            } else {
                $significand = bindec(substr($bits, 0, 53));
                if ($bits[53] === '1' && (str_contains(substr($bits, 54), '1') || fmod((float) $significand, 2.0) !== 0.0)) $significand++;
                $value = (float) $significand * 2 ** (strlen($bits) - 53);
            }
        } elseif (preg_match('/^[+-]?(?:[0-9]+\.?[0-9]*|\.[0-9]+)(?:[eE][+-]?[0-9]+)?$/D', $text)) {
            $value = (float) $text;
        } else {
            throw new InvalidArgumentException('Expected a number');
        }
        if (!is_finite($value)) throw new InvalidArgumentException('Expected a finite number');
        return floor($value) === $value && abs($value) <= 9007199254740991.0 ? (int) $value : $value;
    }

    /** Return object or array members as an array, or null for another value. */
    private static function members(mixed $value): ?array
    {
        if ($value instanceof stdClass) return get_object_vars($value);
        if (is_array($value) && ($value === [] || !array_is_list($value))) return $value;
        return null;
    }

    private static function sameKeys(array $members, array $names): bool
    {
        $keys = array_map('strval', array_keys($members));
        sort($keys);
        sort($names);
        return $keys === $names;
    }

    private static function indexOf(array $records, string $id): ?int
    {
        foreach ($records as $index => $record) if ($record->id === $id) return $index;
        return null;
    }

    /** Require a records array read from a JSON file. */
    private static function records(mixed $value, string $name): array
    {
        if (!is_array($value)) throw new RuntimeException("Malformed $name");
        foreach ($value as $record) {
            if (!$record instanceof stdClass || !is_string($record->id ?? null)) throw new RuntimeException("Malformed $name");
        }
        return $value;
    }

    /** Serialize read/modify/write operations under one exclusive file lock; writes replace the file atomically. */
    private function transaction(callable $operation): mixed
    {
        $handle = fopen($this->file . '.lock', 'c');
        if ($handle === false || !flock($handle, LOCK_EX)) throw new RuntimeException('Cannot lock the record store');
        try {
            $missing = !file_exists($this->file);
            if ($missing) {
                $before = $this->fixture();
            } else {
                $text = file_get_contents($this->file);
                if (!is_string($text)) throw new RuntimeException('Cannot read the record store');
                try {
                    $before = self::records(FormJson::decode($text), 'record store');
                } catch (Throwable $error) {
                    throw new RuntimeException('Malformed record store', 0, $error);
                }
            }
            [$after, $result] = $operation($before);
            if ($missing || $after !== $before) {
                $json = FormJson::encode($after) . "\n";
                $temporary = tempnam(dirname($this->file), '.records-');
                if ($temporary === false) throw new RuntimeException('Cannot create the record store file');
                try {
                    if (file_put_contents($temporary, $json) !== strlen($json) || !rename($temporary, $this->file)) throw new RuntimeException('Cannot write the record store');
                } finally {
                    if (is_file($temporary)) unlink($temporary);
                }
            }
            return $result;
        } finally {
            flock($handle, LOCK_UN);
            fclose($handle);
        }
    }
}

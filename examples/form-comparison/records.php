<?php
declare(strict_types=1);
require_once __DIR__ . '/json.php';
require_once __DIR__ . '/form-shape.php';

/**
 * The customer record store of one PHP server: `records-{server}.json` in the data directory,
 * seeded from the published fixture (docs/spec/form-comparison.md, "Record resource").
 */
final class RecordStore
{
    public const PER_PAGE = 20;
    /** The members of a stored record, in order. */
    private const RECORD_MEMBERS = ['id', 'name', 'status', 'joined', 'score', 'relation', 'avatar', 'markup', 'companies'];
    /**
     * The submitted form members, in record member order, with the value a native submission
     * omits (a collection without rows); null marks a member it always posts.
     */
    private const FORM_MEMBERS = ['id' => null, 'name' => null, 'status' => null, 'joined' => null, 'score' => null, 'relation' => null, 'markup' => null, 'companies' => []];

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

    /** Replace the store with the fixture, whatever the store file holds, and return its record count. */
    public function reset(): int
    {
        $fixture = $this->fixture();
        $this->locked(fn() => $this->replace($fixture));
        return count($fixture);
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
                'companies' => $submitted->companies,
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
            'companies' => $record->companies,
        ];
    }

    /**
     * Require exactly the form members, each a string, with `relation` holding exactly `name` and
     * `companies` in its keyed row shape (FormShape), and return them in member order.
     */
    public static function submission(mixed $form, bool $native): stdClass
    {
        $members = FormShape::members($form, $native, self::FORM_MEMBERS, 'form');
        foreach ($members as $name => $value) {
            $members[$name] = match ($name) {
                'relation' => (object) ['name' => FormShape::text(FormShape::members($value, $native, ['name' => null], 'relation')['name'], 'relation.name')],
                'companies' => FormShape::companies($value, $native),
                default => FormShape::text($value, $name),
            };
        }
        return (object) $members;
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

    private static function indexOf(array $records, string $id): ?int
    {
        foreach ($records as $index => $record) if ($record->id === $id) return $index;
        return null;
    }

    /**
     * Require the records array of a JSON file: records with exactly the fixture's members in
     * order, `score` a number, every other scalar a string and `companies` in the form's shape
     * (FormShape). Anything else is a server fault.
     */
    private static function records(mixed $value, string $name): array
    {
        if (!is_array($value) || !array_is_list($value)) throw new RuntimeException("Malformed $name: expected a records array");
        foreach ($value as $record) {
            if (!$record instanceof stdClass || array_map('strval', array_keys(get_object_vars($record))) !== self::RECORD_MEMBERS) throw new RuntimeException("Malformed $name: expected the record members");
            foreach (self::RECORD_MEMBERS as $member) {
                $item = $record->$member;
                $valid = match ($member) {
                    'score' => is_int($item) || is_float($item),
                    'relation' => $item instanceof stdClass && array_keys(get_object_vars($item)) === ['name'] && is_string($item->name),
                    'companies' => true,
                    default => is_string($item),
                };
                if (!$valid) throw new RuntimeException("Malformed $name: expected the record member $member");
            }
            try {
                FormShape::companies($record->companies, false);
            } catch (InvalidArgumentException $error) {
                throw new RuntimeException("Malformed $name: {$error->getMessage()}", 0, $error);
            }
        }
        return $value;
    }

    /** Run one operation under the exclusive store lock. */
    private function locked(callable $operation): mixed
    {
        $handle = fopen($this->file . '.lock', 'c');
        if ($handle === false || !flock($handle, LOCK_EX)) throw new RuntimeException('Cannot lock the record store');
        try {
            return $operation();
        } finally {
            flock($handle, LOCK_UN);
            fclose($handle);
        }
    }

    /** Replace the store file atomically through a temporary file in its directory. */
    private function replace(array $records): void
    {
        $json = FormJson::encode($records) . "\n";
        $temporary = tempnam(dirname($this->file), '.records-');
        if ($temporary === false) throw new RuntimeException('Cannot create the record store file');
        try {
            if (file_put_contents($temporary, $json) !== strlen($json) || !rename($temporary, $this->file)) throw new RuntimeException('Cannot write the record store');
        } finally {
            if (is_file($temporary)) unlink($temporary);
        }
    }

    /** Serialize read/modify/write operations under the store lock; writes replace the file atomically. */
    private function transaction(callable $operation): mixed
    {
        return $this->locked(function () use ($operation): mixed {
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
            if ($missing || $after !== $before) $this->replace($after);
            return $result;
        });
    }
}

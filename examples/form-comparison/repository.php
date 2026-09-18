<?php
declare(strict_types=1);
require_once __DIR__ . '/json.php';
require_once __DIR__ . '/form-shape.php';

/** File-backed company, store and department records for the form comparison example. */
final class FormRepository
{
    /** Open one independent repository per rendering path and framework. */
    public function __construct(private readonly string $file) {}

    /** Return the initial database-shaped records. */
    public static function seed(): array
    {
        return self::fixture('default');
    }

    /** Read the shared stored-record fixture. */
    private static function fixture(string $name): array
    {
        $fixtures = FormJson::arrays(FormJson::decode(file_get_contents(__DIR__ . '/fixtures/records.json')));
        if (!array_key_exists($name, $fixtures)) throw new InvalidArgumentException('Unknown fixture');
        return $fixtures[$name];
    }

    /** Read records under the file lock, creating initial data when necessary. */
    public function read(): array
    {
        return $this->transaction(static fn(array $state): array => [$state, $state]);
    }

    /** Reset only this rendering-path/framework repository. */
    public function reset(string $fixture = 'default'): array
    {
        $state = self::fixture($fixture);
        return $this->transaction(static fn(array $before): array => [$state, $state]);
    }

    /** Convert stored sequences to the 13-digit transport key. */
    private static function key(string $sequence): string
    {
        if (!preg_match('/^[0-9]{1,13}$/', $sequence)) throw new RuntimeException('Invalid stored sequence');
        return '__' . str_pad($sequence, 13, '0', STR_PAD_LEFT) . '__';
    }

    /** Construct keyed form data from stored rows and parent IDs. */
    public static function loadData(array $state): array
    {
        $companies = [];
        usort($state['companies'], static fn($a, $b) => $a['position'] <=> $b['position']);
        foreach ($state['companies'] as $company) {
            $stores = [];
            $storedStores = array_values(array_filter($state['stores'], static fn($row) => $row['company_seq'] === $company['company_seq']));
            usort($storedStores, static fn($a, $b) => $a['position'] <=> $b['position']);
            foreach ($storedStores as $store) {
                $departments = [];
                $storedDepartments = array_values(array_filter($state['departments'], static fn($row) => $row['store_seq'] === $store['store_seq']));
                usort($storedDepartments, static fn($a, $b) => $a['position'] <=> $b['position']);
                foreach ($storedDepartments as $department) {
                    $departments[self::key($department['department_seq'])] = ['name' => $department['name']];
                }
                $row = array_intersect_key($store, array_flip(['name', 'enabled', 'detail', 'title']));
                $row['departments'] = (object) $departments;
                $stores[self::key($store['store_seq'])] = $row;
            }
            $row = ['name' => $company['name'], 'stores' => (object) $stores];
            $companies[self::key($company['company_seq'])] = $row;
        }
        return ['companies' => (object) $companies];
    }

    /**
     * Require the benchmark form, exactly `companies` in its keyed row shape (FormShape), and
     * return it as the validator and the response receive it.
     */
    public static function submission(mixed $form, bool $native): stdClass
    {
        return (object) ['companies' => FormShape::companies(FormShape::members($form, $native, ['companies' => []], 'form')['companies'], $native)];
    }

    /** Reject reuse of a saved child identifier under a different parent. */
    private static function checkParent(string|int $key, array $rows, string $kind, string $parent, string $parentSeq): void
    {
        foreach ($rows as $row) {
            if (self::key($row[$kind . '_seq']) === $key && $row[$parent . '_seq'] !== $parentSeq) throw new InvalidArgumentException('Incorrect parent for ' . $kind . '_seq');
        }
    }

    /** Resolve existing ownership or allocate a new sequence for one row. */
    private static function sequence(string|int $key, array $existing, string $kind, array &$next, array &$seen): string
    {
        $field = $kind . '_seq';
        $sequence = null;
        foreach ($existing as $candidate) {
            if (self::key($candidate[$field]) === $key) {
                $sequence = $candidate[$field];
                break;
            }
        }
        if ($sequence !== null && isset($seen[$sequence])) throw new InvalidArgumentException("Duplicate $field: $sequence");
        if ($sequence === null) {
            $sequence = (string) $next[$kind]++;
            self::key($sequence);
        }
        $seen[$sequence] = true;
        return $sequence;
    }

    /** Save the full collection, allocate IDs, maintain parent IDs and record scoped key changes. */
    public function save(array $data): array
    {
        return $this->transaction(static function (array $before) use ($data): array {
            $next = $before['next'];
            $after = ['next' => [], 'companies' => [], 'stores' => [], 'departments' => []];
            $changes = [];
            $seenCompanies = $seenStores = $seenDepartments = [];
            foreach ($data['companies'] as $companyKey => $company) {
                $companySeq = self::sequence($companyKey, $before['companies'], 'company', $next, $seenCompanies);
                $after['companies'][] = ['company_seq' => $companySeq, 'name' => $company['name'], 'position' => count($after['companies'])];
                $existingStores = array_values(array_filter($before['stores'], static fn($row) => $row['company_seq'] === $companySeq));
                $storePosition = 0;
                foreach ($company['stores'] as $storeKey => $store) {
                    self::checkParent($storeKey, $before['stores'], 'store', 'company', $companySeq);
                    $storeSeq = self::sequence($storeKey, $existingStores, 'store', $next, $seenStores);
                    $storeRow = array_intersect_key($store, array_flip(['name', 'enabled', 'detail', 'title']));
                    $after['stores'][] = ['store_seq' => $storeSeq, 'company_seq' => $companySeq, 'position' => $storePosition++, ...$storeRow];
                    $existingDepartments = array_values(array_filter($before['departments'], static fn($row) => $row['store_seq'] === $storeSeq));
                    $departmentPosition = 0;
                    foreach ($store['departments'] as $departmentKey => $department) {
                        self::checkParent($departmentKey, $before['departments'], 'department', 'store', $storeSeq);
                        $departmentSeq = self::sequence($departmentKey, $existingDepartments, 'department', $next, $seenDepartments);
                        $after['departments'][] = ['department_seq' => $departmentSeq, 'store_seq' => $storeSeq, 'position' => $departmentPosition++, 'name' => $department['name']];
                        if (self::key($departmentSeq) !== $departmentKey) $changes[] = ['path' => "companies.$companyKey.stores.$storeKey.departments", 'oldKey' => $departmentKey, 'newKey' => self::key($departmentSeq)];
                    }
                    if (self::key($storeSeq) !== $storeKey) $changes[] = ['path' => "companies.$companyKey.stores", 'oldKey' => $storeKey, 'newKey' => self::key($storeSeq)];
                }
                if (self::key($companySeq) !== $companyKey) $changes[] = ['path' => 'companies', 'oldKey' => $companyKey, 'newKey' => self::key($companySeq)];
            }
            $after['next'] = $next;
            return [$after, ['storage' => $after, 'data' => self::loadData($after), 'keyChanges' => $changes]];
        });
    }

    /** Serialize read/modify/write operations using one exclusive file lock. */
    private function transaction(callable $operation): array
    {
        $handle = fopen($this->file . '.lock', 'c');
        if ($handle === false || !flock($handle, LOCK_EX)) throw new RuntimeException('Cannot lock the JSON repository');
        try {
            $text = is_file($this->file) ? file_get_contents($this->file) : null;
            if ($text === false) throw new RuntimeException('Cannot read the JSON repository');
            $before = $text === null ? self::seed() : FormJson::arrays(FormJson::decode($text));
            [$after, $result] = $operation($before);
            if ($text === null || $after !== $before) {
                $json = FormJson::encode($after) . "\n";
                $temporary = tempnam(dirname($this->file), '.form-');
                if ($temporary === false) throw new RuntimeException('Cannot create the JSON repository file');
                try {
                    if (file_put_contents($temporary, $json) !== strlen($json) || !rename($temporary, $this->file)) throw new RuntimeException('Cannot write the JSON repository');
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

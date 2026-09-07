<?php
declare(strict_types=1);
require_once __DIR__ . '/json.php';

/** File-backed company, store and department records for the form comparison example. */
final class FormRepository
{
    /** Open one independent repository per revision and framework. */
    public function __construct(private readonly string $file) {}

    /** Return the initial database-shaped records. */
    public static function seed(): array
    {
        return [
            'next' => ['company' => 2, 'store' => 3, 'department' => 2],
            'companies' => [['company_seq' => '1', 'name' => 'Company A', 'position' => 0]],
            'stores' => [
                ['store_seq' => '1', 'company_seq' => '1', 'position' => 0, 'name' => 'Seoul', 'enabled' => '1', 'detail' => 'First store', 'title' => ['ko' => '서울', 'en' => 'Seoul']],
                ['store_seq' => '2', 'company_seq' => '1', 'position' => 1, 'name' => 'Busan', 'enabled' => '', 'detail' => '', 'title' => ['ko' => '부산', 'en' => 'Busan']],
            ],
            'departments' => [['department_seq' => '1', 'store_seq' => '1', 'position' => 0, 'name' => 'Sales']],
        ];
    }

    /** Read records under the file lock, creating initial data when necessary. */
    public function read(): array
    {
        return $this->transaction(static fn(array $state): array => [$state, $state]);
    }

    /** Reset only this revision/framework repository. */
    public function reset(string $fixture = 'default'): array
    {
        $state = match ($fixture) {
            'default' => self::seed(),
            'populated' => self::populatedSeed(),
            'nonsequential' => self::nonsequentialSeed(),
            default => throw new InvalidArgumentException('Unknown fixture'),
        };
        return $this->transaction(static fn(array $before): array => [$state, $state]);
    }

    /** Populate each repeated level so row-operation checks are independent of empty rendering. */
    private static function populatedSeed(): array
    {
        $state = self::seed();
        $state['departments'][] = ['department_seq' => '2', 'store_seq' => '2', 'position' => 0, 'name' => 'Support'];
        $state['next']['department'] = 3;
        return $state;
    }

    /** Stored identity order is independent of sequence magnitude. */
    private static function nonsequentialSeed(): array
    {
        $state = ['next' => ['company' => 8, 'store' => 8, 'department' => 8], 'companies' => [], 'stores' => [], 'departments' => []];
        foreach (['5', '7', '1'] as $position => $sequence) {
            $state['companies'][] = ['company_seq' => $sequence, 'name' => "Company $sequence", 'position' => $position];
            $state['stores'][] = ['store_seq' => $sequence, 'company_seq' => $sequence, 'position' => 0,
                'name' => "Store $sequence", 'enabled' => '1', 'detail' => "Notes $sequence", 'title' => ['ko' => $sequence, 'en' => $sequence]];
            $state['departments'][] = ['department_seq' => $sequence, 'store_seq' => $sequence, 'position' => 0, 'name' => "Department $sequence"];
        }
        return $state;
    }

    /** Convert stored sequences to the 13-digit transport key. */
    private static function key(string $sequence): string
    {
        if (!preg_match('/^[0-9]{1,13}$/', $sequence)) throw new RuntimeException('Invalid stored sequence');
        return '__' . str_pad($sequence, 13, '0', STR_PAD_LEFT) . '__';
    }

    /** Construct the revision-specific form data from stored rows and parent IDs. */
    public static function loadData(array $state, string $mode): array
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
                    $row = ['name' => $department['name']];
                    if ($mode === 'original') {
                        $row['department_seq'] = $department['department_seq'];
                        $departments[] = $row;
                    } else $departments[self::key($department['department_seq'])] = $row;
                }
                $row = array_intersect_key($store, array_flip(['name', 'enabled', 'detail', 'title']));
                $row['departments'] = $mode === 'keyed' ? (object) $departments : $departments;
                if ($mode === 'original') {
                    $row['store_seq'] = $store['store_seq'];
                    $stores[] = $row;
                } else $stores[self::key($store['store_seq'])] = $row;
            }
            $row = ['name' => $company['name'], 'stores' => $mode === 'keyed' ? (object) $stores : $stores];
            if ($mode === 'original') {
                $row['company_seq'] = $company['company_seq'];
                $companies[] = $row;
            } else $companies[self::key($company['company_seq'])] = $row;
        }
        return ['companies' => $mode === 'keyed' ? (object) $companies : $companies];
    }

    /** Validate collection shape without translating between array and keyed contracts. */
    public static function rows(mixed $value, string $mode, string $path): array
    {
        if (!is_array($value)) throw new InvalidArgumentException("Expected collection: $path");
        if ($mode === 'original' && !array_is_list($value)) throw new InvalidArgumentException("Expected index array: $path");
        if ($mode === 'keyed') foreach (array_keys($value) as $key) {
            if (!is_string($key) || !preg_match('/^__[a-f0-9]{13}__$/', $key)) throw new InvalidArgumentException("Invalid row key: $path");
        }
        foreach ($value as $row) if (!is_array($row) || ($row !== [] && array_is_list($row))) throw new InvalidArgumentException("Expected row object: $path");
        return $value;
    }

    /** Fill values omitted by native HTML submission, retaining the submitted structure. */
    public static function normalize(array $data, string $mode): array
    {
        $companies = self::rows(array_key_exists('companies', $data) ? $data['companies'] : [], $mode, 'companies');
        foreach ($companies as $companyKey => &$company) {
            $company['name'] = self::text($company['name'] ?? '');
            $company['stores'] = self::rows(array_key_exists('stores', $company) ? $company['stores'] : [], $mode, "companies.$companyKey.stores");
            foreach ($company['stores'] as $storeKey => &$store) {
                $store['name'] = self::text($store['name'] ?? '');
                $store['enabled'] = self::text($store['enabled'] ?? '');
                if (!in_array($store['enabled'], ['', '1'], true)) throw new InvalidArgumentException('Expected checkbox value 1 or empty string');
                $store['detail'] = self::text($store['detail'] ?? '');
                $title = $store['title'] ?? [];
                if (!is_array($title) || ($title !== [] && array_is_list($title))) throw new InvalidArgumentException('Expected language object');
                $store['title'] = ['ko' => self::text($title['ko'] ?? ''), 'en' => self::text($title['en'] ?? '')];
                $store['departments'] = self::rows(array_key_exists('departments', $store) ? $store['departments'] : [], $mode, "companies.$companyKey.stores.$storeKey.departments");
                foreach ($store['departments'] as &$department) $department['name'] = self::text($department['name'] ?? '');
                unset($department);
            }
            unset($store);
        }
        unset($company);
        return ['companies' => $companies];
    }

    /** Preserve object and array types in JSON output, including empty collections. */
    public static function wireData(array $data, string $mode): array
    {
        if ($mode === 'original') return $data;
        foreach ($data['companies'] as &$company) {
            foreach ($company['stores'] as &$store) $store['departments'] = (object) $store['departments'];
            unset($store);
            $company['stores'] = (object) $company['stores'];
        }
        unset($company);
        $data['companies'] = (object) $data['companies'];
        return $data;
    }

    /** Check JSON collection types before converting PHP objects to associative arrays. */
    public static function checkJsonShape(mixed $data, string $mode): void
    {
        if (!$data instanceof stdClass) throw new InvalidArgumentException('Expected form object');
        $walk = static function (mixed $rows, int $level) use (&$walk, $mode): void {
            if ($mode === 'original' ? !is_array($rows) : !$rows instanceof stdClass) throw new InvalidArgumentException('Incorrect JSON collection type');
            foreach ($rows as $row) {
                if (!$row instanceof stdClass) throw new InvalidArgumentException('Expected row object');
                if ($level === 1 && property_exists($row, 'title') && !$row->title instanceof stdClass) throw new InvalidArgumentException('Expected language object');
                $child = ['stores', 'departments'][$level] ?? null;
                if ($child !== null && property_exists($row, $child)) $walk($row->$child, $level + 1);
            }
        };
        if (property_exists($data, 'companies')) $walk($data->companies, 0);
    }

    /** Reject reuse of a saved child identifier under a different parent. */
    private static function checkParent(string|int $key, array $rows, string $kind, string $parent, string $parentSeq, string $mode): void
    {
        if ($mode !== 'keyed') return;
        foreach ($rows as $row) {
            if (self::key($row[$kind . '_seq']) === $key && $row[$parent . '_seq'] !== $parentSeq) throw new InvalidArgumentException('Incorrect parent for ' . $kind . '_seq');
        }
    }

    /** Convert a scalar request field to its stored string value. */
    private static function text(mixed $value): string
    {
        if (!is_scalar($value) && $value !== null) throw new InvalidArgumentException('Expected scalar field value');
        return (string) $value;
    }

    /** Resolve existing ownership or allocate a new sequence for one row. */
    private static function sequence(string|int $key, array $row, array $existing, string $kind, string $mode, array &$next, array &$seen): string
    {
        $field = $kind . '_seq';
        $requested = $mode === 'original' ? self::text($row[$field] ?? '') : '';
        $sequence = null;
        foreach ($existing as $candidate) {
            if (($mode === 'keyed' && self::key($candidate[$field]) === $key) ||
                ($mode === 'original' && $candidate[$field] === $requested)) {
                $sequence = $candidate[$field];
                break;
            }
        }
        if ($mode === 'original' && $requested !== '' && $sequence === null) throw new InvalidArgumentException("Unknown or incorrectly owned $field: $requested");
        if ($sequence !== null && isset($seen[$sequence])) throw new InvalidArgumentException("Duplicate $field: $sequence");
        if ($sequence === null) {
            $sequence = (string) $next[$kind]++;
            self::key($sequence);
        }
        $seen[$sequence] = true;
        return $sequence;
    }

    /** Save the full collection, allocate IDs, maintain parent IDs and record scoped key changes. */
    public function save(array $data, string $mode): array
    {
        return $this->transaction(static function (array $before) use ($data, $mode): array {
            $next = $before['next'];
            $after = ['next' => [], 'companies' => [], 'stores' => [], 'departments' => []];
            $changes = [];
            $seenCompanies = $seenStores = $seenDepartments = [];
            foreach ($data['companies'] as $companyKey => $company) {
                $companySeq = self::sequence($companyKey, $company, $before['companies'], 'company', $mode, $next, $seenCompanies);
                $after['companies'][] = ['company_seq' => $companySeq, 'name' => $company['name'], 'position' => count($after['companies'])];
                $existingStores = array_values(array_filter($before['stores'], static fn($row) => $row['company_seq'] === $companySeq));
                $storePosition = 0;
                foreach ($company['stores'] as $storeKey => $store) {
                    self::checkParent($storeKey, $before['stores'], 'store', 'company', $companySeq, $mode);
                    $storeSeq = self::sequence($storeKey, $store, $existingStores, 'store', $mode, $next, $seenStores);
                    $storeRow = array_intersect_key($store, array_flip(['name', 'enabled', 'detail', 'title']));
                    $after['stores'][] = ['store_seq' => $storeSeq, 'company_seq' => $companySeq, 'position' => $storePosition++, ...$storeRow];
                    $existingDepartments = array_values(array_filter($before['departments'], static fn($row) => $row['store_seq'] === $storeSeq));
                    $departmentPosition = 0;
                    foreach ($store['departments'] as $departmentKey => $department) {
                        self::checkParent($departmentKey, $before['departments'], 'department', 'store', $storeSeq, $mode);
                        $departmentSeq = self::sequence($departmentKey, $department, $existingDepartments, 'department', $mode, $next, $seenDepartments);
                        $after['departments'][] = ['department_seq' => $departmentSeq, 'store_seq' => $storeSeq, 'position' => $departmentPosition++, 'name' => $department['name']];
                        if ($mode === 'keyed' && self::key($departmentSeq) !== $departmentKey) $changes[] = ['path' => "companies.$companyKey.stores.$storeKey.departments", 'oldKey' => $departmentKey, 'newKey' => self::key($departmentSeq)];
                    }
                    if ($mode === 'keyed' && self::key($storeSeq) !== $storeKey) $changes[] = ['path' => "companies.$companyKey.stores", 'oldKey' => $storeKey, 'newKey' => self::key($storeSeq)];
                }
                if ($mode === 'keyed' && self::key($companySeq) !== $companyKey) $changes[] = ['path' => 'companies', 'oldKey' => $companyKey, 'newKey' => self::key($companySeq)];
            }
            $after['next'] = $next;
            return [$after, ['storage' => $after, 'data' => self::loadData($after, $mode), 'keyChanges' => $changes]];
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

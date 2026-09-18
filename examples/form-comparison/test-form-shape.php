<?php
declare(strict_types=1);
require __DIR__ . '/records.php';
require __DIR__ . '/repository.php';

function checkRecords(bool $condition, string $message): void
{
    if (!$condition) throw new RuntimeException($message);
}

/** Whether the submission is rejected as malformed input. */
function rejected(mixed $form, bool $native): bool
{
    try {
        RecordStore::submission($form, $native);
    } catch (InvalidArgumentException) {
        return true;
    }
    return false;
}

$json = '{"id":"1","name":"N","status":"active","joined":"2024-01-01","score":"1","relation":{"name":"R"},"markup":"",'
    . '"companies":{"__00000000000b2__":{"name":"B","stores":{}},"__00000000000a1__":{"name":"A","stores":{"__00000000000c3__":'
    . '{"name":"S","enabled":"","detail":"Hidden notes","title":{"ko":"가","en":"A"},"departments":{"__00000000000d4__":{"name":"D"}}}}}}}';
$expected = FormJson::encode(FormJson::decode($json));
checkRecords(FormJson::encode(RecordStore::submission(FormJson::decode($json), false)) === $expected, 'A JSON submission keeps its members, rows, keys and order');

// A native submission omits an unchecked checkbox and a collection without rows.
$native = [
    'markup' => '', 'companies' => [
        '__00000000000b2__' => ['name' => 'B'],
        '__00000000000a1__' => ['name' => 'A', 'stores' => ['__00000000000c3__' => [
            'title' => ['en' => 'A', 'ko' => '가'], 'detail' => 'Hidden notes', 'name' => 'S',
            'departments' => ['__00000000000d4__' => ['name' => 'D']],
        ]]],
    ],
    'id' => '1', 'name' => 'N', 'status' => 'active', 'joined' => '2024-01-01', 'score' => '1', 'relation' => ['name' => 'R'],
];
checkRecords(FormJson::encode(RecordStore::submission($native, true)) === $expected, 'A native submission is completed to the stored shape in member order');
$noCompanies = $native;
unset($noCompanies['companies']);
checkRecords(FormJson::encode(RecordStore::submission($noCompanies, true)->companies) === '{}', 'A native submission without companies has no rows');

$variant = static function (callable $change) use ($json): stdClass {
    $form = FormJson::decode($json);
    $change($form);
    return $form;
};
$store = static fn(stdClass $form): stdClass => $form->companies->__00000000000a1__->stores->__00000000000c3__;
foreach ([
    'companies is text' => $variant(static function (stdClass $form): void { $form->companies = 'x'; }),
    'companies is an array' => $variant(static function (stdClass $form): void { $form->companies = []; }),
    'companies is missing' => $variant(static function (stdClass $form): void { unset($form->companies); }),
    'row key is not a row key' => $variant(static function (stdClass $form): void { $form->companies = (object) ['first' => $form->companies->__00000000000b2__]; }),
    'row key has upper case' => $variant(static function (stdClass $form): void { $form->companies = (object) ['__00000000000B2__' => $form->companies->__00000000000b2__]; }),
    'stores is an array' => $variant(static function (stdClass $form): void { $form->companies->__00000000000b2__->stores = []; }),
    'store name is null' => $variant(static function (stdClass $form) use ($store): void { $store($form)->name = null; }),
    'company misses stores' => $variant(static function (stdClass $form): void { unset($form->companies->__00000000000b2__->stores); }),
    'store has another member' => $variant(static function (stdClass $form) use ($store): void { $store($form)->extra = 'x'; }),
    'store misses enabled' => $variant(static function (stdClass $form) use ($store): void { unset($store($form)->enabled); }),
    'enabled is not a checkbox value' => $variant(static function (stdClass $form) use ($store): void { $store($form)->enabled = 'yes'; }),
    'title misses a language' => $variant(static function (stdClass $form) use ($store): void { $store($form)->title = (object) ['ko' => 'x']; }),
    'title has another language' => $variant(static function (stdClass $form) use ($store): void { $store($form)->title->ja = 'x'; }),
    'title is text' => $variant(static function (stdClass $form) use ($store): void { $store($form)->title = 'x'; }),
    'department name is a number' => $variant(static function (stdClass $form) use ($store): void { $store($form)->departments = (object) ['__0000000000001__' => (object) ['name' => 1]]; }),
    'row is text' => $variant(static function (stdClass $form): void { $form->companies->__00000000000b2__ = 'x'; }),
] as $name => $form) {
    checkRecords(rejected($form, false), "JSON: $name must be rejected");
}

$nativeStore = static function (callable $change) use ($native): array {
    $form = $native;
    $change($form['companies']['__00000000000a1__']['stores']['__00000000000c3__']);
    return $form;
};
foreach ([
    'enabled is not a checkbox value' => $nativeStore(static function (array &$store): void { $store['enabled'] = 'yes'; }),
    'enabled is nested' => $nativeStore(static function (array &$store): void { $store['enabled'] = ['1']; }),
    'store misses its name' => $nativeStore(static function (array &$store): void { unset($store['name']); }),
    'store misses its title' => $nativeStore(static function (array &$store): void { unset($store['title']); }),
    'departments is a list' => $nativeStore(static function (array &$store): void { $store['departments'] = [['name' => 'D']]; }),
    'companies is text' => (static function () use ($native): array { $form = $native; $form['companies'] = 'x'; return $form; })(),
] as $name => $form) {
    checkRecords(rejected($form, true), "Native: $name must be rejected");
}

// The benchmark form holds `companies` alone and follows the same rule.
$benchmark = static fn(mixed $form, bool $native): string => FormJson::encode(FormRepository::submission($form, $native)->companies);
$companies = FormJson::encode(FormJson::decode($json)->companies);
checkRecords($benchmark((object) ['companies' => FormJson::decode($json)->companies], false) === $companies, 'The benchmark JSON form keeps its rows');
checkRecords($benchmark(['companies' => $native['companies']], true) === $companies, 'The benchmark native form is completed as the record form is');
checkRecords($benchmark([], true) === '{}', 'A benchmark native form without rows has no companies');
foreach ([[(object) [], false], [(object) ['companies' => (object) [], 'extra' => 'x'], false], [['companies' => [], 'extra' => 'x'], true]] as [$form, $isNative]) {
    $failed = false;
    try { $benchmark($form, $isNative); } catch (InvalidArgumentException) { $failed = true; }
    checkRecords($failed, 'A benchmark form has exactly companies');
}

// A stored record follows the same companies rule: a malformed store fails every read and save and
// is kept byte for byte; reset replaces it with the fixture.
$directory = sys_get_temp_dir() . '/crudui-form-shape-' . bin2hex(random_bytes(6));
mkdir($directory);
try {
    $fixtureFile = __DIR__ . '/fixtures/customer-records.json';
    $storeFile = "$directory/records-php.json";
    $recordStore = new RecordStore($storeFile, $fixtureFile);
    $fixture = FormJson::decode((string) file_get_contents($fixtureFile));
    $withoutCompanies = FormJson::decode((string) file_get_contents($fixtureFile));
    unset($withoutCompanies[0]->companies);
    $otherKey = FormJson::decode((string) file_get_contents($fixtureFile));
    $otherKey[0]->companies = (object) ['first' => FormJson::decode($json)->companies->__00000000000b2__];
    foreach ([
        'not JSON' => 'not json',
        'a record without companies' => FormJson::encode($withoutCompanies),
        'a company row key that is not a row key' => FormJson::encode($otherKey),
    ] as $name => $bytes) {
        file_put_contents($storeFile, $bytes);
        foreach ([
            'read' => static fn() => $recordStore->read(),
            'save' => static fn() => $recordStore->save('1', RecordStore::submission(FormJson::decode($json), false)),
        ] as $operation => $call) {
            $failed = false;
            try { $call(); } catch (RuntimeException) { $failed = true; }
            checkRecords($failed, "A store with $name fails the $operation");
        }
        checkRecords(file_get_contents($storeFile) === $bytes, "A store with $name is kept");
    }
    checkRecords($recordStore->reset() === count($fixture), 'Reset over a malformed store answers the fixture count');
    checkRecords(FormJson::encode($recordStore->read()) === FormJson::encode($fixture), 'Reset replaces a malformed store with the fixture');
} finally {
    foreach (glob("$directory/{,.}*", GLOB_BRACE) ?: [] as $file) if (is_file($file)) unlink($file);
    rmdir($directory);
}

echo "Form shape tests passed\n";

<?php

declare(strict_types=1);

namespace Polyspec\Crudui\FormComparison\Tests;

use InvalidArgumentException;
use PHPUnit\Framework\TestCase;
use Polyspec\Crudui\FormComparison\FormJson;
use Polyspec\Crudui\FormComparison\FormRepository;
use Polyspec\Crudui\FormComparison\RecordStore;
use RuntimeException;
use stdClass;

/** RecordStore and FormRepository complete a submission to its stored shape and refuse one of another shape. */
final class FormShapeTest extends TestCase
{
    public function testSubmissionsCompleteToTheStoredShapeAndMalformedOnesFail(): void
    {
        $json = '{"id":"1","name":"N","status":"active","joined":"2024-01-01","score":"1",'
            . '"relation":{"name":"R"},"markup":"",'
            . '"companies":{"__00000000000b2__":{"name":"B","stores":{}},'
            . '"__00000000000a1__":{"name":"A","stores":{"__00000000000c3__":'
            . '{"name":"S","enabled":"","detail":"Hidden notes","title":{"ko":"가","en":"A"},'
            . '"departments":{"__00000000000d4__":{"name":"D"}}}}}}}';
        $expected = FormJson::encode(FormJson::decode($json));
        self::assertTrue(
            FormJson::encode(RecordStore::submission(FormJson::decode($json), false)) === $expected,
            'A JSON submission keeps its members, rows, keys and order'
        );

        // Form data leaves out a field that holds no value (a native form also an unchecked checkbox and a
        // collection without rows); both media types complete it.
        $native = [
            'markup' => '', 'companies' => [
                '__00000000000b2__' => ['name' => 'B'],
                '__00000000000a1__' => ['name' => 'A', 'stores' => ['__00000000000c3__' => [
                    'title' => ['en' => 'A', 'ko' => '가'], 'detail' => 'Hidden notes', 'name' => 'S',
                    'departments' => ['__00000000000d4__' => ['name' => 'D']],
                ]]],
            ],
            'id' => '1',
            'name' => 'N',
            'status' => 'active',
            'joined' => '2024-01-01',
            'score' => '1',
            'relation' => ['name' => 'R'],
        ];
        self::assertTrue(
            FormJson::encode(RecordStore::submission($native, true)) === $expected,
            'A native submission is completed to the stored shape in member order'
        );
        self::assertTrue(
            FormJson::encode(RecordStore::submission(FormJson::decode(json_encode($native)), false)) === $expected,
            'A JSON submission is completed as the native one is'
        );
        $noCompanies = $native;
        unset($noCompanies['companies']);
        self::assertTrue(
            FormJson::encode(RecordStore::submission($noCompanies, true)->companies) === '{}',
            'A native submission without companies has no rows'
        );
        self::assertTrue(
            FormJson::encode(RecordStore::submission((object) ['id' => '1'], false))
                === '{"id":"1","name":"","status":"","joined":"","score":"","relation":{"name":""},"markup":"",'
                    . '"companies":{}}',
            'Every absent member but id completes as its empty value'
        );
        $added = '{"__00000000000a1__":{"stores":{"__00000000000c3__":'
            . '{"enabled":"1","departments":{"__00000000000d4__":{}}}}}}';
        $completedRow = '{"__00000000000a1__":{"name":"","stores":{"__00000000000c3__":'
            . '{"name":"","enabled":"1","detail":"",'
            . '"title":{"ko":"","en":""},"departments":{"__00000000000d4__":{"name":""}}}}}}';
        self::assertTrue(
            FormJson::encode(
                RecordStore::submission(
                    (object) ['id' => '1', 'companies' => FormJson::decode($added)],
                    false
                )->companies
            ) === $completedRow,
            'A new JSON row completes its absent members'
        );

        $variant = static function (callable $change) use ($json): stdClass {
            $form = FormJson::decode($json);
            $change($form);
            return $form;
        };
        $store = static fn(stdClass $form): stdClass => $form->companies->__00000000000a1__->stores->__00000000000c3__;
        foreach (
            [
            'id is missing' => $variant(static function (stdClass $form): void {
                unset($form->id);
            }),
            'relation misses name' => $variant(static function (stdClass $form): void {
                $form->relation = (object) [];
            }),
            'relation has another member' => $variant(static function (stdClass $form): void {
                $form->relation->extra = 'x';
            }),
            'companies is text' => $variant(static function (stdClass $form): void {
                $form->companies = 'x';
            }),
            'companies is an array' => $variant(static function (stdClass $form): void {
                $form->companies = [];
            }),
            'row key is not a row key' => $variant(static function (stdClass $form): void {
                $form->companies = (object) ['first' => $form->companies->__00000000000b2__];
            }),
            'row key has upper case' => $variant(static function (stdClass $form): void {
                $form->companies = (object) ['__00000000000B2__' => $form->companies->__00000000000b2__];
            }),
            'stores is an array' => $variant(static function (stdClass $form): void {
                $form->companies->__00000000000b2__->stores = [];
            }),
            'store name is null' => $variant(static function (stdClass $form) use ($store): void {
                $store($form)->name = null;
            }),
            'store has another member' => $variant(static function (stdClass $form) use ($store): void {
                $store($form)->extra = 'x';
            }),
            'enabled is not a checkbox value' => $variant(static function (stdClass $form) use ($store): void {
                $store($form)->enabled = 'yes';
            }),
            'title misses a language' => $variant(static function (stdClass $form) use ($store): void {
                $store($form)->title = (object) ['ko' => 'x'];
            }),
            'title has another language' => $variant(static function (stdClass $form) use ($store): void {
                $store($form)->title->ja = 'x';
            }),
            'title is text' => $variant(static function (stdClass $form) use ($store): void {
                $store($form)->title = 'x';
            }),
            'department name is a number' => $variant(static function (stdClass $form) use ($store): void {
                $store($form)->departments = (object) ['__0000000000001__' => (object) ['name' => 1]];
            }),
            'row is text' => $variant(static function (stdClass $form): void {
                $form->companies->__00000000000b2__ = 'x';
            }),
            ] as $name => $form
        ) {
            self::assertTrue(self::rejected($form, false), "JSON: $name must be rejected");
        }

        $nativeStore = static function (callable $change) use ($native): array {
            $form = $native;
            $change($form['companies']['__00000000000a1__']['stores']['__00000000000c3__']);
            return $form;
        };
        foreach (
            [
            'enabled is not a checkbox value' => $nativeStore(static function (array &$store): void {
                $store['enabled'] = 'yes';
            }),
            'enabled is nested' => $nativeStore(static function (array &$store): void {
                $store['enabled'] = ['1'];
            }),
            'departments is a list' => $nativeStore(static function (array &$store): void {
                $store['departments'] = [['name' => 'D']];
            }),
            'companies is text' => (static function () use ($native): array {
                $form = $native;
                $form['companies'] = 'x';
                return $form;
            })(),
            ] as $name => $form
        ) {
            self::assertTrue(self::rejected($form, true), "Native: $name must be rejected");
        }

        // The benchmark form holds `companies` alone and follows the same rule.
        $benchmark = static fn(mixed $form, bool $native): string
            => FormJson::encode(FormRepository::submission($form, $native)->companies);
        $companies = FormJson::encode(FormJson::decode($json)->companies);
        self::assertTrue(
            $benchmark((object) ['companies' => FormJson::decode($json)->companies], false) === $companies,
            'The benchmark JSON form keeps its rows'
        );
        self::assertTrue(
            $benchmark(['companies' => $native['companies']], true) === $companies,
            'The benchmark native form is completed as the record form is'
        );
        self::assertTrue($benchmark([], true) === '{}', 'A benchmark native form without rows has no companies');
        self::assertTrue(
            $benchmark((object) [], false) === '{}',
            'A benchmark JSON form without rows has no companies'
        );
        self::assertTrue(
            $benchmark((object) ['companies' => FormJson::decode($added)], false) === $completedRow,
            'A benchmark JSON form completes a new row'
        );
        $extraMembers = [
            [(object) ['companies' => (object) [], 'extra' => 'x'], false],
            [['companies' => [], 'extra' => 'x'], true],
        ];
        foreach ($extraMembers as [$form, $isNative]) {
            $failed = false;
            try {
                $benchmark($form, $isNative);
            } catch (InvalidArgumentException) {
                $failed = true;
            }
            self::assertTrue($failed, 'A benchmark form has only companies');
        }

        // A stored record follows the same companies rule: a malformed store fails every read and save and
        // is kept byte for byte; reset replaces it with the fixture.
        $directory = sys_get_temp_dir() . '/crudui-form-shape-' . bin2hex(random_bytes(6));
        mkdir($directory);
        try {
            $fixtureFile = dirname(__DIR__, 3) . '/fixtures/customer-records.json';
            $storeFile = "$directory/records-php.json";
            $recordStore = new RecordStore($storeFile, $fixtureFile);
            $fixture = FormJson::decode((string) file_get_contents($fixtureFile));
            $withoutCompanies = FormJson::decode((string) file_get_contents($fixtureFile));
            unset($withoutCompanies[0]->companies);
            $otherKey = FormJson::decode((string) file_get_contents($fixtureFile));
            $otherKey[0]->companies = (object) ['first' => FormJson::decode($json)->companies->__00000000000b2__];
            // A stored record holds its companies complete, in member order; the store does not complete them.
            $incomplete = FormJson::decode((string) file_get_contents($fixtureFile));
            $incomplete[0]->companies = FormJson::decode('{"__00000000000b2__":{"name":"B"}}');
            $outOfOrder = FormJson::decode((string) file_get_contents($fixtureFile));
            $outOfOrder[0]->companies = FormJson::decode('{"__00000000000b2__":{"stores":{},"name":"B"}}');
            foreach (
                [
                'not JSON' => 'not json',
                'a record without companies' => FormJson::encode($withoutCompanies),
                'a company row key that is not a row key' => FormJson::encode($otherKey),
                'a company without stores' => FormJson::encode($incomplete),
                'company members out of order' => FormJson::encode($outOfOrder),
                ] as $name => $bytes
            ) {
                file_put_contents($storeFile, $bytes);
                foreach (
                    [
                    'read' => static fn() => $recordStore->read(),
                    'save' => static fn() => $recordStore->save(
                        '1',
                        RecordStore::submission(FormJson::decode($json), false)
                    ),
                    ] as $operation => $call
                ) {
                    $failed = false;
                    try {
                        $call();
                    } catch (RuntimeException) {
                        $failed = true;
                    }
                    self::assertTrue($failed, "A store with $name fails the $operation");
                }
                self::assertTrue(file_get_contents($storeFile) === $bytes, "A store with $name is kept");
            }
            self::assertTrue(
                $recordStore->reset() === count($fixture),
                'Reset over a malformed store answers the fixture count'
            );
            self::assertTrue(
                FormJson::encode($recordStore->read()) === FormJson::encode($fixture),
                'Reset replaces a malformed store with the fixture'
            );
        } finally {
            foreach (glob("$directory/{,.}*", GLOB_BRACE) ?: [] as $file) {
                if (is_file($file)) {
                    unlink($file);
                }
            }
            rmdir($directory);
        }
    }

    /** Whether the submission is rejected as malformed input. */
    private static function rejected(mixed $form, bool $native): bool
    {
        try {
            RecordStore::submission($form, $native);
        } catch (InvalidArgumentException) {
            return true;
        }
        return false;
    }
}

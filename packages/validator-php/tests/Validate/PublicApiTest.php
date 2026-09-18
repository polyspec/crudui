<?php

declare(strict_types=1);

namespace CRUDUI\Validator\Tests\Validate;

use PHPUnit\Framework\TestCase;
use CRUDUI\Validator;
use stdClass;

final class PublicApiTest extends TestCase
{
    public function testPublicValidationRejectsInvalidUtf8ValuesAndObjectKeys(): void
    {
        foreach ([': data.name' => ['name' => "\xC3\x28"], ': data' => (object) ["key\xFF" => 'value']] as $location => $data) {
            try {
                Validator::validate([], $data);
                self::fail('Invalid UTF-8 must fail before validation');
            } catch (Validator\Validate\FormInputError $error) {
                self::assertSame('Text must be Unicode scalar values' . $location, $error->getMessage());
            }
        }
        self::assertTrue(Validator::validate([], ['name' => '한글 🎉'])->valid);
    }

    public function testCompositionTraceIsSeparateFromTheExceptionStack(): void
    {
        $error = new \CRUDUI\Validator\Compose\ComposeLoadError('REF_CYCLE', 'Reference cycle', ['a', 'b', 'a']);
        self::assertSame(['a', 'b', 'a'], $error->getCompositionTrace());
        self::assertSame('REF_CYCLE', $error->getErrorCode());
        self::assertSame('REF_CYCLE', $error->code);
        self::assertTrue(isset($error->code));
        self::assertNotSame($error->getCompositionTrace(), $error->getTrace());
        self::assertFalse((new \ReflectionClass($error))->hasProperty('trace'));
    }

    public function testReturnsObjectRecordsAndPreservesEmptyCollectionValueTypes(): void
    {
        $spec = json_decode('{"type":"group","properties":{"object":{"type":"text","validate":{"required":true}},"array":{"type":"text","validate":{"required":true}},"null":{"type":"text","validate":{"required":true}}}}');
        $result = Validator::validate($spec, json_decode('{"object":{},"array":[],"null":null}'));
        self::assertInstanceOf(stdClass::class, $result);
        self::assertFalse($result->valid);
        self::assertCount(3, $result->errors);
        self::assertInstanceOf(stdClass::class, $result->errors[0]);
        self::assertInstanceOf(stdClass::class, $result->errors[0]->value);
        self::assertSame([], $result->errors[1]->value);
        self::assertNull($result->errors[2]->value);
    }

    /** Four times the rows take about four times as long to check for uniqueness, not sixteen. */
    public function testUniqueRowsTakeTimeLinearInTheRows(): void
    {
        $spec = json_decode('{"type":"group","properties":{"checked":{"type":"number"},"rows":{"type":"group","multiple":true,'
            . '"validate":{"unique":"checked == 1"},"properties":{"name":{"type":"text"},"enabled":{"type":"number"}}}}}');
        $time = static function (int $count) use ($spec): float {
            $rows = [];
            for ($i = 0; $i < $count; $i++) {
                $rows["row{$i}"] = ['name' => "row {$i}", 'enabled' => 1];
            }
            $best = INF;
            for ($run = 0; $run < 3; $run++) {
                $started = hrtime(true);
                self::assertTrue(Validator::validate($spec, ['checked' => 1, 'rows' => $rows])->valid);
                $best = min($best, (hrtime(true) - $started) / 1e9);
            }
            return $best;
        };
        $small = $time(4000);
        $large = $time(16000);
        self::assertLessThan($small * 8, $large, sprintf('4000 rows: %.4fs, 16000 rows: %.4fs', $small, $large));
        $duplicate = ['checked' => 1, 'rows' => ['a' => ['name' => 'same', 'enabled' => 1], 'b' => ['name' => 'same', 'enabled' => 1]]];
        self::assertFalse(Validator::validate($spec, $duplicate)->valid);
    }

    public function testNumericObjectMembershipRemainsDistinctFromAnArrayOfLabels(): void
    {
        $object = json_decode('{"type":"group","properties":{"choice":{"type":"select","validate":{"in":{"0":"First","1":"Second"}}}}}');
        $array = json_decode('{"type":"group","properties":{"choice":{"type":"select","validate":{"in":["First","Second"]}}}}');
        self::assertTrue(Validator::validate($object, ['choice' => '0'])->valid);
        self::assertFalse(Validator::validate($array, ['choice' => '0'])->valid);
        self::assertTrue(Validator::validate($array, ['choice' => 'First'])->valid);
        self::assertFalse(Validator::validate($object, ['choice' => 'First'])->valid);
    }

    public function testObjectDataSupportsNestedRulesAndCounts(): void
    {
        $spec = json_decode('{"type":"group","properties":{"rows":{"type":"group","multiple":{},"validate":{"mincount":2},"properties":{"name":{"type":"text","validate":{"required":true}}}}}}');
        $result = Validator::validate($spec, json_decode('{"rows":{"__0000000000007__":{"name":""}}}'));
        self::assertFalse($result->valid);
        self::assertCount(2, $result->errors);
        self::assertSame('rows.__0000000000007__.name', $result->errors[0]->path);
        self::assertSame('mincount', $result->errors[1]->rule);
        self::assertInstanceOf(stdClass::class, $result->errors[1]->value);
    }

    public function testPublicClassesUseComposerClassAutoloading(): void
    {
        $reflection = new \ReflectionClass(Validator::class);
        self::assertFalse($reflection->isInternal());
        self::assertFalse(class_exists('CRUDUI\Validator\Validate\Validate'));
        self::assertFalse(class_exists('CRUDUI\Validator\Validate\ListValidate'));
        self::assertSame(['spec', 'data', 'options'], array_map(static fn ($parameter) => $parameter->getName(), $reflection->getMethod('validate')->getParameters()));
    }

    public function testCompositionRejectsExplicitArraysWhereObjectsAreRequired(): void
    {
        foreach ([['spec' => '{"$patch":[]}', 'files' => new stdClass(), 'code' => 'PATCH_SHAPE'], ['spec' => '{"$ref":"bad"}', 'files' => json_decode('{"bad":{"properties":[]}}'), 'code' => 'REF_DETECT_KEY_NOT_FOUND']] as $case) {
            try {
                Validator::validate(json_decode($case['spec']), [], ['files' => $case['files']]);
                self::fail('Array must not be accepted as a composition object');
            } catch (\CRUDUI\Validator\Compose\ComposeLoadError $error) {
                self::assertSame($case['code'], $error->getErrorCode());
            }
        }
        self::assertTrue(Validator::validate(json_decode('{"$patch":{}}'), [])->valid);
    }
}

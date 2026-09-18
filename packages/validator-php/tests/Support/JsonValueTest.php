<?php

declare(strict_types=1);

namespace CRUDUI\Validator\Tests\Support;

use CRUDUI\Validator\Support\JsonValue;
use PHPUnit\Framework\TestCase;
use stdClass;

/** Specification member order: array index names ascending, then other names in insertion order. */
final class JsonValueTest extends TestCase
{
    public function testOrderedListsArrayIndexNamesFirstAndKeepsOtherNamesInInsertionOrder(): void
    {
        $spec = json_decode('{"b":1,"10":2,"a":3,"4294967295":4,"2":5,"01":6,"-1":7,"0":8,"4294967294":9}', false, 512, JSON_THROW_ON_ERROR);

        $ordered = JsonValue::ordered($spec);

        self::assertInstanceOf(stdClass::class, $ordered);
        self::assertSame(['0', '2', '10', '4294967294', 'b', 'a', '4294967295', '01', '-1'], self::names($ordered));
        self::assertSame(['b', '10', 'a', '4294967295', '2', '01', '-1', '0', '4294967294'], self::names($spec), 'the input is not reordered');
    }

    public function testOrderedReordersNestedObjectsAndObjectsInsideLists(): void
    {
        $spec = json_decode('{"properties":{"b":{"multiple":{"z":1,"5":1}},"10":{}},"items":[{"y":1,"1":2},3]}', false, 512, JSON_THROW_ON_ERROR);

        $ordered = JsonValue::ordered($spec);

        self::assertSame(['properties', 'items'], self::names($ordered));
        self::assertSame(['10', 'b'], self::names($ordered->properties));
        self::assertSame(['5', 'z'], self::names($ordered->properties->b->multiple));
        self::assertIsArray($ordered->items);
        self::assertSame(['1', 'y'], self::names($ordered->items[0]));
        self::assertSame(3, $ordered->items[1]);
    }

    public function testOrderedTreatsIntegerKeysFromArraysAsArrayIndexNamesAndBuildsObjects(): void
    {
        // PHP turns the member name "10" into the integer key 10; an ascending 0..n-1 map looks like a list.
        $ordered = JsonValue::ordered(['b' => ['x' => 1], 10 => true, 1 => true, 0 => true]);
        self::assertSame(['0', '1', '10', 'b'], self::names($ordered));
        self::assertInstanceOf(stdClass::class, $ordered->b);

        $cast = JsonValue::ordered((object) (array) json_decode('{"1":"a","0":"b"}', false, 512, JSON_THROW_ON_ERROR));
        self::assertInstanceOf(stdClass::class, $cast);
        self::assertSame(['0', '1'], self::names($cast));
    }

    public function testOrderedMembersKeepsAMemberMap(): void
    {
        $members = JsonValue::orderedMembers(['b' => 1, '10' => 2, 'a' => 3]);

        self::assertSame(['10', 'b', 'a'], array_map('strval', array_keys($members)));

        $nested = JsonValue::orderedMembers(['f' => ['z' => 1, '5' => 2], 'g' => (object) ['y' => 1, '3' => 2]]);
        self::assertIsArray($nested['f']);
        self::assertSame(['5', 'z'], array_map('strval', array_keys($nested['f'])));
        self::assertInstanceOf(stdClass::class, $nested['g']);
        self::assertSame(['3', 'y'], self::names($nested['g']));
    }

    public function testOrderedObjectAcceptsAnEmptyArrayAndRejectsLists(): void
    {
        self::assertSame([], self::names(JsonValue::orderedObject([])));
        $this->expectException(\TypeError::class);
        JsonValue::orderedObject([1, 2]);
    }

    /**
     * A copy is bounded by the value limits of docs/spec/input-text.md: a list of 1000 strings
     * shared forty levels deep denotes more than 2^40 nodes, and a reference cycle nests without
     * end. Wide leaves keep the copy made before the limit within the memory limit.
     */
    public function testCopiesStopAtTheValueLimits(): void
    {
        $shared = array_fill(0, 1000, 'x');
        for ($i = 0; $i < 40; $i++) {
            $shared = [$shared, $shared];
        }
        $loop = [];
        $loop['self'] = &$loop;
        $loop['again'] = &$loop;
        $copies = [
            'copy' => static fn (mixed $value) => JsonValue::copy($value),
            'ordered' => static fn (mixed $value) => JsonValue::ordered($value),
            'orderedMembers' => static fn (mixed $value) => JsonValue::orderedMembers(['value' => $value]),
        ];
        foreach ($copies as $name => $copy) {
            foreach (['shared' => $shared, 'loop' => $loop, 'object' => (object) ['list' => $shared]] as $shape => $value) {
                try {
                    $copy($value);
                    self::fail("{$name} copied the {$shape} value");
                } catch (\InvalidArgumentException $error) {
                    self::assertSame('Recursive or excessively nested PHP value', $error->getMessage());
                }
            }
        }
        $deep = 'x';
        for ($i = 0; $i < 511; $i++) {
            $deep = [$deep];
        }
        self::assertSame([$deep], JsonValue::copy([$deep]));
    }

    public function testIsArrayIndex(): void
    {
        foreach (['0', '10', '4294967294'] as $name) {
            self::assertTrue(JsonValue::isArrayIndex($name), $name);
        }
        foreach (['', '01', '-1', '4294967295', '1.0', ' 1', '1e3', '99999999999'] as $name) {
            self::assertFalse(JsonValue::isArrayIndex($name), $name);
        }
    }

    /** @return list<string> */
    private static function names(stdClass $object): array
    {
        $names = [];
        foreach ($object as $name => $_) {
            $names[] = (string) $name;
        }
        return $names;
    }
}

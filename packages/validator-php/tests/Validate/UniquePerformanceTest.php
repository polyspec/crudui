<?php

declare(strict_types=1);

namespace CRUDUI\Validator\Tests\Validate;

use CRUDUI\Validator;
use PHPUnit\Framework\TestCase;

/**
 * Unique rule performance test — verify linear time complexity.
 *
 * Tests that the item-level uniqueness check takes time linear in the number of
 * rows, not quadratic. The precomputation approach computes duplicates once per
 * validation run, making the entire collection check O(n) overall.
 */
final class UniquePerformanceTest extends TestCase
{
    public function testItemLevelCheckIsLinear(): void
    {
        // Use sizes that each take 20-200ms for reliable measurement
        // With precomputation O(n): ratio should be ~4
        // With old quadratic approach O(n²): ratio would be ~16
        $sizes = [500, 2000];
        $times = [];

        foreach ($sizes as $n) {
            // Create a form spec with a multiple group containing a unique field
            $spec = [
                'type' => 'group',
                'properties' => [
                    'items' => [
                        'type' => 'group',
                        'multiple' => true,
                        'properties' => [
                            'code' => [
                                'type' => 'text',
                                'validate' => [
                                    'unique' => true,
                                ],
                            ],
                        ],
                    ],
                ],
            ];

            // Create data with n unique items
            $items = [];
            for ($i = 0; $i < $n; $i++) {
                $key = '__' . str_pad((string)($i + 1), 13, '0', STR_PAD_LEFT) . '__';
                $items[$key] = ['code' => "item-{$i}"];
            }
            $data = ['items' => (object)$items];

            // Measure best of 3 runs
            $bestTime = INF;
            for ($run = 0; $run < 3; $run++) {
                $start = \microtime(true);
                $result = Validator::validate($spec, $data);
                $elapsed = (\microtime(true) - $start) * 1000; // Convert to ms

                // Validation should pass (all codes are unique)
                self::assertTrue($result->valid, "Validation should pass for {$n} unique items");
                self::assertEmpty($result->errors, "Should have no errors for {$n} unique items");

                if ($elapsed < $bestTime) {
                    $bestTime = $elapsed;
                }
            }

            $times[] = $bestTime;
        }

        // Calculate the ratio: time for 4n / time for n
        // With precomputation O(n): ratio should be ~4
        // With quadratic O(n²): ratio would be ~16
        $ratio = $times[1] / $times[0];
        self::assertLessThan(
            8,
            $ratio,
            "Ratio of times should be linear (< 8, ideal ~4), got {$ratio}"
        );
    }

    public function testArrayLevelCheckIsLinear(): void
    {
        // Array-level validation happens all at once, should be linear
        $sizes = [500, 2000];
        $times = [];

        foreach ($sizes as $n) {
            // Form with a multiple scalar field
            $spec = [
                'type' => 'group',
                'properties' => [
                    'codes' => [
                        'type' => 'text',
                        'multiple' => true,
                        'validate' => [
                            'unique' => true,
                        ],
                    ],
                ],
            ];

            // Create data with n unique values
            $codes = [];
            for ($i = 0; $i < $n; $i++) {
                $key = '__' . str_pad((string)($i + 1), 13, '0', STR_PAD_LEFT) . '__';
                $codes[$key] = "item-{$i}";
            }
            $data = ['codes' => (object)$codes];

            // Measure best of 3 runs
            $bestTime = INF;
            for ($run = 0; $run < 3; $run++) {
                $start = \microtime(true);
                $result = Validator::validate($spec, $data);
                $elapsed = (\microtime(true) - $start) * 1000; // Convert to ms

                // Validation should pass (all codes are unique)
                self::assertTrue($result->valid, "Validation should pass for {$n} unique items");
                self::assertEmpty($result->errors, "Should have no errors for {$n} unique items");

                if ($elapsed < $bestTime) {
                    $bestTime = $elapsed;
                }
            }

            $times[] = $bestTime;
        }

        // Array-level should be linear too
        $ratio = $times[1] / $times[0];
        self::assertLessThan(
            8,
            $ratio,
            "Ratio of times should be linear (< 8, ideal ~4), got {$ratio}"
        );
    }
}

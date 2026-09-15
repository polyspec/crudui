<?php

declare(strict_types=1);

namespace CRUDUI\Generator\Tests;

use CRUDUI\Generator;
use PHPUnit\Framework\TestCase;

final class DetailTest extends TestCase
{
    public function testRendersReadOnlyDetailFromTheSharedListDisplayEngine(): void
    {
        $html = Generator::renderDetail(
            ['fields' => ['name' => ['field' => '.name', 'label' => 'Name']]],
            ['name' => 'Ada'],
        );
        self::assertSame('<dl class="detail-view"><div class="detail-field"><dt class="detail-label">Name</dt><dd class="detail-value detail-value-text">Ada</dd></div></dl>', $html);
    }

    public function testBuildsTheReadOnlyDetailModel(): void
    {
        $model = Generator::buildDetail(
            ['fields' => ['name' => ['field' => '.name', 'label' => 'Name']]],
            ['name' => 'Ada'],
        );
        self::assertSame('Ada', $model->fields[0]->display);
    }

    public function testAcceptsNonEmptyAssociativeObjectDecodedByPhp(): void
    {
        $record = json_decode('{"name":"Ada"}', true, 512, JSON_THROW_ON_ERROR);

        $html = Generator::renderDetail(
            ['fields' => ['name' => ['field' => '.name', 'label' => 'Name']]],
            $record,
        );

        self::assertStringContainsString('>Ada</dd>', $html);
    }

    public function testAcceptsAnEmptyArrayAsTheEmptyRootRecord(): void
    {
        $emptyObject = json_decode('{}', true, 512, JSON_THROW_ON_ERROR);
        $emptyArray = json_decode('[]', true, 512, JSON_THROW_ON_ERROR);

        self::assertSame($emptyArray, $emptyObject);
        self::assertSame('<dl class="detail-view"></dl>', Generator::renderDetail(['fields' => []], $emptyObject));
    }

    public function testRejectsAssociativeDecodeOfASequentialNumericObject(): void
    {
        $object = json_decode('{"0":"Ada","1":"Grace"}', true, 512, JSON_THROW_ON_ERROR);

        self::assertTrue(array_is_list($object));
        $this->expectExceptionMessage('Detail record must be an object');
        Generator::renderDetail(['fields' => []], $object);
    }

    public function testRejectsMissingFields(): void
    {
        $this->expectExceptionMessage('Detail specification must declare fields');
        Generator::renderDetail((object) [], ['name' => 'Ada']);
    }

    public function testReadsAnEmptyArraySpecificationAsTheEmptyRootObject(): void
    {
        $this->expectExceptionMessage('Detail specification must declare fields');
        Generator::renderDetail([], ['name' => 'Ada']);
    }

    public function testRejectsListShapedSpecification(): void
    {
        $this->expectExceptionMessage('Detail specification must be an object');
        Generator::renderDetail([['field' => '.name']], ['name' => 'Ada']);
    }

    public function testRejectsListShapedRecord(): void
    {
        $this->expectExceptionMessage('Detail record must be an object');
        Generator::renderDetail(['fields' => []], ['Ada']);
    }

    public function testOmittedRecordUsesAnEmptyObject(): void
    {
        $html = Generator::renderDetail(['fields' => []]);
        self::assertSame('<dl class="detail-view"></dl>', $html);
    }
}

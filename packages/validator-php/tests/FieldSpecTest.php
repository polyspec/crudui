<?php

declare(strict_types=1);

namespace CRUDUI\Validator\Tests;

use CRUDUI\Validator\FieldSpec;
use PHPUnit\Framework\TestCase;

/**
 * CRUDUI FieldSpec model gates: round-trip byte stability, polymorphic slot forms,
 * ordered-map preservation, dependency isolation, and the global forbidden-key
 * gate. Never weaken an assertion to make a red case green — fix the model.
 */
final class FieldSpecTest extends TestCase
{
    /**
     * A canonical document round-trips byte-for-byte through parse->serialize.
     * Covers polymorphic slot forms (false|{}|true) and a declaration-ordered
     * condition map plus an ordered properties map.
     */
    public function testRoundTripIsByteStable(): void
    {
        $canonical = '{"type":"text","name":"email","label":{"ko":"이메일","en":"Email"},'
            . '"properties":{"b":{"type":"text"},"a":{"type":"text"}},'
            . '"multiple":false,"lang":{},"validate":{"required":".subscribe","email":true},'
            . '"design":{"show":{"true":true,".admin":false},"class":"col-6","label":{"class":"strong"}},'
            . '"behavior":true,"options":{"max_tags":5,"event":"x"}}';

        self::assertTrue(FieldSpec::roundTrips($canonical), 'canonical JSON must be byte-stable');
    }

    /**
     * Condition-map key order is preserved declaration-first after round-trip.
     */
    public function testConditionMapOrderPreserved(): void
    {
        $json    = '{"design":{"show":{".z":false,".a":true,"true":false}}}';
        $decoded = FieldSpec::parse($json);

        self::assertSame(['.z', '.a', 'true'], array_keys($decoded['design']['show']));
        self::assertSame($json, FieldSpec::serialize($decoded));
        self::assertTrue(FieldSpec::roundTrips($json), 'ordered map must round-trip byte-stable');
    }

    /**
     * Each polymorphic slot form is accepted and named correctly.
     */
    public function testPolymorphicSlotForms(): void
    {
        self::assertSame('false', FieldSpec::slotValueForm(false));
        self::assertSame('true', FieldSpec::slotValueForm(true));
        self::assertSame('map', FieldSpec::slotValueForm(['required' => true]));
        self::assertNull(FieldSpec::slotValueForm('nope'));
        self::assertFalse(FieldSpec::isValidSlotValue('nope'));
        self::assertFalse(FieldSpec::isValidSlotValue(null));
    }

    /**
     * Forbidden meta keys are rejected at root.
     */
    public function testForbiddenMetaKeysRejectedAtRoot(): void
    {
        foreach (FieldSpec::FORBIDDEN_META_KEYS as $bad) {
            $v = FieldSpec::validate([$bad => 1]);
            self::assertNotEmpty($v, "root forbidden key not caught: {$bad}");
        }
    }

    /**
     * Forbidden meta keys are rejected one level below a slot and a bucket.
     */
    public function testForbiddenMetaKeysRejectedInsideSlotsAndBuckets(): void
    {
        self::assertNotEmpty(FieldSpec::validate(['options' => ['if' => 1]]));
        self::assertNotEmpty(FieldSpec::validate(['multiple' => ['when' => 1]]));
        self::assertNotEmpty(FieldSpec::validate(['design' => ['$merge' => 1]]));
    }

    /**
     * An open bucket accepts a type-introduced extension key but still blocks a
     * forbidden key beside it.
     */
    public function testOpenBucketAllowsExtensionButBlocksForbidden(): void
    {
        self::assertSame([], FieldSpec::validate(['options' => ['marker_draggable' => true, 'custom' => 1]]));
        self::assertNotEmpty(FieldSpec::validate(['options' => ['marker_draggable' => true, 'display_switch' => 1]]));
    }

    /**
     * `x`-prefixed comment keys are rejected (x-strip is upstream).
     */
    public function testCommentKeysRejected(): void
    {
        self::assertTrue(FieldSpec::isCommentKey('xnote'));
        self::assertFalse(FieldSpec::isCommentKey('type'));
        self::assertNotEmpty(FieldSpec::validate(['xnote' => 'comment']));
        self::assertNotEmpty(FieldSpec::validate(['options' => ['xfoo' => 1]]));
    }

    /**
     * A bad slot value form is a violation; a valid canonical field has none.
     */
    public function testSlotValueFormEnforced(): void
    {
        self::assertNotEmpty(FieldSpec::validate(['validate' => 'required']));
        self::assertSame([], FieldSpec::validate([
            'type'     => 'text',
            'name'     => 'a',
            'validate' => ['required' => true],
            'design'   => false,
            'behavior' => true,
        ]));
    }

    /**
     * Legacy names are NOT recognition keys; they translate only via the table.
     */
    public function testLegacyNamesAreTranslatorOnly(): void
    {
        $recognized = [];
        foreach (FieldSpec::DEPENDENCY_BUCKETS as $b) {
            $recognized = array_merge($recognized, $b['keys']);
        }
        foreach (['multiple_max', 'sortable*', 'lang:append', 'langs', 'add_buttons'] as $legacy) {
            self::assertNotContains($legacy, $recognized, "legacy name leaked into recognition: {$legacy}");
        }
        self::assertSame('max', FieldSpec::canonicalFor('multiple', 'multiple_max'));
        self::assertSame('only', FieldSpec::canonicalFor('lang', 'langs'));
        self::assertNull(FieldSpec::canonicalFor('multiple', 'nonexistent'));
    }

    /**
     * No magic-token spelling (`*`, `:`) appears in any recognition set.
     */
    public function testNoMagicTokensInRecognitionKeys(): void
    {
        $all = array_keys(FieldSpec::TOP_LEVEL);
        foreach (FieldSpec::SLOT_SUB_KEYS as $subs) {
            $all = array_merge($all, $subs);
        }
        foreach (FieldSpec::DEPENDENCY_BUCKETS as $b) {
            $all = array_merge($all, $b['keys']);
        }
        foreach ($all as $k) {
            self::assertStringNotContainsString('*', $k);
            self::assertStringNotContainsString(':', $k);
        }
    }
}

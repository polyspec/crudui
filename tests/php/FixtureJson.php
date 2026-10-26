<?php

declare(strict_types=1);

namespace Polyspec\CruduiTestSupport;

use Polyspec\OrderedJson\Value;
use stdClass;

/** Converts fixture JSON through the public ordered JSON API, preserving unpaired surrogate text. */
final class FixtureJson
{
    public static function decode(string $json): mixed
    {
        return self::native(Value::parse($json));
    }

    private static function native(Value $value): mixed
    {
        return match ($value->kind()) {
            'null' => null,
            'boolean' => $value->booleanValue(),
            'number' => json_decode($value->numberLiteral(), false, 512, JSON_THROW_ON_ERROR),
            'string' => $value->stringValue(),
            'array' => array_map(self::native(...), $value->items()),
            'object' => self::object($value),
            default => throw new \LogicException('Unknown ordered JSON value kind: ' . $value->kind()),
        };
    }

    private static function object(Value $value): stdClass
    {
        $object = new stdClass();
        foreach ($value->members() as $name => $member) {
            $object->{(string) $name} = self::native($member);
        }
        return $object;
    }
}

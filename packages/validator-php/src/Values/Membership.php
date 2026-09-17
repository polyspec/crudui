<?php

declare(strict_types=1);

namespace CRUDUI\Validator\Values;

/**
 * The member set of `in`: a list (each element as is), a comma-separated string
 * (split at U+002C, each item trimmed) or a map (its keys); list elements and map keys are
 * read as written. A trimmed value matches a member
 * when their canonical texts are the same code points, or when both are numeric
 * with equal values.
 *
 * @internal
 */
final class Membership
{
    /** @var array<string, true> canonical member texts */
    private array $texts = [];

    /** @var list<float> values of numeric members */
    private array $numbers = [];

    /** @param list<string|int|float|bool> $members checked scalar members */
    private function __construct(array $members)
    {
        foreach ($members as $member) {
            $this->texts[(string) CanonicalText::of($member)] = true;
            // Members are read as written: a member with whitespace is not numeric text.
            $number = Numeric::asWritten($member);
            if ($number !== null) {
                $this->numbers[] = $number;
            }
        }
    }

    /**
     * Read a declared member set.
     *
     * @throws InvalidRuleParameter
     */
    public static function fromParameter(mixed $parameter): self
    {
        if (\is_string($parameter)) {
            $members = array_map(Whitespace::trim(...), explode(',', $parameter));
        } elseif (\is_array($parameter) && array_is_list($parameter)) {
            $members = $parameter;
        } elseif ($parameter instanceof \stdClass || \is_array($parameter)) {
            $members = array_map('strval', array_keys((array) $parameter));
        } else {
            throw self::failure('expected a list, a comma-separated string or a map');
        }
        if ($members === []) {
            throw self::failure('members must not be empty');
        }
        foreach ($members as $member) {
            if (!\is_string($member) && !\is_int($member) && !\is_float($member) && !\is_bool($member)) {
                throw self::failure('members must be strings, numbers or booleans');
            }
            if (Whitespace::trim((string) CanonicalText::of($member)) === '') {
                throw self::failure('members must not be empty');
            }
        }
        return new self($members);
    }

    /**
     * Whether a supplied value is a member. A list passes when every element passes:
     * an empty element (null, blank string, empty array or object) passes, and a
     * non-empty array or object element fails.
     */
    public function contains(mixed $value): bool
    {
        if (\is_array($value) && array_is_list($value)) {
            foreach ($value as $element) {
                if (EmptyValue::is($element)) {
                    continue;
                }
                if (\is_array($element) || $element instanceof \stdClass || !$this->containsScalar($element)) {
                    return false;
                }
            }
            return true;
        }
        return $this->containsScalar($value);
    }

    /** Match one scalar value; strings are trimmed first. */
    private function containsScalar(mixed $value): bool
    {
        if (\is_string($value)) {
            $value = Whitespace::trim($value);
        }
        $text = CanonicalText::of($value);
        if ($text === null) {
            return false;
        }
        if (isset($this->texts[$text])) {
            return true;
        }
        $number = Numeric::of($value);
        if ($number !== null) {
            foreach ($this->numbers as $member) {
                // IEEE equality: -0 equals 0.
                if ($member == $number) {
                    return true;
                }
            }
        }
        return false;
    }

    private static function failure(string $reason): InvalidRuleParameter
    {
        return new InvalidRuleParameter(InvalidRuleParameter::PARAMETER, 'Invalid in parameter: ' . $reason);
    }
}

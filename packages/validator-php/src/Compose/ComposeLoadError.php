<?php

declare(strict_types=1);

namespace CRUDUI\Validator\Compose;

/**
 * Composition load failure (schema §5, §7; unresolved_behavior). Port of the JS
 * reference ComposeLoadError (validator-ts/src/compose/errors.ts).
 *
 * Composition is a pre-processing pass that runs BEFORE validation/render: the
 * parser expands $ref/$patch into a single spec first (G5). An unresolved
 * composition is NOT a validation failure (valid:false) — it is a LOAD failure:
 * the spec itself does not come into existence. Never let an unresolved $ref pass
 * as valid:true (the legacy LargeForm.yml:873 bug). Every throw here is a load
 * error, distinct from a later validation error.
 *
 * legacy throw sites promoted to CRUDUI load errors:
 *   (1) $ref file missing      — ReferenceResolver.php:124 (yml_parse_file)
 *   (2) $ref format error      — ReferenceResolver.php:113,141 ('… ref error')
 *   (3) detectKey absent       — ReferenceResolver.php:133 ('… not found')
 *   (4) $ref cycle (A→B→A)     — legacy infinite-recurses (no guard); CRUDUI detects
 *   (5) $patch target/op error — $merge/$change undefined key throws (Parser:241)
 *
 * Codes (one per unresolved-behavior class, identical to JS ComposeErrorCode):
 *   REF_FILE_NOT_FOUND          $ref points at a file that does not exist.
 *   REF_FORMAT_ERROR            $ref string is malformed: '(…' with no closing
 *                               ').keys', or an empty path.
 *   REF_DETECT_KEY_NOT_FOUND    a detectKey segment (or trailing 'properties') is
 *                               absent, or the resolved node is not a map.
 *   REF_CYCLE                   $ref cycle detected (A→B→A); legacy would infinite-recurse.
 *   REF_VALUE_TYPE              $ref value is neither a string nor a string list.
 *   PATCH_SHAPE                 $patch is not an object of deep-path → value entries.
 *   PATCH_PATH_CONFLICT         a $patch op descends into a non-object scalar leaf.
 *   PATCH_REMOVE_TARGET_MISSING $patch remove targets a path that does not exist.
 */
final class ComposeLoadError extends \RuntimeException
{
    /**
     * Stable machine-readable code (one per unresolved-behavior class). Stored in
     * a private field because \Exception already owns a (loosely-typed, int) $code
     * property that cannot be redeclared as a readonly string; the public `code`
     * read is served by __get so callers use $e->code exactly like the JS port.
     */
    private readonly string $errorCode;

    /**
     * The composition path stack when the error occurred (for cycle/trace).
     *
     * @var list<string>
     */
    public readonly array $trace;

    /**
     * @param list<string> $trace
     */
    public function __construct(string $code, string $message, array $trace = [])
    {
        parent::__construct($message);
        $this->errorCode = $code;
        $this->trace = $trace;
    }

    /** Machine-readable code (e.g. 'REF_FILE_NOT_FOUND'). JS-parity accessor. */
    public function getErrorCode(): string
    {
        return $this->errorCode;
    }

    /**
     * Expose `code` as a read-only public-style property ($e->code), matching the
     * JS ComposeLoadError surface, without colliding with \Exception::$code.
     */
    public function __get(string $name): mixed
    {
        if ($name === 'code') {
            return $this->errorCode;
        }
        throw new \OutOfRangeException('Undefined property: ' . self::class . '::$' . $name);
    }

    /** Companion to __get so isset($e->code) reports the virtual `code` property. */
    public function __isset(string $name): bool
    {
        return $name === 'code';
    }
}

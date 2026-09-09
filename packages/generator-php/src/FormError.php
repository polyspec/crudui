<?php

declare(strict_types=1);

namespace CRUDUI;

/** Report a generation failure with its stable code and field path. */
final class FormError extends \RuntimeException
{
    /** Create a generation error. */
    public function __construct(private readonly string $errorCode, string $message, private readonly string $path = '')
    {
        parent::__construct($message);
    }

    /** Return the stable error code. */
    public function getErrorCode(): string
    {
        return $this->errorCode;
    }

    /** Return the affected field path. */
    public function getPath(): string
    {
        return $this->path;
    }
}

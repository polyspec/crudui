<?php
declare(strict_types=1);

/**
 * The request body of one PHP server. The servers run with `enable_post_data_reading=0`, so PHP
 * fills neither `$_POST` nor `$_FILES`: the server reads at most 2 MiB itself and parses native
 * fields with one parser that rejects a repeated field, as the other servers do.
 */
final class RequestBody
{
    public const LIMIT = 2 * 1024 * 1024;

    /** Read the body; above the limit throw LengthException. */
    public static function read(): string
    {
        if (filter_var(ini_get('enable_post_data_reading'), FILTER_VALIDATE_BOOLEAN)) {
            throw new RuntimeException('The PHP server must run with enable_post_data_reading=0');
        }
        $handle = fopen('php://input', 'rb');
        if ($handle === false) throw new RuntimeException('Cannot read the request');
        try {
            $body = stream_get_contents($handle, self::LIMIT + 1);
        } finally {
            fclose($handle);
        }
        if (!is_string($body)) throw new RuntimeException('Cannot read the request');
        if (strlen($body) > self::LIMIT) throw new LengthException('Request exceeds 2 MiB');
        return $body;
    }

    /**
     * Parse an application/x-www-form-urlencoded or multipart/form-data body into nested arrays,
     * one level per bracketed name segment (`form[relation][name]`). A repeated name, a name that
     * is both a value and a group, a malformed name or body and a file part are malformed input.
     */
    public static function fields(string $contentType, string $body): array
    {
        $mediaType = strtolower(trim(explode(';', $contentType)[0]));
        $fields = [];
        if ($mediaType === 'application/x-www-form-urlencoded') {
            foreach (explode('&', $body) as $part) {
                if ($part === '') continue;
                [$name, $value] = array_pad(explode('=', $part, 2), 2, '');
                self::add($fields, urldecode($name), urldecode($value));
            }
            return $fields;
        }
        if ($mediaType !== 'multipart/form-data') throw new InvalidArgumentException('Expected a native form');
        if (!preg_match('/;\s*boundary=(?:"([^"]+)"|([^";\s]+))/i', $contentType, $match)) throw new InvalidArgumentException('Expected a multipart boundary');
        $delimiter = '--' . ($match[1] !== '' ? $match[1] : $match[2]);
        $parts = explode("\r\n$delimiter", "\r\n$body");
        if ($parts[0] !== '' || count($parts) < 2) throw new InvalidArgumentException('Malformed multipart body');
        $last = array_pop($parts);
        if (!preg_match('/^--(\r\n)?$/D', $last)) throw new InvalidArgumentException('Malformed multipart body');
        foreach (array_slice($parts, 1) as $part) {
            $end = strpos($part, "\r\n\r\n");
            if (!str_starts_with($part, "\r\n") || $end === false) throw new InvalidArgumentException('Malformed multipart part');
            $name = null;
            foreach (explode("\r\n", substr($part, 2, $end - 2)) as $header) {
                if (!preg_match('/^content-disposition:\s*form-data\s*(;.*)?$/i', $header, $disposition)) continue;
                if (preg_match('/;\s*filename\*?=/i', $disposition[1] ?? '')) throw new InvalidArgumentException('File uploads are not part of this form');
                if (preg_match('/;\s*name="([^"]*)"/i', $disposition[1] ?? '', $named)) $name = $named[1];
            }
            if ($name === null) throw new InvalidArgumentException('Expected a named form-data part');
            self::add($fields, $name, substr($part, $end + 4));
        }
        return $fields;
    }

    /** Place one field at the path its name denotes; the path must be new. */
    private static function add(array &$fields, string $name, string $value): void
    {
        if (!preg_match('/^([^\[\]]+)((?:\[[^\[\]]+\])*)$/D', $name, $match)) throw new InvalidArgumentException("Malformed field name: $name");
        $segments = [$match[1], ...($match[2] === '' ? [] : explode('][', substr($match[2], 1, -1)))];
        $leaf = array_pop($segments);
        $node = &$fields;
        foreach ($segments as $segment) {
            if (!array_key_exists($segment, $node)) $node[$segment] = [];
            if (!is_array($node[$segment])) throw new InvalidArgumentException("Field is both a value and a group: $name");
            $node = &$node[$segment];
        }
        if (array_key_exists($leaf, $node)) throw new InvalidArgumentException("Repeated field: $name");
        $node[$leaf] = $value;
    }
}

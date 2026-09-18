<?php
declare(strict_types=1);
require __DIR__ . '/request-body.php';

function checkBody(bool $condition, string $message): void
{
    if (!$condition) throw new RuntimeException($message);
}

/** Whether the body is rejected as malformed input. */
function rejectedBody(string $contentType, string $body): bool
{
    try {
        RequestBody::fields($contentType, $body);
    } catch (InvalidArgumentException) {
        return true;
    }
    return false;
}

$urlencoded = 'application/x-www-form-urlencoded';
checkBody(RequestBody::fields($urlencoded, 'form%5Bname%5D=A+B&form[relation][name]=%ED%95%9C&&_form_complete=1&empty')
    === ['form' => ['name' => 'A B', 'relation' => ['name' => '한']], '_form_complete' => '1', 'empty' => ''],
    'URL-encoded fields nest by their bracketed names');
checkBody(RequestBody::fields($urlencoded, '') === [], 'An empty body has no fields');

$multipart = 'multipart/form-data; boundary=----b0';
$part = static fn(string $name, string $value): string => "------b0\r\nContent-Disposition: form-data; name=\"$name\"\r\n\r\n$value\r\n";
checkBody(RequestBody::fields($multipart, $part('form[name]', "line\r\nbreak") . $part('form[companies][__0000000000001__][name]', '') . $part('_form_complete', '1') . "------b0--\r\n")
    === ['form' => ['name' => "line\r\nbreak", 'companies' => ['__0000000000001__' => ['name' => '']]], '_form_complete' => '1'],
    'Multipart fields nest by their bracketed names and keep their text');
checkBody(RequestBody::fields('multipart/form-data; boundary="q b"', "--q b--\r\n") === [], 'A quoted boundary and no parts');

foreach ([
    'repeated field' => [$urlencoded, 'form[name]=a&form[name]=b'],
    'value and group' => [$urlencoded, 'form[name]=a&form[name][ko]=b'],
    'group and value' => [$urlencoded, 'form[name][ko]=a&form[name]=b'],
    'appended list field' => [$urlencoded, 'form[tags][]=a'],
    'unclosed bracket' => [$urlencoded, 'form[name=a'],
    'repeated multipart field' => [$multipart, $part('form[name]', 'a') . $part('form[name]', 'b') . "------b0--\r\n"],
    'file part' => [$multipart, "------b0\r\nContent-Disposition: form-data; name=\"form[name]\"; filename=\"a.txt\"\r\nContent-Type: text/plain\r\n\r\nx\r\n------b0--\r\n"],
    'unnamed part' => [$multipart, "------b0\r\nContent-Type: text/plain\r\n\r\nx\r\n------b0--\r\n"],
    'missing closing delimiter' => [$multipart, $part('form[name]', 'a')],
    'missing boundary' => ['multipart/form-data', $part('form[name]', 'a') . "------b0--\r\n"],
    'another media type' => ['text/plain', 'form[name]=a'],
] as $name => [$contentType, $body]) {
    checkBody(rejectedBody($contentType, $body), "$name must be rejected");
}

echo "Request body tests passed\n";

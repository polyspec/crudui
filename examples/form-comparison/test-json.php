<?php
declare(strict_types=1);
require __DIR__ . '/json.php';

function checkJson(bool $condition, string $message): void
{
    if (!$condition) throw new RuntimeException($message);
}

$source = '{"form":{"companies":{"__0000000000005__":{"stores":{}},"__abcde01234567__":{"stores":{"__0000000000007__":{"departments":{}}}},"__0000000000001__":{"stores":{}}}},"items":[{},[],false,null,1.25,"\\uc11c\\uc6b8"]}';
$decoded = FormJson::decode($source);
checkJson(FormJson::encode($decoded) === $source, 'Order, values and empty types must survive decoding and encoding');
$data = FormJson::arrays($decoded->form);
checkJson(array_keys($data['companies']) === ['__0000000000005__', '__abcde01234567__', '__0000000000001__'], 'Arrays must preserve row key order');
checkJson($data['companies']['__0000000000005__']['stores'] === [], 'Arrays keep an empty collection');
foreach (["\"\xff\"", '{"form":{},}', '9007199254740993', '1e400'] as $source) {
    $failed = false;
    try { FormJson::decode($source); }
    catch (InvalidArgumentException) { $failed = true; }
    checkJson($failed, 'Malformed JSON and unsupported numbers must fail');
}
echo "PHP ordered JSON conversion checks passed\n";

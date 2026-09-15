<?php
declare(strict_types=1);
require __DIR__ . '/repository.php';

function checkJson(bool $condition, string $message): void
{
    if (!$condition) throw new RuntimeException($message);
}

$source = '{"form":{"companies":{"__0000000000005__":{"stores":{}},"__abcde01234567__":{"stores":{"__0000000000007__":{"departments":{}}}},"__0000000000001__":{"stores":{}}}},"items":[{},[],false,null,1.25,"\\uc11c\\uc6b8"]}';
$decoded = FormJson::decode($source);
FormRepository::checkJsonShape($decoded->form, 'keyed');
checkJson(FormJson::encode($decoded) === $source, 'Order, values and empty types must survive decoding and encoding');
$data = FormJson::arrays($decoded->form);
checkJson(array_keys($data['companies']) === ['__0000000000005__', '__abcde01234567__', '__0000000000001__'], 'Repository normalization arrays must preserve row key order');
checkJson($data['companies']['__0000000000005__']['stores'] === [], 'Repository normalization receives an empty collection');
$normalized = FormRepository::wireData(FormRepository::normalize($data, 'keyed'), 'keyed');
checkJson($normalized['companies']->__0000000000005__['stores'] instanceof stdClass, 'Current public API input must retain empty object collections');
checkJson($normalized['companies']->__abcde01234567__['stores']->__0000000000007__['departments'] instanceof stdClass, 'Nested public API input must retain empty object collections');
foreach (['{"form":{"companies":[]}}', '{"form":{"companies":{"__0000000000005__":{"stores":[]}}}}'] as $source) {
    $failed = false;
    try { FormRepository::checkJsonShape(FormJson::decode($source)->form, 'keyed'); }
    catch (InvalidArgumentException) { $failed = true; }
    checkJson($failed, 'JSON shape must be checked before object-to-array conversion');
}
foreach (["\"\xff\"", '{"form":{},}', '9007199254740993', '1e400'] as $source) {
    $failed = false;
    try { FormJson::decode($source); }
    catch (InvalidArgumentException) { $failed = true; }
    checkJson($failed, 'Malformed JSON and unsupported numbers must fail');
}
echo "PHP ordered JSON conversion checks passed\n";

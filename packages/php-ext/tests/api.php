<?php

declare(strict_types=1);

use CRUDUI\Form;
use CRUDUI\FormError;
use CRUDUI\Generator;
use CRUDUI\Validator;
use CRUDUI\Validator\Compose\ComposeLoadError;
use CRUDUI\Validator\Validate\FormInputError;

$native = ($argv[1] ?? '') === 'native';
if (isset($argv[2])) require $argv[2];
$checks = 0;
function check(bool $condition, string $message): void
{
    global $checks;
    if (!$condition) throw new RuntimeException($message);
    $checks++;
}
function same(mixed $expected, mixed $actual, string $message): void
{
    $flags = JSON_THROW_ON_ERROR | JSON_PRESERVE_ZERO_FRACTION | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES;
    check(json_encode($expected, $flags) === json_encode($actual, $flags), $message);
}
function fails(callable $operation, string $class, ?string $code = null): Throwable
{
    try { $operation(); } catch (Throwable $error) {
        check($error::class === $class, "Expected $class; received " . $error::class . ': ' . $error->getMessage());
        if ($code !== null) check($error->getErrorCode() === $code, 'Exception code differs');
        return $error;
    }
    throw new RuntimeException("Expected $class");
}

$classes = [Generator::class, Validator::class, Form::class, FormError::class, ComposeLoadError::class, FormInputError::class];
$signatures = [];
foreach ($classes as $name) {
    $class = new ReflectionClass($name);
    check($class->isInternal() === $native, "Incorrect implementation: $name");
    check($class->isFinal(), "$name must be final");
    $methods = [];
    foreach ($class->getMethods(ReflectionMethod::IS_PUBLIC) as $method) {
        if ($method->getDeclaringClass()->getName() !== $name) continue;
        $parameters = [];
        foreach ($method->getParameters() as $parameter) {
            $parameters[] = [
                'name'=>$parameter->getName(), 'type'=>(string)$parameter->getType(),
                'reference'=>$parameter->isPassedByReference(), 'variadic'=>$parameter->isVariadic(),
                'optional'=>$parameter->isOptional(),
                'default'=>$parameter->isDefaultValueAvailable() ? $parameter->getDefaultValue() : null,
            ];
        }
        $methods[$method->getName()] = ['static'=>$method->isStatic(),'parameters'=>$parameters,'return'=>(string)$method->getReturnType()];
    }
    ksort($methods);
    $signatures[$name] = $methods;
}

$spec = json_decode(<<<'JSON'
{"type":"group","properties":{"companies":{"type":"group","multiple":{"copy":true,"sortable":true},"properties":{"name":{"type":"text","label":"Company","validate":{"required":true}},"stores":{"type":"group","multiple":true,"properties":{"name":{"type":"text","label":"Store"},"enabled":{"type":"checkbox"}}}}}}}
JSON, false, 512, JSON_THROW_ON_ERROR);
$data = json_decode(<<<'JSON'
{"companies":{"__0000000000005__":{"name":"Five","stores":{}},"__0000000000007__":{"name":"Seven","stores":{"__0000000000042__":{"name":"Store","enabled":true}}},"__0000000000001__":{"name":"One","stores":{}}}}
JSON, false, 512, JSON_THROW_ON_ERROR);
$template = Generator::compileForm($spec, ['keyPrefix'=>'form']);
same($template, Generator::compileForm($spec, ['keyPrefix'=>'form', 'files'=>[]]), 'Empty files map changed compilation');
same($template, Generator::compileForm($spec, ['keyPrefix'=>'form', 'files'=>new stdClass()]), 'Object files map changed compilation');
$cached = json_encode($template, JSON_THROW_ON_ERROR);
$initial = new Form($template, $data, ['idPrefix'=>"scope:'한글"]);
$injected = new Form($template, ['companies'=>new stdClass()], ['idPrefix'=>"scope:'한글"]);
$injected->setData($data);
same($initial->getData(), $injected->getData(), 'Initial and injected data differ');
same($initial->getFields(), $injected->getFields(), 'Initial and injected fields differ');
same(Generator::renderForm($initial), Generator::renderForm($injected), 'Initial and injected HTML differ');
$injected->setData($data);
same(Generator::renderForm($initial), Generator::renderForm($injected), 'Repeated injection differs');
check(json_encode($template, JSON_THROW_ON_ERROR) === $cached, 'Template was mutated');
same(array_keys((array)$data->companies), array_keys((array)$initial->getData()->companies), 'Order changed');

$detached = $initial->getData();
$detached->companies->__0000000000005__->name = 'Changed outside';
check($initial->getValue('companies.__0000000000005__.name') === 'Five', 'Returned values alias native state');
$copy = clone $initial;
$copy->setValue('companies.__0000000000005__.name', 'Clone');
check($initial->getValue('companies.__0000000000005__.name') === 'Five', 'Clone changed original data');
check($copy->getValue('companies.__0000000000005__.name') === 'Clone', 'Clone did not update');
$fresh = $copy->copyRow('companies', '__0000000000007__', ['key'=>'new_company']);
check($fresh === 'new_company', 'Copy did not use supplied key');
$stores = (array)$copy->getValue('companies.new_company.stores');
check(count($stores) === 1 && !array_key_exists('__0000000000042__', $stores), 'Copy reused saved descendant key');
$copy->rekeyRow('companies', 'new_company', Generator::sequenceRowKey(99));
$copy->moveRow('companies', Generator::sequenceRowKey(99), 0);
check(array_key_first((array)$copy->getData()->companies) === Generator::sequenceRowKey(99), 'Move failed');
$before = [$copy->getData(),$copy->getFields(),$copy->getRevision(),Generator::renderForm($copy)];
fails(fn()=>$copy->addRow('companies',['key'=>Generator::sequenceRowKey(99)]), FormError::class, 'INVALID_FORM_INPUT');
same($before, [$copy->getData(),$copy->getFields(),$copy->getRevision(),Generator::renderForm($copy)], 'Failed operation modified state');
fails(fn()=>new Form($template,['companies'=>[]]), FormError::class, 'INVALID_FORM_INPUT');
fails(fn()=>new Form($template,[1]), FormError::class, 'INVALID_FORM_INPUT');
fails(fn()=>new Form($template,null), TypeError::class);
same(['companies'=>new stdClass()], (array)(new Form($template,['companies'=>new stdClass()]))->getData(), 'Empty collection changed type');
same([], Generator::bindForm(Generator::compileForm(['type'=>'group','properties'=>new stdClass()])), 'Empty template fields changed type');

$error = fails(fn()=>Generator::compileForm(['type'=>'group','properties'=>(object)['$ref'=>'absent.yml']]), ComposeLoadError::class, 'REF_FILE_NOT_FOUND');
same(['absent.yml'], $error->getCompositionTrace(), 'Composition trace changed');
check(count($error->getTrace()) > 0, 'PHP exception stack is missing');
// Closed declaration buckets reject the first unknown key in member order.
foreach ([
    [['multiple'=>['min'=>'x','foo'=>1]], 'Invalid multiple.foo at rows: unknown key'],
    [['lang'=>(object)['only'=>'ko','append'=>true]], 'Invalid lang.append at rows: unknown key'],
    [['design'=>['show'=>1,'text'=>1]], 'Invalid design.text at rows: unknown key'],
    [['design'=>['label'=>(object)['class'=>1,'text'=>'x']]], 'Invalid design.label.text at rows: unknown key'],
    [['behavior'=>['onclick'=>'go()','onsubmit'=>'x']], 'Invalid behavior.onsubmit at rows: unknown key'],
] as [$declaration, $message]) {
    $closedError = fails(fn()=>Generator::compileForm(['type'=>'group','properties'=>['rows'=>['type'=>'text'] + $declaration]]), FormError::class, 'INVALID_FORM_INPUT');
    check($closedError->getMessage() === $message && $closedError->getPath() === '', "Closed bucket failure changed: $message; received " . $closedError->getMessage());
}
check(count(Generator::compileForm(['type'=>'group','properties'=>['rows'=>['type'=>'text','validate'=>['custom'=>1],'options'=>['custom'=>1],'behavior'=>['onload'=>'x']]]])->fields) === 1, 'Open buckets rejected an extension key');
$explicit = new ComposeLoadError('TEST','message',['base.yml','path.with.dots']);
same(['base.yml','path.with.dots'],$explicit->getCompositionTrace(),'Explicit composition trace changed');
check($explicit->getMessage() === 'message' && $explicit->getErrorCode() === 'TEST', 'Explicit exception changed');
$formError = new FormError('TEST','message','rows.invalid');
check($formError->getPath() === 'rows.invalid', 'Form error path changed');
$cycle = new stdClass(); $cycle->self = $cycle;
fails(fn()=>new Form($template,$cycle), FormError::class, 'INVALID_FORM_INPUT');
foreach ([['value'=>"\xFF"], (object)["\xFF"=>'value']] as $invalidUtf8) {
    fails(fn()=>new Form($template,$invalidUtf8), FormError::class, 'INVALID_FORM_INPUT');
    fails(fn()=>Validator::validate($spec,$invalidUtf8), InvalidArgumentException::class);
}
$inputError = fails(fn()=>Validator::validate($spec, ['a']), FormInputError::class, 'INVALID_FORM_INPUT');
check($inputError->getMessage() === 'Form data must be an object', 'Root input failure message changed');
$inputError = fails(fn()=>Validator::validate($spec, ['companies'=>[]]), FormInputError::class, 'INVALID_FORM_INPUT');
check($inputError->getMessage() === 'Repeated data must be a keyed object: companies', 'Repeated input failure message changed');
$explicitInput = new FormInputError('message');
check($explicitInput->getMessage() === 'message' && $explicitInput->getErrorCode() === 'INVALID_FORM_INPUT', 'Explicit input failure changed');

$detailSpec = ['fields'=>['name'=>['field'=>'.name','label'=>'Name'],'missing'=>['field'=>'.missing','label'=>'Missing']]];
$detail = Generator::buildDetail($detailSpec, ['name'=>'Ada']);
same(['fields','design'], array_keys((array)$detail), 'Detail model member order changed');
foreach ($detail->fields as $field) {
    same(['key','label','format','value','display','design'], array_keys((array)$field), 'Detail field member order changed');
}
check($detail->fields[0]->value === 'Ada' && $detail->fields[0]->display === 'Ada', 'Detail value changed');
check($detail->fields[1]->value === null && $detail->fields[1]->display === '', 'Absent detail value is not null');
same($detail, Generator::buildDetail((object)$detailSpec, (object)['name'=>'Ada']), 'Associative detail arrays differ from objects');
$detailHtml = '<dl class="detail-view"><div class="detail-field"><dt class="detail-label">Name</dt><dd class="detail-value detail-value-text">Ada</dd></div><div class="detail-field"><dt class="detail-label">Missing</dt><dd class="detail-value detail-value-text"></dd></div></dl>';
same($detailHtml, Generator::renderDetail($detailSpec, ['name'=>'Ada']), 'Detail HTML changed');
same($detailHtml, Generator::renderDetail((object)$detailSpec, (object)['name'=>'Ada'], []), 'Object detail HTML differs');
same('<dl class="detail-view"></dl>', Generator::renderDetail(['fields'=>[]]), 'Omitted detail record changed');
// An empty PHP array is the empty root object; a non-empty list-shaped array is not an object.
same('<dl class="detail-view"></dl>', Generator::renderDetail(['fields'=>[]], []), 'Empty array detail record changed');
same([], Generator::buildDetail(['fields'=>[]], [])->fields, 'Empty array detail record model changed');
foreach (['renderDetail', 'buildDetail'] as $method) {
    foreach ([
        [[[], ['name'=>'Ada']], 'Detail specification must declare fields'],
        [[[['field'=>'.name']], ['name'=>'Ada']], 'Detail specification must be an object'],
        [[(object)[], ['name'=>'Ada']], 'Detail specification must declare fields'],
        [[['fields'=>[]], ['Ada']], 'Detail record must be an object'],
    ] as [$arguments, $message]) {
        $detailError = fails(fn()=>Generator::$method(...$arguments), FormError::class, 'INVALID_FORM_INPUT');
        check($detailError->getMessage() === $message && $detailError->getPath() === '', "$method failure changed: $message");
    }
}

// Display input rules: list and detail inputs, text truncation and number decimals.
$listSpec = ['columns'=>['v'=>['field'=>'.v','label'=>'V']]];
$displayFailure = function (callable $operation, string $message): void {
    $error = fails($operation, FormError::class, 'INVALID_FORM_INPUT');
    check($error->getMessage() === $message && $error->getPath() === '', "Display failure changed: $message; received " . $error->getMessage());
};
same('<div class="list-view"><div class="list-empty"></div></div>', Generator::renderList([], []), 'Empty array list specification changed');
$displayFailure(fn()=>Generator::renderList([['columns']], []), 'List specification must be an object');
$displayFailure(fn()=>Generator::renderList($listSpec, ['a'=>['v'=>1]]), 'List rows must be an array');
foreach ([[1], [[]], [['a']], [null]] as $rows) {
    $displayFailure(fn()=>Generator::renderList($listSpec, $rows), 'List rows must be objects');
}
$emptyTable = Generator::renderList($listSpec, [['v'=>'a']]);
foreach ([[], ['data'=>[]], ['data'=>null], ['data'=>new stdClass()], ['page'=>null], ['total'=>null], ['files'=>[]], ['layout'=>null], ['layout'=>'table']] as $options) {
    same($emptyTable, Generator::renderList($listSpec, [['v'=>'a']], $options), 'Accepted list options changed: ' . json_encode($options));
}
foreach ([['x'], 'x', 1, true] as $value) {
    $displayFailure(fn()=>Generator::renderList($listSpec, [], ['data'=>$value]), 'List context must be an object');
    $displayFailure(fn()=>Generator::renderDetail(['fields'=>[]], [], ['data'=>$value]), 'Detail context must be an object');
}
// Page and total: PHP int or float whose value is a safe integer, written as decimal digits.
$pagedSpec = $listSpec + ['pagination'=>true];
$emptyList = '<div class="list-view"><div class="list-empty"></div>';
foreach ([
    [[], '<nav class="list-pagination"></nav>'],
    [['page'=>2, 'total'=>99], '<nav class="list-pagination" data-page="2" data-total="99"></nav>'],
    [['page'=>2.0, 'total'=>-0.0], '<nav class="list-pagination" data-page="2" data-total="0"></nav>'],
    [['page'=>9007199254740991, 'total'=>9007199254740991.0], '<nav class="list-pagination" data-page="9007199254740991" data-total="9007199254740991"></nav>'],
    [['page'=>1, 'total'=>null], '<nav class="list-pagination" data-page="1"></nav>'],
    [['total'=>0], '<nav class="list-pagination" data-total="0"></nav>'],
] as [$options, $nav]) {
    same($emptyList . $nav . '</div>', Generator::renderList($pagedSpec, [], $options), 'List page options changed: ' . json_encode($options));
}
// Infinity and NaN are not JSON values; the native conversion rejects them before any list rule.
foreach (['2', true, false, [], [2], new stdClass(), 1.5, 0, 0.0, -1, 9007199254740992, 9007199254740992.0, PHP_INT_MAX] as $value) {
    $displayFailure(fn()=>Generator::renderList($pagedSpec, [], ['page'=>$value]), 'List page must be a positive integer');
}
foreach (['0', true, [], new stdClass(), 2.5, -1, -1.0, 9007199254740992] as $value) {
    $displayFailure(fn()=>Generator::renderList($pagedSpec, [], ['total'=>$value]), 'List total must be a nonnegative integer');
}
same('<dl class="detail-view"></dl>', Generator::renderDetail(['fields'=>[]], [], ['page'=>'x', 'total'=>-1]), 'Detail must ignore list page options');
foreach (['grid', '', 5, ['table']] as $layout) {
    $displayFailure(fn()=>Generator::renderList($listSpec, [], ['layout'=>$layout]), 'List layout must be table or card');
}
// Checked in order: rows, context, page, total, then layout.
$allInvalid = ['data'=>1, 'page'=>0, 'total'=>-1, 'layout'=>'grid'];
$displayFailure(fn()=>Generator::renderList($listSpec, ['a'=>1], $allInvalid), 'List rows must be an array');
$displayFailure(fn()=>Generator::renderList($listSpec, [1], $allInvalid), 'List rows must be objects');
$displayFailure(fn()=>Generator::renderList($listSpec, [], $allInvalid), 'List context must be an object');
$displayFailure(fn()=>Generator::renderList($listSpec, [], ['page'=>0, 'total'=>-1, 'layout'=>'grid']), 'List page must be a positive integer');
$displayFailure(fn()=>Generator::renderList($listSpec, [], ['total'=>-1, 'layout'=>'grid']), 'List total must be a nonnegative integer');
$displayFailure(fn()=>Generator::renderDetail([], [], ['data'=>1]), 'Detail specification must declare fields');
same('<dl class="detail-view"></dl>', Generator::renderDetail(['fields'=>[]], [], ['data'=>[]]), 'Empty array detail context changed');
$displayValue = fn(array $format, mixed $value) => Generator::buildDetail(['fields'=>['v'=>['field'=>'.v','format'=>$format]]], ['v'=>$value])->fields[0]->display;
foreach ([
    [2, 'a😀bc', 'a😀…'], [3, '가나다라마', '가나다…'], ['2', 'abcd', 'abcd'], [0.5, 'abc', 'abc'],
    [2.9, 'abcd', 'ab…'], [4, 'abcd', 'abcd'], [0, 'abcd', 'abcd'], [-1, 'abcd', 'abcd'], [1e300, 'abcd', 'abcd'],
] as [$limit, $value, $expected]) {
    same($expected, $displayValue(['type'=>'text','truncate'=>$limit], $value), 'Text truncation changed: ' . json_encode($limit));
}
same('<dl class="detail-view"><div class="detail-field"><dt class="detail-label">V</dt><dd class="detail-value detail-value-text">a😀…</dd></div></dl>',
    Generator::renderDetail(['fields'=>['v'=>['field'=>'.v','label'=>'V','format'=>['type'=>'text','truncate'=>2]]]], ['v'=>'a😀bc']), 'Truncated detail HTML changed');
same('1.' . str_repeat('0', 100), $displayValue(['type'=>'number','decimals'=>100], 1), 'Maximum decimals changed');
same('1', $displayValue(['type'=>'number','decimals'=>'101'], 1), 'Non-number decimals are not ignored');
foreach ([101, -1, 1e200, -1e200] as $places) {
    $displayFailure(fn()=>$displayValue(['type'=>'number','decimals'=>$places], 1), 'Number decimals must be between 0 and 100');
    $displayFailure(fn()=>Generator::renderList(['columns'=>['v'=>['field'=>'.v','format'=>['type'=>'number','decimals'=>$places]]]], [['v'=>1]]), 'Number decimals must be between 0 and 100');
}

$validation = Validator::validate($spec, $data);
same((object)['valid'=>true,'errors'=>[]], $validation, 'Native validation rejected valid data');
same($validation, Validator::validate($spec, $data, ['files'=>[]]), 'Empty files map changed validation');
same((object)['valid'=>true,'errors'=>[]], Validator::validateList((object)['columns'=>(object)['name'=>(object)['field'=>'.name']]]), 'List validation failed');
for ($index=0; $index<300; $index++) {
    $instance = new Form($template, $data);
    $instance->setValue('companies.__0000000000005__.name', (string)$index);
    check($instance->getValue('companies.__0000000000005__.name') === (string)$index, 'Repeated instance operation failed');
    unset($instance);
}

echo json_encode(['native'=>$native,'checks'=>$checks,'signatures'=>$signatures], JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES), "\n";

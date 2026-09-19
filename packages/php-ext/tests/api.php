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
// A NUL character is written like any other character in every string.
$nulForm = new Form(Generator::compileForm(['type'=>'group','properties'=>["n\0m"=>['type'=>'text','label'=>"A\0B"]]]), ["n\0m"=>"x\0y"]);
same("x\0y", $nulForm->getValue("n\0m"), 'NUL form value changed');
same("A\0B", $nulForm->getFields()[0]->header->label, 'NUL form label changed');
same(["n\0m"], array_keys((array)$nulForm->getData()), 'NUL data key changed');
$nulHtml = Generator::renderForm($nulForm);
check(str_contains($nulHtml, ">A\0B<") && str_contains($nulHtml, "value=\"x\0y\"") && str_contains($nulHtml, "name=\"n\0m\""), 'NUL form HTML changed');
same(2, substr_count($nulHtml, 'crudui:n%00m'), 'NUL control id changed');
same("x\0y", Generator::buildDetail(['fields'=>['v'=>['field'=>'v','label'=>"L\0M"]]], ['v'=>"x\0y"])->fields[0]->display, 'NUL detail display changed');
same('<dl class="crudui-detail"><div class="crudui-detail__field"><dt class="crudui-detail__label">L' . "\0" . 'M</dt><dd class="crudui-detail__value crudui-value crudui-value--text">x' . "\0" . 'y</dd></div></dl>',
    Generator::renderDetail(['fields'=>['v'=>['field'=>'v','label'=>"L\0M"]]], ['v'=>"x\0y"]), 'NUL detail HTML changed');
same("<button>B\0C</button>", Generator::formButtonsHtml([(object)['tag'=>'button','text'=>"B\0C",'attrs'=>new stdClass()]]), 'NUL button markup changed');
fails(fn()=>Generator::renderDetail(['fields'=>[]], ['v'=>"\xC0\x80"]), FormError::class, 'INVALID_FORM_INPUT');

// Form buttons: evaluated in declaration order with the form binding checks, rendered alone.
$buttonTemplate = Generator::compileForm(['type'=>'group','properties'=>['name'=>['type'=>'text']],'buttons'=>[
    ['type'=>'submit','name'=>'save','value'=>'1','design'=>['class'=>['wide'=>'name == "A"'],'style'=>'color: red']],
    ['type'=>'reset','text'=>['ko'=>'되돌리기','en'=>'Undo']],
    ['type'=>'button','text'=>'Go <"&">','behavior'=>['onclick'=>'go("x") && y < 1']],
    ['type'=>'link','text'=>'Help','href'=>'/help?a=1&b=2'],
]]);
$boundButtons = Generator::bindButtons($buttonTemplate, ['name'=>'A'], ['language'=>'en']);
same(['submit','reset','button','link'], array_map(fn($button)=>$button->type, $boundButtons), 'Button types changed');
same(['a','button'], [$boundButtons[3]->tag, $boundButtons[2]->tag], 'Button tags changed');
same(['type','class','style','name','value'], array_keys((array)$boundButtons[0]->attrs), 'Button attribute order changed');
same(['class','href'], array_keys((array)$boundButtons[3]->attrs), 'Link attribute order changed');
same('Undo', $boundButtons[1]->text, 'Declared button text changed');
same(Generator::bindButtons($buttonTemplate, ['name'=>'A'], ['language'=>'en']), (new Form($buttonTemplate, ['name'=>'A'], ['language'=>'en']))->getButtons(), 'Public and form buttons differ');
same(Generator::bindButtons($buttonTemplate), Generator::bindButtons($buttonTemplate, new stdClass(), ['language'=>null]), 'Default button inputs changed');
same(Generator::bindButtons($buttonTemplate, ['name'=>'B'], ['language'=>'en']), (new Form($buttonTemplate, ['name'=>'B'], ['language'=>'en']))->getButtons(), 'Record-dependent buttons differ');
$buttonsHtml = Generator::formButtonsHtml($boundButtons);
check(str_contains(Generator::renderForm(new Form($buttonTemplate, ['name'=>'A'], ['language'=>'en'])), $buttonsHtml), 'Rendered form does not contain the button markup');
same('<button type="button" class="crudui-action crudui-action--text" onclick="go(&quot;x&quot;) &amp;&amp; y &lt; 1">Go &lt;"&amp;"&gt;</button><a class="crudui-action crudui-action--text" href="/help?a=1&amp;b=2">Help</a>',
    Generator::formButtonsHtml([$boundButtons[2], $boundButtons[3]]), 'Button markup changed');
same('', Generator::formButtonsHtml([]), 'Empty button markup changed');
foreach ([
    [fn()=>Generator::bindButtons(new stdClass()), 'Unsupported form template'],
    [fn()=>Generator::bindButtons($buttonTemplate, [1]), null],
    [fn()=>Generator::bindButtons($buttonTemplate, [], ['language'=>1]), 'Language must be a string'],
    [fn()=>Generator::bindButtons($buttonTemplate, [], ['language'=>'xx']), null],
] as [$operation, $message]) {
    $buttonError = fails($operation, FormError::class, 'INVALID_FORM_INPUT');
    if ($message !== null) check($buttonError->getMessage() === $message, "Button input failure changed: $message; received " . $buttonError->getMessage());
}
// A template that is not exactly the compiled shape fails the same way in every entry point.
$shapeTemplate = Generator::compileForm(['type'=>'group','properties'=>['name'=>['type'=>'text']]]);
$reshaped = function (callable $change) use ($shapeTemplate): stdClass {
    $copy = json_decode(json_encode($shapeTemplate, JSON_THROW_ON_ERROR), false, 512, JSON_THROW_ON_ERROR);
    $change($copy);
    return $copy;
};
$shapeEntries = [
    fn(stdClass $template)=>Generator::bindForm($template, ['name'=>'a']),
    fn(stdClass $template)=>Generator::bindButtons($template, ['name'=>'a']),
    fn(stdClass $template)=>new Form($template, ['name'=>'a']),
];
foreach ([
    function ($t) { unset($t->fields); },
    function ($t) { $t->fields = new stdClass(); },
    function ($t) { $t->fields = ['name'=>$t->fields[0]]; },
    function ($t) { $t->fields[] = 'name'; },
    function ($t) { $t->fields[0]->spec = []; },
    function ($t) { $t->fields[0]->children = new stdClass(); },
    function ($t) { $t->fields[0]->label = 'Name'; },
    function ($t) { unset($t->buttons); },
    function ($t) { $t->buttons = 'submit'; },
    function ($t) { $t->buttons = [[]]; },
    function ($t) { $t->version = 1; },
    function ($t) { $t->keyPrefix = null; },
    function ($t) { $t->action = '/save'; },
] as $index => $change) {
    foreach ($shapeEntries as $entry) {
        $shapeError = fails(fn()=>$entry($reshaped($change)), FormError::class, 'INVALID_FORM_INPUT');
        check($shapeError->getMessage() === 'Unsupported form template' && $shapeError->getPath() === '', "Template shape $index failure changed: " . $shapeError->getMessage());
    }
}
// A PHP associative array is an object: a field given as one is the compiled field.
$arrayField = $reshaped(function ($t) { $t->fields[0] = ['name'=>'name','spec'=>['type'=>'text'],'children'=>[]]; });
same(Generator::bindForm($shapeTemplate, ['name'=>'a']), Generator::bindForm($arrayField, ['name'=>'a']), 'An associative array field changed binding');
fails(fn()=>Generator::bindButtons($buttonTemplate, null), TypeError::class);
fails(fn()=>Generator::formButtonsHtml(null), TypeError::class);
foreach ([['k'=>(object)['tag'=>'a','text'=>'','attrs'=>new stdClass()]], [1=>(object)['tag'=>'a','text'=>'','attrs'=>new stdClass()]]] as $unlisted) {
    $buttonError = fails(fn()=>Generator::formButtonsHtml($unlisted), FormError::class, 'INVALID_FORM_INPUT');
    check($buttonError->getMessage() === 'Form buttons must be a list', 'Unlisted button failure changed: ' . $buttonError->getMessage());
}
$validButton = (object)['type'=>'reset','tag'=>'button','text'=>'X','attrs'=>(object)['class'=>'c']];
same('<button class="c">X</button><a></a>', Generator::formButtonsHtml([$validButton, (object)['tag'=>'a','text'=>'','attrs'=>new stdClass()]]), 'Evaluated button members changed');
foreach ([
    ['tag'=>'button','text'=>'X','attrs'=>(object)['class'=>'c']],
    (object)['tag'=>'div','text'=>'X','attrs'=>new stdClass()],
    (object)['tag'=>'button','text'=>1,'attrs'=>new stdClass()],
    (object)['tag'=>'button','attrs'=>new stdClass()],
    (object)['tag'=>'button','text'=>'X'],
    (object)['tag'=>'button','text'=>'X','attrs'=>['class'=>'c']],
    (object)['tag'=>'button','text'=>'X','attrs'=>(object)['id'=>'x']],
    (object)['tag'=>'button','text'=>'X','attrs'=>(object)['class'=>1]],
    (object)['tag'=>null,'text'=>'X','attrs'=>new stdClass()],
    'button',
    null,
] as $invalidButton) {
    $buttonError = fails(fn()=>Generator::formButtonsHtml([$validButton, $invalidButton]), FormError::class, 'INVALID_FORM_INPUT');
    check($buttonError->getMessage() === 'Form buttons must be evaluated button objects' && $buttonError->getPath() === '', 'Button markup failure changed: ' . $buttonError->getMessage());
}

// Value limits (docs/spec/input-text.md): a value that contains itself or denotes more than
// 1,000,000 nodes fails as an input failure naming it, in bounded time.
$loop = [];
$loop['self'] = &$loop;
$loop['again'] = &$loop;
$shared = 'x';
for ($i = 0; $i < 40; $i++) $shared = [$shared, $shared];
foreach ([
    'spec' => fn()=>Generator::compileForm(['type'=>'group','properties'=>new stdClass(),'loop'=>$loop]),
    'data' => fn()=>new Form($shapeTemplate, ['list'=>$shared]),
    'options.language' => fn()=>Generator::bindForm($shapeTemplate, [], ['language'=>$loop]),
    'rows' => fn()=>Generator::buildList(['columns'=>new stdClass()], [$shared]),
    'record' => fn()=>Generator::buildDetail(['fields'=>new stdClass()], ['loop'=>$loop]),
] as $name => $operation) {
    $limitError = fails($operation, FormError::class, 'INVALID_FORM_INPUT');
    check($limitError->getMessage() === "Recursive or excessively nested value: $name", 'Value limit failure changed: ' . $limitError->getMessage());
}
$limitError = fails(fn()=>Validator::validateList(['columns'=>new stdClass()], ['files'=>['a.yml'=>(object)['list'=>$shared]]]), FormInputError::class, 'INVALID_FORM_INPUT');
check($limitError->getMessage() === 'Recursive or excessively nested value: files', 'Value limit failure changed: ' . $limitError->getMessage());

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
// List and detail designs follow the form declaration rules: the own design, then each member.
foreach ([
    [fn()=>Generator::renderList(['columns'=>['name'=>['field'=>'name','design'=>['main'=>['class'=>'x']]]]], []), 'Invalid design.main at columns.name: unknown key'],
    [fn()=>Generator::renderList(['design'=>['color'=>'red'],'columns'=>['name'=>['design'=>['main'=>new stdClass()]]]], []), 'Invalid design.color at list: unknown key'],
    [fn()=>Generator::renderList(['columns'=>['a'=>['design'=>['x'=>1]]],'design'=>'x'], []), 'Invalid design at list: expected a boolean or an object'],
    [fn()=>Generator::renderList(['columns'=>['a'=>['design'=>['x'=>1]],'b'=>['design'=>1]]], []), 'Invalid design.x at columns.a: unknown key'],
    [fn()=>Generator::renderList(['columns'=>['name'=>['design'=>['show'=>1]]]], []), 'Invalid design.show at columns.name: expected an expression, a boolean or a condition map'],
    [fn()=>Generator::renderDetail(['fields'=>['name'=>['field'=>'name','design'=>['label'=>['text'=>'x']]]]], []), 'Invalid design.label.text at fields.name: unknown key'],
    [fn()=>Generator::buildDetail(['fields'=>['a'=>['design'=>false],'b'=>['design'=>null]]], []), 'Invalid design at fields.b: expected a boolean or an object'],
    [fn()=>Generator::buildDetail(['design'=>['wrapper'=>'box'],'fields'=>[]], []), 'Invalid design.wrapper at detail: expected an object'],
    [fn()=>Generator::renderDetail(['design'=>['group'=>['class'=>[]],'prepend'=>1],'fields'=>[]], []), 'Invalid design.group.class at detail: expected a string or a condition map'],
    [fn()=>Generator::renderList(['design'=>1], [1]), 'List rows must be objects'],
    [fn()=>Generator::renderList(['design'=>1], [], ['layout'=>'grid']), 'List layout must be table or card'],
    [fn()=>Generator::buildDetail(['design'=>1,'fields'=>[]], [], ['data'=>1]), 'Detail context must be an object'],
] as [$operation, $message]) {
    $displayError = fails($operation, FormError::class, 'INVALID_FORM_INPUT');
    check($displayError->getMessage() === $message && $displayError->getPath() === '', "Display declaration failure changed: $message; received " . $displayError->getMessage());
}
fails(fn()=>Generator::renderList(['design'=>1,'columns'=>['$ref'=>'absent.yml']], []), ComposeLoadError::class, 'REF_FILE_NOT_FOUND');
$composedError = fails(fn()=>Generator::buildDetail(['fields'=>['name'=>['$ref'=>'name.yml']]], [], ['files'=>['name.yml'=>['properties'=>['design'=>['main'=>['class'=>'x']]]]]]), FormError::class, 'INVALID_FORM_INPUT');
check($composedError->getMessage() === 'Invalid design.main at fields.name: unknown key', 'Composed field design was not checked: ' . $composedError->getMessage());
check(count(Generator::compileForm(['type'=>'group','properties'=>['rows'=>['type'=>'text','validate'=>['custom'=>1],'options'=>['custom'=>1],'behavior'=>['onload'=>'x']]]])->fields) === 1, 'Open buckets rejected an extension key');
$explicit = new ComposeLoadError('TEST','message',['base.yml','path.with.dots']);
same(['base.yml','path.with.dots'],$explicit->getCompositionTrace(),'Explicit composition trace changed');
check($explicit->getMessage() === 'message' && $explicit->getErrorCode() === 'TEST', 'Explicit exception changed');
$formError = new FormError('TEST','message','rows.invalid');
check($formError->getPath() === 'rows.invalid', 'Form error path changed');
$cycle = new stdClass(); $cycle->self = $cycle;
fails(fn()=>new Form($template,$cycle), FormError::class, 'INVALID_FORM_INPUT');
// Invalid text is an input failure naming its path (docs/spec/input-text.md).
foreach (['data.value' => ['value'=>"\xFF"], 'data' => (object)["\xFF"=>'value']] as $location => $invalidUtf8) {
    $error = fails(fn()=>new Form($template,$invalidUtf8), FormError::class, 'INVALID_FORM_INPUT');
    check($error->getMessage() === 'Text must be Unicode scalar values: ' . $location && $error->getPath() === '', 'Form input text failure changed');
    $error = fails(fn()=>Validator::validate($spec,$invalidUtf8), FormInputError::class, 'INVALID_FORM_INPUT');
    check($error->getMessage() === 'Text must be Unicode scalar values: ' . $location, 'Validation input text failure changed');
}
$error = fails(fn()=>Validator::validateList(['columns'=>['c'=>['label'=>"\xED\xA0\x80"]]]), ComposeLoadError::class, 'INVALID_TEXT');
check($error->getCompositionTrace() === ['columns', 'c', 'label'] && $error->getMessage() === 'Text must be Unicode scalar values', 'Specification text failure changed');
$inputError = fails(fn()=>Validator::validate($spec, ['a']), FormInputError::class, 'INVALID_FORM_INPUT');
check($inputError->getMessage() === 'Form data must be an object', 'Root input failure message changed');
$inputError = fails(fn()=>Validator::validate($spec, ['companies'=>[]]), FormInputError::class, 'INVALID_FORM_INPUT');
check($inputError->getMessage() === 'Repeated data must be a keyed object: companies', 'Repeated input failure message changed');
$explicitInput = new FormInputError('message');
check($explicitInput->getMessage() === 'message' && $explicitInput->getErrorCode() === 'INVALID_FORM_INPUT', 'Explicit input failure changed');

$detailSpec = ['fields'=>['name'=>['field'=>'name','label'=>'Name'],'missing'=>['field'=>'missing','label'=>'Missing']]];
$detail = Generator::buildDetail($detailSpec, ['name'=>'Ada']);
same(['fields','design'], array_keys((array)$detail), 'Detail model member order changed');
foreach ($detail->fields as $field) {
    same(['key','label','format','value','display','design'], array_keys((array)$field), 'Detail field member order changed');
}
check($detail->fields[0]->value === 'Ada' && $detail->fields[0]->display === 'Ada', 'Detail value changed');
check($detail->fields[1]->value === null && $detail->fields[1]->display === '', 'Absent detail value is not null');
same($detail, Generator::buildDetail((object)$detailSpec, (object)['name'=>'Ada']), 'Associative detail arrays differ from objects');
$detailHtml = '<dl class="crudui-detail"><div class="crudui-detail__field"><dt class="crudui-detail__label">Name</dt><dd class="crudui-detail__value crudui-value crudui-value--text">Ada</dd></div><div class="crudui-detail__field"><dt class="crudui-detail__label">Missing</dt><dd class="crudui-detail__value crudui-value crudui-value--text"></dd></div></dl>';
same($detailHtml, Generator::renderDetail($detailSpec, ['name'=>'Ada']), 'Detail HTML changed');
same($detailHtml, Generator::renderDetail((object)$detailSpec, (object)['name'=>'Ada'], []), 'Object detail HTML differs');
same('<dl class="crudui-detail"></dl>', Generator::renderDetail(['fields'=>[]]), 'Omitted detail record changed');
// An empty PHP array is the empty root object; a non-empty list-shaped array is not an object.
same('<dl class="crudui-detail"></dl>', Generator::renderDetail(['fields'=>[]], []), 'Empty array detail record changed');
same([], Generator::buildDetail(['fields'=>[]], [])->fields, 'Empty array detail record model changed');
foreach (['renderDetail', 'buildDetail'] as $method) {
    foreach ([
        [[[], ['name'=>'Ada']], 'Detail specification must declare fields'],
        [[[['field'=>'name']], ['name'=>'Ada']], 'Detail specification must be an object'],
        [[(object)[], ['name'=>'Ada']], 'Detail specification must declare fields'],
        [[['fields'=>[]], ['Ada']], 'Detail record must be an object'],
    ] as [$arguments, $message]) {
        $detailError = fails(fn()=>Generator::$method(...$arguments), FormError::class, 'INVALID_FORM_INPUT');
        check($detailError->getMessage() === $message && $detailError->getPath() === '', "$method failure changed: $message");
    }
}

// Display input rules: list and detail inputs, text truncation and number decimals.
$listSpec = ['columns'=>['v'=>['field'=>'v','label'=>'V']]];
$displayFailure = function (callable $operation, string $message): void {
    $error = fails($operation, FormError::class, 'INVALID_FORM_INPUT');
    check($error->getMessage() === $message && $error->getPath() === '', "Display failure changed: $message; received " . $error->getMessage());
};
same('<div class="crudui-list"><div class="crudui-list__empty">데이터가 없습니다</div></div>', Generator::renderList([], []), 'Empty array list specification changed');
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
$emptyList = '<div class="crudui-list"><div class="crudui-list__empty">데이터가 없습니다</div>';
foreach ([
    [[], '<nav class="crudui-list__pagination" data-mode="pages" data-per-page="20" data-page="1"><button type="button" class="crudui-list__pagination-prev" data-page="1" aria-label="이전 페이지" disabled="">‹</button><button type="button" class="crudui-list__pagination-next" data-page="1" aria-label="다음 페이지" disabled="">›</button></nav>'],
    [['page'=>2, 'total'=>99], '<nav class="crudui-list__pagination" data-mode="pages" data-per-page="20" data-page="2" data-total="99"><button type="button" class="crudui-list__pagination-prev" data-page="1" aria-label="이전 페이지">‹</button><button type="button" class="crudui-list__pagination-page" data-page="1" aria-label="1페이지">1</button><button type="button" class="crudui-list__pagination-page" data-page="2" aria-label="2페이지" aria-current="page" disabled="">2</button><button type="button" class="crudui-list__pagination-page" data-page="3" aria-label="3페이지">3</button><button type="button" class="crudui-list__pagination-page" data-page="4" aria-label="4페이지">4</button><button type="button" class="crudui-list__pagination-page" data-page="5" aria-label="5페이지">5</button><button type="button" class="crudui-list__pagination-next" data-page="3" aria-label="다음 페이지">›</button></nav>'],
    [['page'=>2.0, 'total'=>-0.0], '<nav class="crudui-list__pagination" data-mode="pages" data-per-page="20" data-page="2" data-total="0"><button type="button" class="crudui-list__pagination-prev" data-page="1" aria-label="이전 페이지" disabled="">‹</button><button type="button" class="crudui-list__pagination-page" data-page="1" aria-label="1페이지" aria-current="page" disabled="">1</button><button type="button" class="crudui-list__pagination-next" data-page="1" aria-label="다음 페이지" disabled="">›</button></nav>'],
    [['page'=>9007199254740991, 'total'=>9007199254740991.0], '<nav class="crudui-list__pagination" data-mode="pages" data-per-page="20" data-page="9007199254740991" data-total="9007199254740991"><button type="button" class="crudui-list__pagination-prev" data-page="450359962737049" aria-label="이전 페이지">‹</button><button type="button" class="crudui-list__pagination-page" data-page="1" aria-label="1페이지">1</button><button type="button" class="crudui-list__pagination-page" data-page="450359962737049" aria-label="450359962737049페이지">450359962737049</button><button type="button" class="crudui-list__pagination-page" data-page="450359962737050" aria-label="450359962737050페이지" aria-current="page" disabled="">450359962737050</button><button type="button" class="crudui-list__pagination-next" data-page="450359962737050" aria-label="다음 페이지" disabled="">›</button></nav>'],
    [['page'=>1, 'total'=>null], '<nav class="crudui-list__pagination" data-mode="pages" data-per-page="20" data-page="1"><button type="button" class="crudui-list__pagination-prev" data-page="1" aria-label="이전 페이지" disabled="">‹</button><button type="button" class="crudui-list__pagination-next" data-page="1" aria-label="다음 페이지" disabled="">›</button></nav>'],
    [['total'=>0], '<nav class="crudui-list__pagination" data-mode="pages" data-per-page="20" data-page="1" data-total="0"><button type="button" class="crudui-list__pagination-prev" data-page="1" aria-label="이전 페이지" disabled="">‹</button><button type="button" class="crudui-list__pagination-page" data-page="1" aria-label="1페이지" aria-current="page" disabled="">1</button><button type="button" class="crudui-list__pagination-next" data-page="1" aria-label="다음 페이지" disabled="">›</button></nav>'],
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
same('<dl class="crudui-detail"></dl>', Generator::renderDetail(['fields'=>[]], [], ['page'=>'x', 'total'=>-1]), 'Detail must ignore list page options');
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
same('<dl class="crudui-detail"></dl>', Generator::renderDetail(['fields'=>[]], [], ['data'=>[]]), 'Empty array detail context changed');
$displayValue = fn(array $format, mixed $value) => Generator::buildDetail(['fields'=>['v'=>['field'=>'v','format'=>$format]]], ['v'=>$value])->fields[0]->display;
foreach ([
    [2, 'a😀bc', 'a😀…'], [3, '가나다라마', '가나다…'], ['2', 'abcd', 'abcd'], [0.5, 'abc', 'abc'],
    [2.9, 'abcd', 'ab…'], [4, 'abcd', 'abcd'], [0, 'abcd', 'abcd'], [-1, 'abcd', 'abcd'], [1e300, 'abcd', 'abcd'],
] as [$limit, $value, $expected]) {
    same($expected, $displayValue(['type'=>'text','truncate'=>$limit], $value), 'Text truncation changed: ' . json_encode($limit));
}
same('<dl class="crudui-detail"><div class="crudui-detail__field"><dt class="crudui-detail__label">V</dt><dd class="crudui-detail__value crudui-value crudui-value--text">a😀…</dd></div></dl>',
    Generator::renderDetail(['fields'=>['v'=>['field'=>'v','label'=>'V','format'=>['type'=>'text','truncate'=>2]]]], ['v'=>'a😀bc']), 'Truncated detail HTML changed');
same('1.' . str_repeat('0', 100), $displayValue(['type'=>'number','decimals'=>100], 1), 'Maximum decimals changed');
same('1', $displayValue(['type'=>'number','decimals'=>'101'], 1), 'Non-number decimals are not ignored');
foreach ([101, -1, 1e200, -1e200] as $places) {
    $displayFailure(fn()=>$displayValue(['type'=>'number','decimals'=>$places], 1), 'Number decimals must be between 0 and 100');
    $displayFailure(fn()=>Generator::renderList(['columns'=>['v'=>['field'=>'v','format'=>['type'=>'number','decimals'=>$places]]]], [['v'=>1]]), 'Number decimals must be between 0 and 100');
}

$validation = Validator::validate($spec, $data);
same((object)['valid'=>true,'errors'=>[]], $validation, 'Native validation rejected valid data');
same($validation, Validator::validate($spec, $data, ['files'=>[]]), 'Empty files map changed validation');
same((object)['valid'=>true,'errors'=>[]], Validator::validateList((object)['columns'=>(object)['name'=>(object)['field'=>'name']]]), 'List validation failed');
for ($index=0; $index<300; $index++) {
    $instance = new Form($template, $data);
    $instance->setValue('companies.__0000000000005__.name', (string)$index);
    check($instance->getValue('companies.__0000000000005__.name') === (string)$index, 'Repeated instance operation failed');
    unset($instance);
}

// Every form fixture as JSON text, so the comparison sees object member order. A generated row
// key is random, so each distinct generated key becomes its position.
$models = [];
$jsonFlags = JSON_THROW_ON_ERROR | JSON_PRESERVE_ZERO_FRACTION | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES;
$generatedKeys = function (string $text): string {
    $positions = [];
    return preg_replace_callback('/__[0-9a-f]{13}__/', function (array $match) use (&$positions): string {
        $positions[$match[0]] ??= count($positions);
        return '__generated-' . $positions[$match[0]] . '__';
    }, $text);
};
foreach (json_decode(file_get_contents(dirname(__DIR__, 3) . '/tests/fixtures/form-render/cases.json'), false, 512, JSON_THROW_ON_ERROR) as $case) {
    $caseOptions = (array) ($case->options ?? []);
    $bindOptions = array_intersect_key($caseOptions, array_flip(['idPrefix', 'language', 'keyPrefix', 'unsupported']));
    $record = property_exists($case, 'data') ? $case->data : new stdClass();
    try {
        $compiled = Generator::compileForm($case->spec, $caseOptions);
        $form = new Form($compiled, $record, $bindOptions);
        $model = [
            'template'=>$compiled,
            'bindForm'=>Generator::bindForm($compiled, $record, $bindOptions),
            'bindButtons'=>Generator::bindButtons($compiled, $record, ['language'=>$bindOptions['language'] ?? 'ko']),
            'getTemplate'=>$form->getTemplate(),
            'getData'=>$form->getData(),
            'getFields'=>$form->getFields(),
            'getButtons'=>$form->getButtons(),
        ];
    } catch (FormError|ComposeLoadError $failure) {
        $model = ['error'=>$failure::class, 'message'=>$failure->getMessage()];
    }
    $models[$case->name] = $generatedKeys(json_encode($model, $jsonFlags));
}

echo json_encode(['native'=>$native,'checks'=>$checks,'signatures'=>$signatures,'models'=>$models], JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES), "\n";

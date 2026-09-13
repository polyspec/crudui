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

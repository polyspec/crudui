<?php
declare(strict_types=1);
require __DIR__ . '/generation.php';

$sourceRoot = $argv[1] ?? '';
$runtime = $argv[2] ?? '';
$archiveFile = $argv[3] ?? '';
$moduleArgument = $argv[4] ?? '-';
$moduleFile = $moduleArgument === '-' ? null : $moduleArgument;
$archiveSha256 = $argv[5] ?? '';
$moduleHashArgument = $argv[6] ?? '-';
$moduleSha256 = $moduleHashArgument === '-' ? null : $moduleHashArgument;
$expectedSignaturesFile = $argv[7] ?? '';
$source = (object) ['commit' => str_repeat('a', 40), 'archiveSha256' => $archiveSha256];
$generation = new FormGeneration($runtime, $sourceRoot, $source, $archiveSha256, $moduleSha256);
$checks = 0;
function checkGeneration(bool $condition, string $message): void
{
    global $checks;
    if (!$condition) throw new RuntimeException($message);
    $checks++;
}
function equalGeneration(mixed $expected, mixed $actual, string $message): void
{
    checkGeneration(json_encode($expected, JSON_THROW_ON_ERROR) === json_encode($actual, JSON_THROW_ON_ERROR), $message);
}

$provenance = $generation->provenance();
checkGeneration($provenance['runtime'] === $runtime && $provenance['nativeCRUDUI'] === ($runtime === 'php-ext'), 'Runtime provenance must match the loaded classes');
checkGeneration($provenance['composerAutoload'] === ($runtime === 'php'), 'Only pure PHP may register the Composer autoloader');
equalGeneration($source->commit, $provenance['commit'], 'Compilation source commit must be retained');
equalGeneration($source->archiveSha256, $provenance['archiveSha256'], 'Archive hash must be retained');
checkGeneration(count(get_object_vars($provenance['classes'])) === 3, 'Generation, form state and validation need independent provenance');
foreach ($provenance['classes'] as $class) checkGeneration($class['internal'] === ($runtime === 'php-ext') && $class['extension'] === ($runtime === 'php-ext' ? 'crudui' : null), 'Incorrect class implementation');
checkGeneration($runtime === 'php-ext' ? $provenance['moduleSha256'] === hash_file('sha256', $moduleFile) : $provenance['moduleSha256'] === null, 'Module hash must describe the selected implementation');
$expectedSignatures = json_decode(file_get_contents($expectedSignaturesFile), true, 512, JSON_THROW_ON_ERROR);
equalGeneration($expectedSignatures, (array) $provenance['signatures'], 'Public PHP and extension signatures must match');

$spec = json_decode('{"type":"group","properties":{"$ref":"companies.json"}}');
$files = json_decode('{"companies.json":{"properties":{"companies":{"type":"group","multiple":true,"properties":{"name":{"type":"text","label":"Company","validate":{"required":true}},"stores":{"type":"group","multiple":true,"properties":{"name":{"type":"text","label":"Store"}}}}}}}}');
$compiled = $generation->compile((object) ['spec' => $spec, 'options' => (object) ['keyPrefix' => 'form', 'files' => $files]]);
$cached = json_encode($compiled['template'], JSON_THROW_ON_ERROR);
equalGeneration($provenance, $compiled['generator'], 'Compilation must include provenance');
checkGeneration(array_key_exists('referenceReads', $compiled) && $compiled['referenceReads'] === null, 'PHP compilation must report unavailable loader instrumentation as null');
$data = json_decode('{"companies":{"__0000000000005__":{"name":"Five","stores":{}},"__0000000000007__":{"name":"Seven","stores":{"__0000000000042__":{"name":"Store"}}},"__0000000000001__":{"name":"One","stores":{}}}}');
$rendered = $generation->render((object) ['template' => json_decode($cached), 'data' => $data, 'options' => (object) ['language' => 'en']]);
equalGeneration($data, $rendered['data'], 'Rendering must retain row order and explicit empty collections');
checkGeneration($rendered['revision'] === 0, 'Initial rendering must start at revision zero');
checkGeneration(str_contains($rendered['html'], 'name="form[companies][__0000000000007__][stores][__0000000000042__][name]"'), 'Rendering must produce native nested control names');
equalGeneration($provenance, $rendered['generator'], 'Rendering must include provenance');
$injected = new CRUDUI\Form(json_decode($cached), ['companies' => new stdClass()], ['language' => 'en']);
foreach ([1, 2] as $pass) {
    $injected->setData($data);
    equalGeneration($rendered['data'], $injected->getData(), 'Injection must retain original data');
    equalGeneration($rendered['fields'], $injected->getFields(), 'Injection must produce identical complete models');
    equalGeneration($rendered['html'], CRUDUI\Generator::renderForm($injected), 'Injection must produce identical HTML');
}
equalGeneration((object) ['valid' => true, 'errors' => []], CRUDUI\Validator::validate($spec, $data, ['files' => $files]), 'Public validation must accept valid data');
$invalid = json_decode(json_encode($data, JSON_THROW_ON_ERROR));
$invalid->companies->__0000000000005__->name = '';
checkGeneration(CRUDUI\Validator::validate($spec, $invalid, ['files' => $files])->valid === false, 'Public validation must reject missing required values');

foreach ([(object) ['spec' => []], (object) ['spec' => $spec, 'options' => null]] as $request) {
    $rejected = false;
    try { $generation->compile($request); } catch (InvalidArgumentException) { $rejected = true; }
    checkGeneration($rejected, 'Compile must reject incorrect JSON object types');
}
foreach ([(object) ['template' => [] , 'data' => $data], (object) ['template' => json_decode($cached), 'data' => []], (object) ['template' => json_decode($cached), 'data' => $data, 'options' => []]] as $request) {
    $rejected = false;
    try { $generation->render($request); } catch (InvalidArgumentException) { $rejected = true; }
    checkGeneration($rejected, 'Render must reject incorrect JSON object types');
}

// The comparison spec declares the native completion marker as its one submit button.
$resolved = (object) ['type' => 'group', 'properties' => $files->{'companies.json'}->properties,
    'buttons' => json_decode('[{"type":"submit","name":"_form_complete","value":"1","text":{"en":"Save","ko":"저장"}}]')];
foreach (['bindForm', 'createForm'] as $renderingPath) foreach (['react', 'vue', 'svelte'] as $framework) foreach (['ko', 'en'] as $language) {
    $html = $generation->document($resolved, $data, $renderingPath, $framework, $language);
    $expectedForm = new CRUDUI\Form(CRUDUI\Generator::compileForm($resolved, ['keyPrefix' => 'form']), $data, ['language' => $language]);
    checkGeneration(str_contains($html, '<div id="view">' . CRUDUI\Generator::renderForm($expectedForm) . '</div>'), 'SSR must retain the complete public renderer HTML');
    $document = new DOMDocument();
    $errors = libxml_use_internal_errors(true);
    try { $document->loadHTML($html, LIBXML_NONET | LIBXML_NOERROR | LIBXML_NOWARNING); }
    finally { libxml_clear_errors(); libxml_use_internal_errors($errors); }
    $xpath = new DOMXPath($document);
    $form = $xpath->query('//form')->item(0);
    checkGeneration($form->getAttribute('action') === "/api/$runtime/save/$renderingPath/$framework" && $form->getAttribute('method') === 'post', 'SSR must submit to the selected public save endpoint');
    checkGeneration($xpath->query('//form//input[@name="form[companies][__0000000000007__][stores][__0000000000042__][name]"]')->length === 1, 'SSR controls must exist before JavaScript');
    checkGeneration($xpath->query('//form//input[@type="hidden"]')->length === 0, 'SSR must not add hidden identity controls');
    checkGeneration($xpath->query('//form//button[@type="submit"]')->length === 1 && $xpath->query('//form//button[@type="submit" and @name="_form_complete" and @value="1"]')->length === 1, 'The one submit button, declared by the spec, must provide the native request completion marker');
    checkGeneration($xpath->query('//a')->item(0)->getAttribute('href') === "/frames/$renderingPath-$framework/?lang=$language&server=$runtime&initialization=ssr", 'SSR must link to the selected interactive example');
    checkGeneration($xpath->query('//script[not(@type="application/json")]')->length === 0, 'SSR does not require executable JavaScript');
    equalGeneration($provenance, json_decode($xpath->query('//script[@id="generator"]')->item(0)->textContent, true, 512, JSON_THROW_ON_ERROR), 'SSR provenance must match the selected implementation');
}
echo "$runtime: $checks PHP generation checks passed\n";

<?php
declare(strict_types=1);
require __DIR__ . '/generation.php';
require __DIR__ . '/json.php';

$sourceRoot = $argv[1] ?? '';
$runtime = $argv[2] ?? '';
$moduleArgument = $argv[3] ?? '-';
$moduleFile = $moduleArgument === '-' ? null : $moduleArgument;
$moduleHashArgument = $argv[4] ?? '-';
$moduleSha256 = $moduleHashArgument === '-' ? null : $moduleHashArgument;
$expectedSignaturesFile = $argv[5] ?? '';
$source = (object) ['commit' => str_repeat('a', 40), 'changes' => str_repeat('b', 64)];
$generation = new FormGeneration($runtime, $sourceRoot, $source, $moduleSha256);
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
equalGeneration($source, $provenance['source'], 'The source identity must be retained');
checkGeneration(count(get_object_vars($provenance['classes'])) === 3, 'Generation, form state and validation need independent provenance');
foreach ($provenance['classes'] as $class) checkGeneration($class['internal'] === ($runtime === 'php-ext') && $class['extension'] === ($runtime === 'php-ext' ? 'crudui' : null), 'Incorrect class implementation');
checkGeneration($runtime === 'php-ext' ? $provenance['moduleSha256'] === hash_file('sha256', $moduleFile) : $provenance['moduleSha256'] === null, 'Module hash must describe the selected implementation');
// Decode as objects: associative decoding would turn an empty object default such as {} into [].
$expectedSignatures = json_decode(file_get_contents($expectedSignaturesFile), false, 512, JSON_THROW_ON_ERROR);
equalGeneration($expectedSignatures, $provenance['signatures'], 'Public PHP and extension signatures must match');

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
// Text that could end the payload script early must not appear raw inside it.
$ssrData = json_decode(json_encode($data, JSON_THROW_ON_ERROR));
$ssrData->companies->__0000000000007__->stores->__0000000000042__->name = '</script><b>Store & Co</b>';
$frameHead = '<!doctype html>';
$frameMiddle = '<head><title>Frame</title><script type="module" src="/frame.js"></script></head><body><main>';
$frame = $frameHead . '<html>' . $frameMiddle . '<div id="form-view"></div></main></body></html>';
$payloadPattern = '#<script type="application/json" id="crudui-ssr">(.*?)</script></body></html>$#sD';
foreach (['ko', 'en'] as $language) {
    $html = $generation->ssrFrame($frame, $resolved, $ssrData, $language, FormJson::encode(...));
    $expected = $generation->render((object) ['template' => json_decode(json_encode(CRUDUI\Generator::compileForm($resolved, ['keyPrefix' => 'form']), JSON_THROW_ON_ERROR)), 'data' => $ssrData, 'options' => (object) ['language' => $language]]);
    checkGeneration(substr_count($html, '<div id="form-view">') === 1, 'SSR must keep one form view');
    $viewStart = strpos($html, '<div id="form-view">') + strlen('<div id="form-view">');
    $viewEnd = strpos($html, '</div></main>', $viewStart);
    checkGeneration($viewEnd !== false && substr($html, $viewStart, $viewEnd - $viewStart) === $expected['html'], 'The SSR form view must contain exactly the public renderer HTML');
    checkGeneration(preg_match($payloadPattern, $html, $payloadMatch) === 1, 'SSR must insert the payload script immediately before the closing body tag');
    $payload = $payloadMatch[1];
    checkGeneration(substr_count($html, '<html') === 1 && str_contains($html, '<html lang="' . $language . '">'), 'SSR must write the html lang attribute once');
    checkGeneration($html === $frameHead . '<html lang="' . $language . '">' . $frameMiddle . '<div id="form-view">' . $expected['html'] . '</div></main><script type="application/json" id="crudui-ssr">' . $payload . '</script></body></html>', 'SSR must otherwise preserve the frame template');
    checkGeneration(!str_contains($payload, '<') && !str_contains($payload, '>') && !str_contains($payload, '&'), 'The SSR payload must escape <, > and &');
    $decoded = json_decode($payload, false, 512, JSON_THROW_ON_ERROR);
    equalGeneration(['data', 'generator'], array_keys(get_object_vars($decoded)), 'The SSR payload must contain data and generator in order');
    equalGeneration($expected['data'], $decoded->data, 'The SSR payload data must match the render result');
    // The payload is decoded as objects: associative decoding turns an empty object default such as {} into [].
    equalGeneration($expected['generator'], $decoded->generator, 'The SSR payload provenance must match the render result');
    $document = new DOMDocument();
    $errors = libxml_use_internal_errors(true);
    try { $document->loadHTML($html, LIBXML_NONET | LIBXML_NOERROR | LIBXML_NOWARNING); }
    finally { libxml_clear_errors(); libxml_use_internal_errors($errors); }
    $xpath = new DOMXPath($document);
    checkGeneration($xpath->query('//div[@id="form-view"]//input[@name="form[companies][__0000000000007__][stores][__0000000000042__][name]"]')->length === 1, 'SSR controls must exist before JavaScript');
    checkGeneration($xpath->query('//div[@id="form-view"]//input[@type="hidden"]')->length === 0, 'SSR must not add hidden identity controls');
    checkGeneration($xpath->query('//div[@id="form-view"]//button[@type="submit"]')->length === 1 && $xpath->query('//div[@id="form-view"]//button[@type="submit" and @name="_form_complete" and @value="1"]')->length === 1, 'The one submit button, declared by the spec, must provide the native request completion marker');
    checkGeneration($xpath->query('//script[@id="crudui-ssr"]')->length === 1, 'SSR must write one payload script');
}
$view = '<div id="form-view"></div>';
foreach ([
    '<body>' . $view . '</body>',
    '<html><html><body>' . $view . '</body>',
    '<html><body></body>',
    '<html><body>' . $view . $view . '</body>',
    '<html><body><div id="form-view"> </div></body>',
    '<html><body>' . $view,
    '<html><body>' . $view . '</body></body>',
] as $invalidFrame) {
    $rejected = false;
    try { $generation->ssrFrame($invalidFrame, $resolved, $data, 'en', FormJson::encode(...)); } catch (RuntimeException $error) { $rejected = $error->getMessage() === 'The frame document must contain one html start tag, one empty form view and one body end tag'; }
    checkGeneration($rejected, 'SSR must reject a frame without exactly one html start tag, empty form view and body end tag');
}
echo "$runtime: $checks PHP generation checks passed\n";

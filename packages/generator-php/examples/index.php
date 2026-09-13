<?php

declare(strict_types=1);
require __DIR__ . '/../vendor/autoload.php';
use CRUDUI\Form;
use CRUDUI\Generator;
use CRUDUI\Validator;
use CRUDUI\Validator\Validate\FormInputError;

$path = getenv('CRUDUI_DATA_FILE');
if ($path === false || $path === '') {
    http_response_code(500);
    exit('Set CRUDUI_DATA_FILE to the record file path.');
}
$spec = json_decode(<<<'JSON'
{"type":"group","properties":{"name":{"type":"text","label":"Name","validate":{"required":true}},"email":{"type":"email","label":"Email","validate":{"email":true}},"topics":{"type":"multichoice","label":"Topics","items":{"forms":"Forms","validation":"Validation","rendering":"Rendering"}},"note":{"type":"textarea","label":"Note"}}}
JSON, false, 512, JSON_THROW_ON_ERROR);
$data = is_file($path) ? json_decode(file_get_contents($path), false, 512, JSON_THROW_ON_ERROR) : new stdClass();
$errors = [];
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST') {
    $submitted = $_POST['form'] ?? [];
    if (!is_array($submitted)) {
        http_response_code(400);
        exit('Form data must be an object.');
    }
    $submitted['topics'] ??= [];
    try {
        $result = Validator::validate($spec, $submitted);
    } catch (FormInputError $error) {
        http_response_code(400);
        exit($error->getMessage());
    }
    $data = (object) $submitted;
    if ($result->valid) {
        $json = json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR) . "\n";
        if (file_put_contents($path, $json, LOCK_EX) === false) {
            throw new RuntimeException('Record write failed');
        }
        header('Location: /', true, 303);
        exit;
    }
    http_response_code(422);
    $errors = $result->errors;
}
$template = Generator::compileForm($spec, ['keyPrefix' => 'form']);
$form = new Form($template, $data, ['language' => 'en']);
header('Content-Type: text/html; charset=UTF-8');
?>
<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>CRUDUI PHP</title>
<style>
body { font: 16px system-ui; max-width: 720px; margin: 2rem auto; padding: 0 1rem; }
h6 { font-size: 1rem; margin: 1rem 0 .5rem; }
input[type=text], input[type=email], textarea { width: 100%; box-sizing: border-box; padding: .6rem; }
.btn-group label { margin: 0 1rem 0 .25rem; }
button { margin-top: 1rem; padding: .5rem 1rem; }
</style>
<h1>CRUDUI PHP</h1>
<?php
foreach ($errors as $error) {
    ?>
<p role="alert"><?php
    echo htmlspecialchars($error->path . ': ' . $error->message, ENT_QUOTES, 'UTF-8');
    ?></p>
<?php
}
?>
<form method="post">
<?php
echo Generator::renderForm($form);
?>
<button type="submit">Save</button>
</form>
</html>

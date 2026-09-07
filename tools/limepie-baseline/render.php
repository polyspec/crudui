<?php
/**
 * Limepie reference-HTML baseline renderer.
 *
 * Usage:
 *   php render.php <spec.yml> [data.json]
 *
 * Env:
 *   LIMEPIE_SRC   Source checkout path (required).
 *                 Must be pinned at commit a47ccba (matches composer.lock).
 *   LIMEPIE_LANG  Language cookie value used by Limepie (default: ko).
 *
 * Output: rendered form HTML on stdout. Errors go to stderr, exit code 1.
 *
 * The output of this script is the single source of truth for form rendering.
 * Do NOT edit reference fixtures by hand — regenerate them with generate-all.sh.
 */

error_reporting(E_ALL & ~E_DEPRECATED);

if ($argc < 2) {
    fwrite(STDERR, "usage: php render.php <spec.yml> [data.json]\n");
    exit(1);
}

$limepieSrc = getenv('LIMEPIE_SRC');
if (!$limepieSrc) {
    fwrite(STDERR, "Set LIMEPIE_SRC to the source checkout directory\n");
    exit(1);
}

if (!is_file($limepieSrc . '/src/Limepie.php')) {
    fwrite(STDERR, "LIMEPIE_SRC invalid: {$limepieSrc}/src/Limepie.php not found\n");
    exit(1);
}

// symfony/yaml autoloader (vendored under packages/generator-legacy/limepie).
$autoload = __DIR__ . '/../../packages/generator-legacy/limepie/vendor/autoload.php';

if (!is_file($autoload)) {
    fwrite(STDERR, "vendor autoload not found: {$autoload}\n");
    exit(1);
}

require $autoload;

// Polyfill ext-yaml with symfony/yaml. Limepie\yml_parse_file() calls the
// global \yaml_parse_file() / \yaml_parse() from the yaml extension, which is
// not installed locally. Define them only when the extension is absent.
if (!function_exists('yaml_parse_file')) {
    function yaml_parse_file(string $filename)
    {
        return \Symfony\Component\Yaml\Yaml::parseFile($filename);
    }
}

if (!function_exists('yaml_parse')) {
    function yaml_parse(string $input)
    {
        return \Symfony\Component\Yaml\Yaml::parse($input);
    }
}

// Autoload Limepie classes straight from the pinned source tree.
spl_autoload_register(function ($class) use ($limepieSrc) {
    $prefix = 'Limepie\\';

    if (str_starts_with($class, $prefix)) {
        $path = $limepieSrc . '/src/Limepie/' . str_replace('\\', '/', substr($class, strlen($prefix))) . '.php';

        if (file_exists($path)) {
            require $path;
        }
    }
});

require $limepieSrc . '/src/Limepie.php';

// Limepie reads the UI language from a cookie; without this every
// \Limepie\get_language() call fatals.
$_COOKIE['language'] = getenv('LIMEPIE_LANG') ?: 'ko';
\Limepie\Cookie::setKeyStore('language', 'language');

// Some fields (search, tinymce, ...) interpolate a CSP nonce from the session.
// The legacy runtime uses a random per-request nonce; use a fixed empty value
// so baseline output stays deterministic.
$_SESSION['nonce'] = '';

// Button hrefs without their own query string get $_SERVER['QSA'] (the current
// request's query-string appendix) attached. No request here, so keep it empty.
$_SERVER['QSA'] = '';

$specFile = $argv[1];
$realSpec = realpath($specFile);

if (false === $realSpec) {
    fwrite(STDERR, "spec file not found: {$specFile}\n");
    exit(1);
}

$data = [];

if ($argc >= 3) {
    $dataFile = $argv[2];

    if (!is_file($dataFile)) {
        fwrite(STDERR, "data file not found: {$dataFile}\n");
        exit(1);
    }

    $data = json_decode(file_get_contents($dataFile), true);

    if (null === $data) {
        fwrite(STDERR, "data file is not valid JSON: {$dataFile}\n");
        exit(1);
    }
}

try {
    // \Limepie\yml_parse_file runs Limepie\Form\Parser::processForm(), which
    // resolves $ref / $after / $before / $merge / $remove and language keys.
    // $ref paths resolve relative to the spec file's directory.
    $spec = \Limepie\yml_parse_file($realSpec);

    $generator = new \Limepie\Form\Generator();
    echo $generator->write($spec, $data);
} catch (\Throwable $e) {
    fwrite(STDERR, get_class($e) . ': ' . $e->getMessage() . "\n");
    fwrite(STDERR, $e->getFile() . ':' . $e->getLine() . "\n");
    exit(1);
}

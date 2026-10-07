<?php
/**
 * The autoload of a Composer package of packages/ in development: the development root vendor/ and, ahead of it, the
 * classes of the package from its source directory by the PSR-4 map of its composer.json. The root vendor/ holds a
 * copy of polyspec/crudui-validator, so the tests and checks of a package read its source instead of that copy. As the
 * bootstrap of PHPUnit it loads the package of the working directory.
 */
declare(strict_types=1);

require_once __DIR__ . '/../vendor/autoload.php';

/**
 * Load the classes of the package in `$packageDir` from its source directory, ahead of every registered loader.
 *
 * @param string $packageDir Absolute directory of a package with a composer.json.
 */
function crudui_package_autoload(string $packageDir): void
{
    $manifest = json_decode((string) file_get_contents($packageDir . '/composer.json'), true, 512, JSON_THROW_ON_ERROR);
    foreach ($manifest['autoload']['psr-4'] ?? [] as $prefix => $path) {
        $base = $packageDir . '/' . $path;
        spl_autoload_register(static function (string $class) use ($prefix, $base): void {
            if (!str_starts_with($class, $prefix)) {
                return;
            }
            $file = $base . str_replace('\\', '/', substr($class, strlen($prefix))) . '.php';
            if (is_file($file)) {
                require $file;
            }
        }, true, true);
    }
}

$crudui_package = getcwd();
if ($crudui_package !== false && dirname($crudui_package) === dirname(__DIR__) . '/packages' && is_file($crudui_package . '/composer.json')) {
    crudui_package_autoload($crudui_package);
}

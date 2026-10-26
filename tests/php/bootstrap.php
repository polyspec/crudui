<?php

declare(strict_types=1);

$autoload = getenv('FORM_PHP_AUTOLOAD');
if ($autoload === false) {
    if (getenv('FORM_PHP_SERVER') === 'php-ext') {
        throw new RuntimeException('FORM_PHP_AUTOLOAD must name the native application Composer autoloader');
    }
    $autoload = dirname(__DIR__, 2) . '/vendor/autoload.php';
}
if ($autoload === '' || !is_file($autoload)) {
    throw new RuntimeException('FORM_PHP_AUTOLOAD must name an existing Composer autoloader: ' . $autoload);
}
require $autoload;

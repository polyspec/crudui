<?php

/**
 * The entry of the PHP record server of the form comparison, which PHP-FPM runs for every /api/ request
 * (docs/operations/form-comparison.md, "Record servers"). The classes load through the Composer autoloader of the checkout.
 */

declare(strict_types=1);

use Polyspec\Crudui\FormComparison\ApiServer;
use Polyspec\Crudui\FormComparison\ServerMode;

require dirname(__DIR__, 4) . '/vendor/autoload.php';

ServerMode::current();
$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
if (!is_string($path) || !str_starts_with($path, '/api/')) {
    return false;
}
(new ApiServer(
    dirname(__DIR__, 4),
    ApiServer::environmentDirectory('FORM_PUBLIC_DIRECTORY'),
    ApiServer::environmentDirectory('FORM_DATA_DIRECTORY'),
))->handle($path);

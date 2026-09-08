<?php
declare(strict_types=1);

namespace App;

use CRUDUI\Validator\Legacy\Validator;
use Symfony\Component\Yaml\Yaml;
use Illuminate\Support\ServiceProvider;

/**
 * Laravel Service Provider for CRUDUI Validator
 *
 * Register in config/app.php:
 *   'providers' => [
 *       App\CRUDUIServiceProvider::class,
 *   ],
 *
 * Usage:
 *   $validator = app('crudui.validator', ['spec' => 'user-registration']);
 *   $result = $validator->validate($request->all());
 */
class CRUDUIServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        // Bind the validator factory
        $this->app->bind('crudui.validator', function ($app, array $params) {
            $specName = $params['spec'] ?? 'default';
            $specPath = $this->getSpecPath($specName);
            $spec = Yaml::parseFile($specPath);
            return new Validator($spec);
        });

        // Bind the adapter for reusable validation
        $this->app->singleton('crudui.adapter', function ($app) {
            $specDir = config('crudui.spec_directory', resource_path('specs'));
            return new CRUDUIAdapter($specDir);
        });
    }

    public function boot(): void
    {
        // Publish config file
        $this->publishes([
            __DIR__ . '/../config/crudui.php' => config_path('crudui.php'),
        ], 'crudui-config');

        // Add custom validation rule
        \Illuminate\Support\Facades\Validator::extend('crudui', function (
            $attribute,
            $value,
            $parameters,
            $validator
        ) {
            $specName = $parameters[0] ?? null;
            if (!$specName) {
                return false;
            }

            $adapter = app('crudui.adapter');
            $result = $adapter->validate($specName, $value);
            return $result->isValid();
        });
    }

    private function getSpecPath(string $specName): string
    {
        $specDir = config('crudui.spec_directory', resource_path('specs'));
        return "{$specDir}/{$specName}.yml";
    }
}

<?php
/**
 * FormSpec Configuration for Laravel
 *
 * Publish this file using:
 *   php artisan vendor:publish --tag=formspec-config
 */

return [
    /*
    |--------------------------------------------------------------------------
    | Specification Directory
    |--------------------------------------------------------------------------
    |
    | The directory where YAML specification files are stored.
    | Default: resources/specs
    |
    */
    'spec_directory' => resource_path('specs'),

    /*
    |--------------------------------------------------------------------------
    | Default Language
    |--------------------------------------------------------------------------
    |
    | The default language for validation error messages.
    | Supported: 'ko', 'en', 'ja'
    |
    */
    'default_language' => 'ko',

    /*
    |--------------------------------------------------------------------------
    | Cache Specifications
    |--------------------------------------------------------------------------
    |
    | Whether to cache parsed YAML specifications.
    | Recommended for production.
    |
    */
    'cache_specs' => env('FORMSPEC_CACHE', true),

    /*
    |--------------------------------------------------------------------------
    | Cache TTL
    |--------------------------------------------------------------------------
    |
    | How long to cache specifications in seconds.
    | Default: 3600 (1 hour)
    |
    */
    'cache_ttl' => 3600,
];

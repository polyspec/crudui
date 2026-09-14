<?php
declare(strict_types=1);

use CRUDUI\Form;
use CRUDUI\Generator;
use CRUDUI\Validator;

/** Generate current forms and verify the loaded PHP implementation. */
final class FormGeneration
{
    private readonly array $generator;

    /** Load the selected classes with source digests verified during server startup. */
    public function __construct(
        string $runtime,
        string $sourceRoot,
        stdClass $source,
        string $verifiedArchiveSha256,
        ?string $verifiedModuleSha256,
    )
    {
        if (!in_array($runtime, ['php', 'php-ext'], true)) throw new RuntimeException('Unknown PHP generator runtime');
        $native = $runtime === 'php-ext';
        if (extension_loaded('crudui') !== $native) throw new RuntimeException('CRUDUI extension state does not match the selected server');
        $sourceRoot = self::regularDirectory($sourceRoot, 'library directory');
        foreach (['commit' => 40, 'archiveSha256' => 64] as $key => $length) {
            if (!is_string($source->$key ?? null) || !preg_match('/^[a-f0-9]{' . $length . '}$/D', $source->$key)) throw new RuntimeException('Invalid library source metadata: ' . $key);
        }
        if (!preg_match('/^[a-f0-9]{64}$/D', $verifiedArchiveSha256) || !hash_equals($verifiedArchiveSha256, $source->archiveSha256)) {
            throw new RuntimeException('CRUDUI source archive hash does not match metadata');
        }
        if (!$native) require_once $sourceRoot . '/packages/generator-php/vendor/autoload.php';
        $composerAutoload = self::composerAutoloadRegistered();
        if ($composerAutoload === $native) throw new RuntimeException('Composer autoloader state does not match the selected server');
        $classes = [];
        $signatures = [];
        $sourceFiles = [
            Generator::class => ['source' => 'packages/generator-php/src/Generator.php'],
            Form::class => ['source' => 'packages/generator-php/src/Form.php'],
            Validator::class => [
                'source' => 'packages/validator-php/src/Public/Validator.php',
                'package' => 'crudui/validator',
                'installed' => 'src/Public/Validator.php',
            ],
        ];
        foreach ($sourceFiles as $name => $files) {
            $class = new ReflectionClass($name);
            if ($class->isInternal() !== $native || $class->getExtensionName() !== ($native ? 'crudui' : false)) throw new RuntimeException('Incorrect CRUDUI implementation: ' . $name);
            if (!$native) self::verifyPhpClassSource($name, $class, $sourceRoot, $files);
            $classes[$name] = ['internal' => $class->isInternal(), 'extension' => $class->getExtensionName() ?: null, 'file' => $class->getFileName() ?: null];
            $signatures[$name] = self::signature($class);
        }
        $moduleHash = null;
        if ($native) {
            if ($verifiedModuleSha256 === null || !preg_match('/^[a-f0-9]{64}$/D', $verifiedModuleSha256)) throw new RuntimeException('A verified CRUDUI module hash is required');
            $moduleHash = $verifiedModuleSha256;
        } elseif ($verifiedModuleSha256 !== null) {
            throw new RuntimeException('Pure PHP must not declare a CRUDUI module hash');
        }
        $this->generator = ['runtime' => $runtime, 'commit' => $source->commit, 'archiveSha256' => $source->archiveSha256, 'nativeCRUDUI' => $native, 'moduleSha256' => $moduleHash, 'composerAutoload' => $composerAutoload, 'classes' => (object) $classes, 'signatures' => (object) $signatures];
    }

    /** Return verified implementation and source metadata. */
    public function provenance(): array
    {
        return $this->generator;
    }

    /** Compile a structure without reading record data. */
    public function compile(stdClass $request): array
    {
        $spec = self::object($request->spec ?? null, 'spec');
        return ['template' => Generator::compileForm($spec, self::options($request)), 'generator' => $this->generator, 'referenceReads' => null];
    }

    /** Bind a supplied cached template and return its complete state and HTML. */
    public function render(stdClass $request): array
    {
        $form = new Form(self::object($request->template ?? null, 'template'), self::object($request->data ?? null, 'data'), self::options($request));
        return ['data' => $form->getData(), 'fields' => $form->getFields(), 'html' => Generator::renderForm($form), 'revision' => $form->getRevision(), 'generator' => $this->generator];
    }

    /** Render a stored record as a complete document with native form submission. */
    public function document(stdClass $spec, array|stdClass $data, string $renderingPath, string $framework, string $language): string
    {
        if (!in_array($language, ['ko', 'en'], true)) throw new InvalidArgumentException('Expected language ko or en');
        $form = new Form(Generator::compileForm($spec, ['keyPrefix' => 'form']), $data, ['language' => $language]);
        $runtime = $this->generator['runtime'];
        $link = '/frames/' . $renderingPath . '-' . $framework . '/?lang=' . $language . '&server=' . $runtime . '&initialization=ssr';
        $text = $language === 'ko' ? ['link' => '대화형 폼'] : ['link' => 'Interactive form'];
        $provenance = json_encode($this->generator, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_HEX_TAG | JSON_HEX_AMP);
        return '<!doctype html><html lang="' . $language . '"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>CRUDUI</title><link rel="stylesheet" href="/crudui.css"><link rel="stylesheet" href="/comparison.css"></head><body class="frame"><header><h1>CRUDUI</h1><a href="' . htmlspecialchars($link, ENT_QUOTES, 'UTF-8') . '">' . $text['link'] . '</a></header><form id="form" method="post" action="/api/' . $runtime . '/save/' . $renderingPath . '/' . $framework . '"><div id="view">' . Generator::renderForm($form) . '</div></form><script type="application/json" id="generator">' . $provenance . '</script></body></html>';
    }

    private static function object(mixed $value, string $name): stdClass
    {
        if (!$value instanceof stdClass) throw new InvalidArgumentException('Expected ' . $name . ' object');
        return $value;
    }

    private static function options(stdClass $request): array
    {
        return property_exists($request, 'options') ? (array) self::object($request->options, 'options') : [];
    }

    /** Return the public methods declared by one common API class. */
    private static function signature(ReflectionClass $class): array
    {
        $methods = [];
        foreach ($class->getMethods(ReflectionMethod::IS_PUBLIC) as $method) {
            if ($method->getDeclaringClass()->getName() !== $class->getName()) continue;
            $parameters = [];
            foreach ($method->getParameters() as $parameter) {
                $parameters[] = [
                    'name' => $parameter->getName(),
                    'type' => (string) $parameter->getType(),
                    'reference' => $parameter->isPassedByReference(),
                    'variadic' => $parameter->isVariadic(),
                    'optional' => $parameter->isOptional(),
                    'default' => $parameter->isDefaultValueAvailable() ? $parameter->getDefaultValue() : null,
                ];
            }
            $methods[$method->getName()] = ['static' => $method->isStatic(), 'parameters' => $parameters, 'return' => (string) $method->getReturnType()];
        }
        ksort($methods);
        return $methods;
    }

    private static function composerAutoloadRegistered(): bool
    {
        foreach (spl_autoload_functions() as $loader) {
            if (is_array($loader) && is_object($loader[0] ?? null) && $loader[0]::class === 'Composer\Autoload\ClassLoader') return true;
        }
        return false;
    }

    /** Verify one PHP class against its declared source or installed package copy. */
    private static function verifyPhpClassSource(
        string $name,
        ReflectionClass $class,
        string $sourceRoot,
        array $files,
    ): void
    {
        $sourceFile = self::regularFile($sourceRoot . '/' . $files['source'], 'candidate source file');
        $expectedFile = $sourceFile;
        if (isset($files['package'], $files['installed'])) {
            $vendorDirectory = self::regularDirectory(
                $sourceRoot . '/packages/generator-php/vendor',
                'candidate Composer vendor directory',
            );
            $installDirectory = self::composerPackageDirectory($files['package'], $vendorDirectory);
            $expectedFile = self::regularFile($installDirectory . '/' . $files['installed'], 'installed package file');
            $sourceBytes = file_get_contents($sourceFile);
            $installedBytes = file_get_contents($expectedFile);
            if (!is_string($sourceBytes) || !is_string($installedBytes) || $sourceBytes !== $installedBytes) {
                throw new RuntimeException('Installed CRUDUI source differs from the candidate: ' . $name);
            }
        }
        $classFile = $class->getFileName();
        if (!is_string($classFile) || self::regularFile($classFile, 'loaded class file') !== $expectedFile) {
            throw new RuntimeException('Incorrect CRUDUI source file: ' . $name);
        }
    }

    /** Return one regular package directory from the selected Composer record. */
    private static function composerPackageDirectory(string $package, string $vendorDirectory): string
    {
        $recordFile = self::regularFile(
            $vendorDirectory . '/composer/installed.php',
            'Composer installed-package record',
        );
        $installed = require $recordFile;
        if (!is_array($installed) || !is_array($installed['versions'] ?? null)) {
            throw new RuntimeException('Malformed Composer installed-package record');
        }
        if (!array_key_exists($package, $installed['versions'])) {
            throw new RuntimeException('Missing Composer package record: ' . $package);
        }
        $record = $installed['versions'][$package];
        $directory = is_array($record) ? ($record['install_path'] ?? null) : null;
        if (!is_string($directory) || $directory === '') {
            throw new RuntimeException('Malformed Composer package record: ' . $package);
        }
        $directory = self::regularDirectory($directory, 'Composer package directory');
        if (!str_starts_with($directory, $vendorDirectory . '/')) {
            throw new RuntimeException('Composer package is outside the candidate vendor directory: ' . $package);
        }
        return $directory;
    }

    /** Return an absolute regular file without symbolic path components. */
    private static function regularFile(string $path, string $name): string
    {
        $resolved = self::regularPath($path, $name);
        $status = lstat($resolved);
        if ($status === false || ($status['mode'] & 0170000) !== 0100000) {
            throw new RuntimeException('Expected regular ' . $name);
        }
        return $resolved;
    }

    /** Return an absolute regular directory without symbolic path components. */
    private static function regularDirectory(string $path, string $name): string
    {
        $resolved = self::regularPath($path, $name);
        $status = lstat($resolved);
        if ($status === false || ($status['mode'] & 0170000) !== 0040000) {
            throw new RuntimeException('Expected regular ' . $name);
        }
        return $resolved;
    }

    /** Resolve one absolute path after rejecting missing and symbolic components. */
    private static function regularPath(string $path, string $name): string
    {
        if (!str_starts_with($path, '/')) throw new RuntimeException('Expected absolute ' . $name);
        $current = '/';
        foreach (explode('/', substr($path, 1)) as $component) {
            if ($component === '' || $component === '.') continue;
            if ($component === '..') {
                $current = dirname($current);
                continue;
            }
            $current = $current === '/' ? '/' . $component : $current . '/' . $component;
            $status = lstat($current);
            if ($status === false) throw new RuntimeException('Missing ' . $name);
            if (($status['mode'] & 0170000) === 0120000) {
                throw new RuntimeException('Symbolic links are not allowed in ' . $name);
            }
        }
        $resolved = realpath($path);
        if ($resolved === false) throw new RuntimeException('Cannot resolve ' . $name);
        return $resolved;
    }
}

<?php

declare(strict_types=1);

namespace CRUDUI\Generator\Tests;

use PHPUnit\Framework\TestCase;
use CRUDUI\Form;
use CRUDUI\FormError;
use CRUDUI\Generator;
use CRUDUI\Validator;

final class DocCoverageTest extends TestCase
{
    public function testPublicApiAndPackageSourceHaveDocumentation(): void
    {
        foreach ([Generator::class, Validator::class, Form::class, FormError::class] as $name) {
            $class = new \ReflectionClass($name);
            self::assertFalse($class->isInternal());
            self::assertNotFalse($class->getDocComment(), $name);
            foreach ($class->getMethods(\ReflectionMethod::IS_PUBLIC) as $method) {
                if ($method->getDeclaringClass()->getName() === $name) {
                    self::assertNotFalse($method->getDocComment(), $name . '::' . $method->getName());
                }
            }
        }
        require_once __DIR__ . '/../../../scripts/php-doc-coverage.php';
        $source = realpath(__DIR__ . '/../src');
        self::assertNotFalse($source);
        self::assertSame([], crudui_php_doc_gaps($source));
    }
}

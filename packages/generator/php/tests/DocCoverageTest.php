<?php

declare(strict_types=1);

namespace Polyspec\Crudui\Generator\Tests;

use PHPUnit\Framework\TestCase;
use Polyspec\Crudui\Docs\DocCoverage;
use Polyspec\Crudui\Form;
use Polyspec\Crudui\FormError;
use Polyspec\Crudui\Generator;
use Polyspec\Crudui\Validator;

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
        $source = realpath(__DIR__ . '/../src');
        self::assertNotFalse($source);
        self::assertSame([], DocCoverage::gaps($source));
    }
}

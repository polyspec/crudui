<?php

/** @generate-class-entries */

namespace CRUDUI {
    final class Generator {
        public static function compileForm(array|\stdClass $spec, array $options = []): \stdClass {}
        public static function bindForm(\stdClass $template, array|\stdClass $data = [], array $options = []): array {}
        public static function bindButtons(\stdClass $template, array|\stdClass $data = [], array $options = []): array {}
        public static function formButtonsHtml(array $buttons): string {}
        public static function renderForm(Form $form): string {}
        public static function renderList(array|\stdClass $spec, array $rows, array $options = []): string {}
        public static function buildList(array|\stdClass $spec, array $rows = [], array $options = []): \stdClass {}
        public static function renderDetail(array|\stdClass $spec, array|\stdClass $record = new \stdClass(), array $options = []): string {}
        public static function buildDetail(array|\stdClass $spec, array|\stdClass $record = new \stdClass(), array $options = []): \stdClass {}
        public static function sequenceRowKey(int|string $sequence): string {}
        public static function createRowKey(): string {}
    }
    final class Validator {
        public static function validate(array|\stdClass $spec, array|\stdClass $data, array $options = []): \stdClass {}
        public static function validateList(array|\stdClass $spec, array $options = []): \stdClass {}
        public static function validateDetail(array|\stdClass $spec, array $options = []): \stdClass {}
    }
    final class Form {
        public function __construct(\stdClass $template, array|\stdClass $data = [], array $options = []) {}
        public function getTemplate(): \stdClass {}
        public function getFields(): array {}
        public function getButtons(): array {}
        public function getMessages(): array {}
        public function getRevision(): int {}
        public function getData(): \stdClass {}
        public function getValue(string $path): mixed {}
        public function setData(array|\stdClass $data): void {}
        public function setValue(string $path, mixed $value): void {}
        public function addRow(string $path, array $options = []): string {}
        public function copyRow(string $path, string $key, array $options = []): string {}
        public function removeRow(string $path, string $key): void {}
        public function moveRow(string $path, string $key, int $index): void {}
        public function rekeyRow(string $path, string $oldKey, string $newKey): void {}
    }
    final class FormError extends \RuntimeException {
        private readonly string $errorCode;
        private readonly string $path;
        public function __construct(string $errorCode, string $message, string $path = '') {}
        public function getErrorCode(): string {}
        public function getPath(): string {}
    }
}

namespace CRUDUI\Validator\Compose {
    final class ComposeLoadError extends \RuntimeException {
        private readonly string $errorCode;
        private readonly array $compositionTrace;
        public function __construct(string $code, string $message, array $trace = []) {}
        public function getErrorCode(): string {}
        public function getCompositionTrace(): array {}
        public function __get(string $name): mixed {}
        public function __isset(string $name): bool {}
    }
}

namespace CRUDUI\Validator\Validate {
    final class FormInputError extends \RuntimeException {
        private readonly string $errorCode;
        public function __construct(string $message) {}
        public function getErrorCode(): string {}
    }
}

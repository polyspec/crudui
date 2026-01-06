<?php

declare(strict_types=1);

namespace App;

use Symfony\Component\Yaml\Yaml;

/**
 * Standalone Form Generator that produces output identical to Limepie Form Generator
 *
 * This generates HTML with the ORIGINAL Limepie attributes:
 * - class="valid-target form-control"
 * - name="common[email]" (bracket notation)
 * - data-name="Email"
 * - data-rule-name="common.email"
 * - data-default=""
 */
class FormGenerator
{
    private array $spec;
    private array $data;
    private string $baseKey;

    public function __construct(array $spec, array $data = [])
    {
        $this->spec = $spec;
        $this->data = $data;
        $this->baseKey = $spec['key'] ?? '';
    }

    public static function fromYaml(string $yamlPath, array $data = []): self
    {
        $spec = Yaml::parseFile($yamlPath);
        return new self($spec, $data);
    }

    /**
     * Generate the complete form HTML
     */
    public function generate(): string
    {
        $html = '';

        // Title
        if (!empty($this->spec['label'])) {
            $html .= '<h4 class="mb-3">' . htmlspecialchars($this->spec['label']) . '</h4>';
        }

        // Description
        if (!empty($this->spec['description'])) {
            $html .= '<p class="text-muted mb-4">' . nl2br(htmlspecialchars($this->spec['description'])) . '</p>';
        }

        // Generate form fields
        $html .= $this->generateGroup($this->baseKey, $this->spec, $this->data);

        // Buttons
        $html .= '<hr class="my-4" />';
        $html .= '<div class="clearfix">';

        $submitText = $this->spec['submit_button_text'] ?? 'Save';
        $html .= '<input type="submit" value="' . htmlspecialchars($submitText) . '" class="btn btn-primary" />';

        if (empty($this->spec['remove_list_button'])) {
            $listText = $this->spec['list_button_text'] ?? 'List';
            $html .= ' <a href="../" class="btn btn-secondary float-end">' . htmlspecialchars($listText) . '</a>';
        }

        $html .= '</div>';

        return $html;
    }

    /**
     * Convert dot notation to bracket notation for HTML name attribute
     * e.g., "order.customer.email" -> "order[customer][email]"
     */
    private function dotToBracket(string $dotName): string
    {
        $parts = explode('.', $dotName);
        if (count($parts) <= 1) {
            return $dotName;
        }
        $first = array_shift($parts);
        return $first . '[' . implode('][', $parts) . ']';
    }

    /**
     * Generate a group of fields
     */
    private function generateGroup(string $parentRuleName, array $spec, array $data): string
    {
        $html = '';

        foreach ($spec['properties'] ?? [] as $fieldKey => $fieldSpec) {
            // Build the rule name in dot notation: order.customer.email
            $ruleName = $parentRuleName ? $parentRuleName . '.' . $fieldKey : $fieldKey;

            // Build the name key in bracket notation: order[customer][email]
            $nameKey = $this->dotToBracket($ruleName);

            // Get value from data
            $value = $data[$fieldKey] ?? null;

            // Get label for data-name attribute
            $label = $this->getLabel($fieldSpec);

            $type = $fieldSpec['type'] ?? 'text';

            // Handle multiple fields
            if (!empty($fieldSpec['multiple'])) {
                $html .= $this->generateMultiple($ruleName, $fieldSpec, is_array($value) ? $value : [], $label);
                continue;
            }

            // Handle nested groups
            if ($type === 'group') {
                $groupClass = $fieldSpec['class'] ?? '';
                $html .= '<div class="form-element-wrapper ' . $groupClass . '">';
                if ($label) {
                    $html .= '<label class="form-label fw-bold">' . htmlspecialchars($label) . '</label>';
                }
                $html .= $this->generateGroup($ruleName, $fieldSpec, is_array($value) ? $value : []);
                $html .= '</div>';
                continue;
            }

            // Generate the field
            $html .= $this->generateField($nameKey, $ruleName, $fieldSpec, $value, $label);
        }

        return $html;
    }

    /**
     * Generate a single field
     */
    private function generateField(string $nameKey, string $ruleName, array $spec, mixed $value, string $label): string
    {
        $type = $spec['type'] ?? 'text';
        $method = 'generate' . ucfirst($type);

        if (method_exists($this, $method)) {
            $fieldHtml = $this->$method($nameKey, $ruleName, $spec, $value, $label);
        } else {
            $fieldHtml = $this->generateText($nameKey, $ruleName, $spec, $value, $label);
        }

        // Wrap in form-element-wrapper
        $wrapperClass = $spec['class'] ?? '';
        $html = '<div class="form-element-wrapper mb-3 ' . $wrapperClass . '">';

        // Add label (except for checkbox which handles its own label)
        if (!in_array($type, ['checkbox', 'hidden']) && $label) {
            $labelClass = $spec['label_class'] ?? '';
            $html .= '<label class="form-label ' . $labelClass . '">' . htmlspecialchars($label) . '</label>';
        }

        // Add description before field if exists
        if (!empty($spec['description'])) {
            $html .= '<div class="form-text text-muted mb-1">' . nl2br(htmlspecialchars($spec['description'])) . '</div>';
        }

        $html .= '<div class="input-group-wrapper">' . $fieldHtml . '</div>';
        $html .= '</div>';

        return $html;
    }

    /**
     * Generate text input - Original Limepie format
     */
    private function generateText(string $nameKey, string $ruleName, array $spec, mixed $value, string $label): string
    {
        $value = htmlspecialchars((string)($value ?? $spec['default'] ?? ''));
        $default = htmlspecialchars((string)($spec['default'] ?? ''));

        $attrs = $this->buildCommonAttrs($spec);

        $prepend = $this->buildPrepend($spec);
        $append = $this->buildAppend($spec);

        return <<<HTML
<div class="input-group">{$prepend}<input type="text" class="valid-target form-control{$attrs['elementClass']}" name="{$nameKey}" value="{$value}" data-name="{$label}" data-rule-name="{$ruleName}" data-default="{$default}"{$attrs['readonly']}{$attrs['disabled']}{$attrs['placeholder']}{$attrs['style']} />{$append}</div>
HTML;
    }

    /**
     * Generate email input
     */
    private function generateEmail(string $nameKey, string $ruleName, array $spec, mixed $value, string $label): string
    {
        $value = htmlspecialchars((string)($value ?? $spec['default'] ?? ''));
        $default = htmlspecialchars((string)($spec['default'] ?? ''));

        $attrs = $this->buildCommonAttrs($spec);
        $prepend = $this->buildPrepend($spec);
        $append = $this->buildAppend($spec);

        return <<<HTML
<div class="input-group">{$prepend}<input type="email" class="valid-target form-control{$attrs['elementClass']}" name="{$nameKey}" value="{$value}" data-name="{$label}" data-rule-name="{$ruleName}" data-default="{$default}"{$attrs['readonly']}{$attrs['disabled']}{$attrs['placeholder']}{$attrs['style']} />{$append}</div>
HTML;
    }

    /**
     * Generate password input
     */
    private function generatePassword(string $nameKey, string $ruleName, array $spec, mixed $value, string $label): string
    {
        $default = htmlspecialchars((string)($spec['default'] ?? ''));

        $attrs = $this->buildCommonAttrs($spec);

        return <<<HTML
<input type="password" class="valid-target form-control{$attrs['elementClass']}" name="{$nameKey}" value="" data-name="{$label}" data-rule-name="{$ruleName}" data-default="{$default}"{$attrs['readonly']}{$attrs['disabled']}{$attrs['placeholder']}{$attrs['style']} />
HTML;
    }

    /**
     * Generate number input
     */
    private function generateNumber(string $nameKey, string $ruleName, array $spec, mixed $value, string $label): string
    {
        $value = htmlspecialchars((string)($value ?? $spec['default'] ?? ''));
        $default = htmlspecialchars((string)($spec['default'] ?? ''));

        $attrs = $this->buildCommonAttrs($spec);
        $prepend = $this->buildPrepend($spec);
        $append = $this->buildAppend($spec);

        return <<<HTML
<div class="input-group">{$prepend}<input type="number" class="valid-target form-control{$attrs['elementClass']}" name="{$nameKey}" value="{$value}" data-name="{$label}" data-rule-name="{$ruleName}" data-default="{$default}"{$attrs['readonly']}{$attrs['disabled']}{$attrs['placeholder']}{$attrs['style']} />{$append}</div>
HTML;
    }

    /**
     * Generate date input
     */
    private function generateDate(string $nameKey, string $ruleName, array $spec, mixed $value, string $label): string
    {
        $value = htmlspecialchars((string)($value ?? $spec['default'] ?? ''));
        $default = htmlspecialchars((string)($spec['default'] ?? ''));

        $attrs = $this->buildCommonAttrs($spec);

        return <<<HTML
<input type="date" class="valid-target form-control{$attrs['elementClass']}" name="{$nameKey}" value="{$value}" data-name="{$label}" data-rule-name="{$ruleName}" data-default="{$default}"{$attrs['readonly']}{$attrs['disabled']}{$attrs['style']} />
HTML;
    }

    /**
     * Generate textarea
     */
    private function generateTextarea(string $nameKey, string $ruleName, array $spec, mixed $value, string $label): string
    {
        $value = htmlspecialchars((string)($value ?? $spec['default'] ?? ''));
        $default = htmlspecialchars((string)($spec['default'] ?? ''));
        $rows = $spec['rows'] ?? 3;

        $attrs = $this->buildCommonAttrs($spec);

        return <<<HTML
<textarea class="valid-target form-control{$attrs['elementClass']}" name="{$nameKey}" data-name="{$label}" data-rule-name="{$ruleName}" data-default="{$default}" rows="{$rows}"{$attrs['readonly']}{$attrs['disabled']}{$attrs['placeholder']}{$attrs['style']}>{$value}</textarea>
HTML;
    }

    /**
     * Generate select dropdown
     */
    private function generateSelect(string $nameKey, string $ruleName, array $spec, mixed $value, string $label): string
    {
        $value = (string)($value ?? $spec['default'] ?? '');
        $default = htmlspecialchars((string)($spec['default'] ?? ''));

        $attrs = $this->buildCommonAttrs($spec);

        $options = '';
        foreach ($spec['items'] ?? [] as $optValue => $optLabel) {
            $selected = ($value === (string)$optValue) ? ' selected' : '';
            $options .= '<option value="' . htmlspecialchars((string)$optValue) . '"' . $selected . '>' . htmlspecialchars($optLabel) . '</option>';
        }

        return <<<HTML
<select class="valid-target form-control form-select{$attrs['elementClass']}" name="{$nameKey}" data-name="{$label}" data-rule-name="{$ruleName}" data-default="{$default}"{$attrs['disabled']}{$attrs['style']}>{$options}</select>
HTML;
    }

    /**
     * Generate checkbox
     */
    private function generateCheckbox(string $nameKey, string $ruleName, array $spec, mixed $value, string $label): string
    {
        if ($value === null && isset($spec['default'])) {
            $value = $spec['default'];
        }
        $checked = $value ? ' checked' : '';

        $attrs = $this->buildCommonAttrs($spec);

        return <<<HTML
<div class="form-check"><input type="checkbox" class="valid-target form-check-input{$attrs['elementClass']}" name="{$nameKey}" value="1" data-name="{$label}" data-rule-name="{$ruleName}"{$checked}{$attrs['disabled']}{$attrs['style']} /> <label class="form-check-label">{$label}</label></div>
HTML;
    }

    /**
     * Generate hidden input
     */
    private function generateHidden(string $nameKey, string $ruleName, array $spec, mixed $value, string $label): string
    {
        $value = htmlspecialchars((string)($value ?? $spec['default'] ?? ''));

        return <<<HTML
<input type="hidden" class="valid-target" name="{$nameKey}" value="{$value}" data-name="{$label}" data-rule-name="{$ruleName}" />
HTML;
    }

    /**
     * Build common input attributes
     */
    private function buildCommonAttrs(array $spec): array
    {
        $attrs = [
            'readonly' => '',
            'disabled' => '',
            'placeholder' => '',
            'style' => '',
            'elementClass' => '',
        ];

        if (!empty($spec['readonly'])) {
            $attrs['readonly'] = ' readonly="readonly"';
        }

        if (!empty($spec['disabled'])) {
            $attrs['disabled'] = ' disabled="disabled"';
        }

        if (!empty($spec['placeholder'])) {
            $attrs['placeholder'] = ' placeholder="' . htmlspecialchars($spec['placeholder']) . '"';
        }

        if (!empty($spec['element_style'])) {
            $attrs['style'] = ' style="' . htmlspecialchars($spec['element_style']) . '"';
        }

        if (!empty($spec['element_class'])) {
            $attrs['elementClass'] = ' ' . htmlspecialchars($spec['element_class']);
        }

        return $attrs;
    }

    /**
     * Build prepend HTML
     */
    private function buildPrepend(array $spec): string
    {
        if (empty($spec['prepend'])) {
            return '';
        }
        $class = $spec['prepend_class'] ?? '';
        return '<span class="input-group-text ' . htmlspecialchars($class) . '">' . htmlspecialchars($spec['prepend']) . '</span>';
    }

    /**
     * Build append HTML
     */
    private function buildAppend(array $spec): string
    {
        if (empty($spec['append'])) {
            return '';
        }
        $class = $spec['append_class'] ?? '';
        return '<span class="input-group-text ' . htmlspecialchars($class) . '">' . htmlspecialchars($spec['append']) . '</span>';
    }

    /**
     * Generate multiple (array) field with card UI
     * Matches React FormGroup's MultipleFormGroup component
     */
    private function generateMultiple(string $parentRuleName, array $spec, array $data, string $label): string
    {
        $wrapperClass = $spec['class'] ?? '';
        $isSortable = !empty($spec['sortable']);
        $min = $spec['min'] ?? 0;
        $max = $spec['max'] ?? PHP_INT_MAX;

        $html = '<div class="form-element-wrapper ' . htmlspecialchars($wrapperClass) . '">';

        // Label
        if ($label) {
            $html .= '<label class="form-label fw-bold">' . htmlspecialchars($label) . '</label>';
        }

        // Description
        if (!empty($spec['description'])) {
            $html .= '<div class="form-text text-muted mb-1">' . nl2br(htmlspecialchars($spec['description'])) . '</div>';
        }

        $html .= '<div class="form-group multiple-items" data-multiple="true" data-rule-name="' . htmlspecialchars($parentRuleName) . '" data-min="' . $min . '" data-max="' . $max . '" data-sortable="' . ($isSortable ? 'true' : 'false') . '">';

        // If empty, show add button with card style
        if (empty($data)) {
            $html .= '<div class="card multiple-item-empty">';
            $html .= '<div class="card-header d-flex justify-content-between align-items-center py-1">';
            $html .= '<span class="badge bg-secondary">0</span>';
            $html .= '<div class="btn-group btn-group-sm">';
            $html .= '<button type="button" class="btn btn-outline-primary multiple-add" data-action="add">+</button>';
            $html .= '</div>';
            $html .= '</div>';
            $html .= '</div>';
        }

        // Render each item
        $index = 0;
        foreach ($data as $itemKey => $itemData) {
            $html .= $this->generateMultipleItem(
                $parentRuleName,
                $spec,
                $itemKey,
                is_array($itemData) ? $itemData : [],
                $index,
                count($data),
                $isSortable,
                $min,
                $max
            );
            $index++;
        }

        $html .= '</div>'; // .form-group.multiple-items
        $html .= '</div>'; // .form-element-wrapper

        return $html;
    }

    /**
     * Generate a single multiple item with card UI
     */
    private function generateMultipleItem(
        string $parentRuleName,
        array $spec,
        string|int $itemKey,
        array $itemData,
        int $index,
        int $totalItems,
        bool $isSortable,
        int $min,
        int $max
    ): string {
        $canAdd = $totalItems < $max;
        $canRemove = $totalItems > $min;

        $html = '<div class="card multiple-item" data-index="' . $index . '" data-key="' . htmlspecialchars((string)$itemKey) . '">';

        // Card header with badge and buttons
        $html .= '<div class="card-header d-flex justify-content-between align-items-center py-1">';
        $html .= '<span class="badge bg-secondary">' . ($index + 1) . '</span>';

        // Button group
        $html .= '<div class="btn-group btn-group-sm">';

        // Add button
        if ($canAdd) {
            $html .= '<button type="button" class="btn btn-outline-primary multiple-add" data-action="add" data-index="' . $index . '">+</button>';
        }

        // Sortable up/down buttons
        if ($isSortable) {
            $upDisabled = $index === 0 ? ' disabled' : '';
            $downDisabled = $index === $totalItems - 1 ? ' disabled' : '';
            $html .= '<button type="button" class="btn btn-outline-secondary multiple-up" data-action="up" data-index="' . $index . '"' . $upDisabled . '>&uarr;</button>';
            $html .= '<button type="button" class="btn btn-outline-secondary multiple-down" data-action="down" data-index="' . $index . '"' . $downDisabled . '>&darr;</button>';
        }

        // Remove button
        if ($canRemove) {
            $html .= '<button type="button" class="btn btn-outline-danger multiple-remove" data-action="remove" data-index="' . $index . '">-</button>';
        }

        $html .= '</div>'; // .btn-group
        $html .= '</div>'; // .card-header

        // Card body with nested fields
        $html .= '<div class="card-body">';

        // Build rule name for nested items: parent.itemKey
        $itemRuleName = $parentRuleName . '.' . $itemKey;

        // Generate nested fields
        foreach ($spec['properties'] ?? [] as $fieldKey => $fieldSpec) {
            $fieldRuleName = $itemRuleName . '.' . $fieldKey;
            $nameKey = $this->dotToBracket($fieldRuleName);
            $value = $itemData[$fieldKey] ?? null;
            $fieldLabel = $this->getLabel($fieldSpec);
            $type = $fieldSpec['type'] ?? 'text';

            // Handle nested multiple (recursive)
            if (!empty($fieldSpec['multiple'])) {
                $html .= $this->generateMultiple($fieldRuleName, $fieldSpec, is_array($value) ? $value : [], $fieldLabel);
                continue;
            }

            // Handle nested groups
            if ($type === 'group') {
                $groupClass = $fieldSpec['class'] ?? '';
                $html .= '<div class="form-element-wrapper ' . $groupClass . '">';
                if ($fieldLabel) {
                    $html .= '<label class="form-label fw-bold">' . htmlspecialchars($fieldLabel) . '</label>';
                }
                $html .= $this->generateGroup($fieldRuleName, $fieldSpec, is_array($value) ? $value : []);
                $html .= '</div>';
                continue;
            }

            // Generate the field
            $html .= $this->generateField($nameKey, $fieldRuleName, $fieldSpec, $value, $fieldLabel);
        }

        $html .= '</div>'; // .card-body
        $html .= '</div>'; // .card.multiple-item

        return $html;
    }

    /**
     * Get label from spec
     */
    private function getLabel(array $spec): string
    {
        if (!isset($spec['label'])) {
            return '';
        }

        if (is_array($spec['label'])) {
            return $spec['label']['ko'] ?? $spec['label']['en'] ?? array_values($spec['label'])[0] ?? '';
        }

        return $spec['label'];
    }

    /**
     * Get the spec with rules for JavaScript validation
     */
    public function getSpec(): array
    {
        return $this->spec;
    }

    /**
     * Generate JavaScript spec for client-side validation
     */
    public function generateJsSpec(): string
    {
        return json_encode($this->spec, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    }
}

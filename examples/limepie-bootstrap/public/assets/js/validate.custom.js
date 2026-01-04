/**
 * Limepie Form Validation - Custom Version
 *
 * This is a simplified version of the original Limepie validate.js
 * for demonstration and comparison purposes.
 *
 * Original source: https://github.com/limepie/form-generator
 */

(function($) {
    'use strict';

    // Form Validator Class
    class FormValidator {
        constructor(form, options) {
            this.form = form;
            this.$form = $(form);
            this.options = $.extend({
                errorClass: 'is-invalid',
                validClass: 'is-valid',
                errorElement: 'div',
                errorClass: 'invalid-feedback',
                focusInvalid: true,
            }, options);

            this.init();
        }

        init() {
            this.bindEvents();
            this.$form.data('validator', this);
        }

        bindEvents() {
            const self = this;

            // Input change events
            this.$form.on('input change', '.valid-target', function() {
                self.checkByElements($(this));
            });

            // Form submit
            this.$form.on('submit', function(e) {
                if (!self.loadvalid()) {
                    e.preventDefault();
                    return false;
                }
            });
        }

        // Validate all fields
        loadvalid() {
            let isValid = true;
            const self = this;

            this.$form.find('.valid-target').each(function() {
                if (!self.validateElement($(this))) {
                    isValid = false;
                }
            });

            if (!isValid && this.options.focusInvalid) {
                this.$form.find('.is-invalid').first().focus();
            }

            return isValid;
        }

        // Validate specific elements
        checkByElements(elements) {
            const self = this;
            $(elements).each(function() {
                self.validateElement($(this));
            });
        }

        // Validate single element
        validateElement($element) {
            const rulesData = $element.data('rules');
            if (!rulesData) return true;

            let rules;
            try {
                rules = typeof rulesData === 'string' ? JSON.parse(rulesData) : rulesData;
            } catch (e) {
                console.error('Invalid rules JSON:', rulesData);
                return true;
            }

            const value = this.getElementValue($element);
            const name = $element.attr('name');
            let isValid = true;
            let errorMessage = '';

            // Check required
            if (rules.required && !value) {
                isValid = false;
                errorMessage = this.getMessage($element, 'required') || '필수 입력 항목입니다.';
            }

            // Check minlength
            if (isValid && rules.minlength && value.length < rules.minlength) {
                isValid = false;
                errorMessage = this.getMessage($element, 'minlength') ||
                    `최소 ${rules.minlength}자 이상 입력해주세요.`;
            }

            // Check maxlength
            if (isValid && rules.maxlength && value.length > rules.maxlength) {
                isValid = false;
                errorMessage = this.getMessage($element, 'maxlength') ||
                    `${rules.maxlength}자를 초과할 수 없습니다.`;
            }

            // Check email
            if (isValid && rules.email && value) {
                const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                if (!emailRegex.test(value)) {
                    isValid = false;
                    errorMessage = this.getMessage($element, 'email') ||
                        '올바른 이메일 형식으로 입력해주세요.';
                }
            }

            // Check pattern/match
            if (isValid && rules.match && value) {
                const regex = new RegExp(rules.match);
                if (!regex.test(value)) {
                    isValid = false;
                    errorMessage = this.getMessage($element, 'match') ||
                        '올바른 형식으로 입력해주세요.';
                }
            }

            // Update UI
            this.updateElementState($element, isValid, errorMessage);

            return isValid;
        }

        getElementValue($element) {
            const type = $element.attr('type');

            if (type === 'checkbox') {
                return $element.is(':checked') ? $element.val() : '';
            }

            if (type === 'radio') {
                return this.$form.find(`[name="${$element.attr('name')}"]:checked`).val() || '';
            }

            return $element.val() || '';
        }

        getMessage($element, rule) {
            const messages = $element.data('messages');
            if (messages && messages[rule]) {
                return messages[rule];
            }
            return null;
        }

        updateElementState($element, isValid, errorMessage) {
            const $wrapper = $element.closest('.input-group-wrapper');
            const $parent = $element.closest('.form-element-wrapper');

            // Remove existing messages
            const testId = $element.attr('name').replace(/\[/g, '_').replace(/\]/g, '');
            $parent.find(`.message_${testId}`).remove();

            // Update classes
            $element.removeClass('is-invalid is-valid');

            if (!isValid) {
                $element.addClass('is-invalid');
                // Add error message
                if (errorMessage) {
                    $wrapper.append(
                        `<div class="invalid-feedback message message_${testId}" style="display: block;">
                            ${errorMessage}
                        </div>`
                    );
                }
            } else {
                $element.addClass('is-valid');
            }
        }

        focusInvalid() {
            this.$form.find('.is-invalid').first().focus();
        }
    }

    // jQuery plugin
    $.fn.validate = function(options) {
        return this.each(function() {
            let validator = $.data(this, 'validator');
            if (!validator) {
                validator = new FormValidator(this, options);
                $.data(this, 'validator', validator);
            }
            return validator;
        });
    };

    // Auto-initialize forms
    $(function() {
        $('form').each(function() {
            if ($(this).find('.valid-target').length > 0) {
                $(this).validate();
            }
        });
    });

    // Form error handling from AJAX responses
    window.handleFormErrors = function(errors, form) {
        const $form = $(form);
        for (let idx in errors) {
            const error = errors[idx];
            const elementName = error.field;
            const message = error.message;
            const $element = $(`[name="${elementName}"]`, $form);
            const testId = elementName.replace(/\[/g, '_').replace(/\]/g, '');
            const $parent = $element.closest('.input-group-wrapper');

            $parent.find(`.message_${testId}`).remove();

            if ($parent.find(`.message_${testId}`).length === 0) {
                $parent.append(
                    `<div class="invalid-feedback message message_${testId}" style="display: block;">
                        ${message}
                    </div>`
                );
            }

            $element.addClass('is-invalid');
            if (idx === '0') {
                $element.focus();
            }
        }
    };

    // Plus button handler for dynamic fields
    $(document).on('click', '.btn-plus', function(e) {
        e.preventDefault();
        const $wrapper = $(this).closest('.input-group-wrapper');
        const $clone = $wrapper.clone();

        // Clear values
        $clone.find('input, textarea').val('');
        $clone.find('select').prop('selectedIndex', 0);
        $clone.find('.message').remove();
        $clone.find('.is-invalid, .is-valid').removeClass('is-invalid is-valid');

        // Insert after current wrapper
        $wrapper.after($clone.addClass('clone-element'));

        // Re-validate
        const $form = $wrapper.closest('form');
        const validator = $form.data('validator');
        if (validator) {
            validator.checkByElements($clone.find('.valid-target'));
        }
    });

    // Minus button handler
    $(document).on('click', '.btn-minus', function(e) {
        e.preventDefault();
        const $wrapper = $(this).closest('.input-group-wrapper');
        const $parent = $wrapper.parent();
        const count = $parent.children('.input-group-wrapper').length;

        if (count > 1) {
            $wrapper.remove();
        } else {
            // Clear first element instead of removing
            $wrapper.find('input, textarea').val('');
            $wrapper.find('select').prop('selectedIndex', 0);
            $wrapper.find('.message').remove();
            $wrapper.find('.is-invalid, .is-valid').removeClass('is-invalid is-valid');
        }
    });

})(jQuery);

console.log('Limepie validate.custom.js loaded');

import { createValidator } from '#validation-entry';

/** Connect the existing validator to form error display. */
export function formValidation(view, output, spec, text) {
  const validator = createValidator(spec);
  function clear() {
    for (const input of view.querySelectorAll('[aria-invalid]')) input.removeAttribute('aria-invalid');
    for (const error of view.querySelectorAll('[data-validation-error]')) error.remove();
    output.replaceChildren();
  }
  function validate(data) {
    clear();
    const result = validator.validate(data);
    if (!result.valid) {
      const title = document.createElement('p');
      title.textContent = text.invalid;
      output.append(title);
      for (const error of result.errors) {
        const name = `form${error.path.split('.').map(part => `[${part}]`).join('')}`;
        const input = Array.from(view.querySelectorAll('input[name],textarea[name],select[name]')).find(input => input.name === name);
        const detail = `${error.path}: ${error.message}`;
        const summary = document.createElement('p'); summary.textContent = detail;
        output.append(summary);
        if (input) {
          input.setAttribute('aria-invalid', 'true');
          const message = document.createElement('p');
          message.dataset.validationError = ''; message.className = 'fail'; message.textContent = error.message;
          input.closest('[data-field-path]').append(message);
        }
      }
    }
    return result;
  }
  return { validate, clear };
}

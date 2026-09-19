// The save of the canonical page's record form (docs/spec/form-comparison.md, "Canonical page"):
// the submit sends the form's native fields to the record API, 200 navigates to the saved list,
// 422 shows the validation result, and a failed request or any other answer shows an alert before
// the form and leaves it submittable again.
import { selectionQuery } from './record-view.mjs';

/** The JSON body of a response with one of the expected statuses; any other response fails. */
export async function readJson(response, what, statuses = [200]) {
  const type = response.headers.get('content-type') ?? '';
  if (!type.startsWith('application/json')) throw new Error(`${what}: ${response.status} ${type}`);
  const body = await response.json();
  if (!statuses.includes(response.status)) throw new Error(`${what}: ${response.status} ${body.error}`);
  return body;
}

/** Mark the fields the validation result names and list its errors before the form. */
export function showValidation(stage, form, validation, text) {
  stage.querySelector('#record-errors')?.remove();
  for (const input of form.querySelectorAll('[aria-invalid]')) input.removeAttribute('aria-invalid');
  for (const message of form.querySelectorAll('[data-validation-error]')) message.remove();
  if (validation.valid) return;
  const summary = document.createElement('div');
  summary.id = 'record-errors';
  summary.className = 'record-errors';
  summary.setAttribute('role', 'alert');
  const title = document.createElement('p');
  title.textContent = text.invalid;
  summary.append(title);
  const controls = [...form.querySelectorAll('input[name],textarea[name],select[name]')];
  for (const error of validation.errors) {
    const name = `form${error.path.split('.').map(part => `[${part}]`).join('')}`;
    const item = document.createElement('p');
    item.textContent = `${error.path}: ${error.message}`;
    summary.append(item);
    const control = controls.find(input => input.name === name);
    if (!control) continue;
    control.setAttribute('aria-invalid', 'true');
    const message = document.createElement('p');
    message.dataset.validationError = '';
    message.className = 'record-error';
    message.textContent = error.message;
    control.closest('[data-field-path]')?.append(message);
  }
  form.before(summary);
}

/** Show a failed save as an alert before the form. */
function showSaveFailure(stage, form, failure, text) {
  stage.querySelector('#save-errors')?.remove();
  const summary = document.createElement('div');
  summary.id = 'save-errors';
  summary.className = 'record-errors';
  summary.setAttribute('role', 'alert');
  const title = document.createElement('p');
  title.textContent = `${text.saveFailed} (${failure})`;
  summary.append(title);
  form.before(summary);
}

/** Install the submit handler of `form`; `send` performs the request and `navigate` the redirect. */
export function saveForm(stage, form, { selection, record, text, send, navigate }) {
  let saving = false;
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (saving) return;
    saving = true;
    const fields = new FormData(form, event.submitter ?? null);
    if (!fields.has('_form_complete')) fields.append('_form_complete', '1');
    const target = form.getAttribute('action');
    send(target, fields).then(async response => {
      const body = await readJson(response, `POST ${target}`, [200, 422]);
      if (response.status === 422) {
        showValidation(stage, form, body.validation, text);
        return;
      }
      navigate(`/?${selectionQuery(selection)}&saved=${encodeURIComponent(record.id)}`);
    }).catch(error => {
      showSaveFailure(stage, form, error.message, text);
    }).finally(() => { saving = false; });
  });
}

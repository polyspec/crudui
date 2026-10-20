/** Appends the fields of a native form submission of data: nested members as name[key], then the completion marker. */
export function appendNativeFields(fields, data) {
  function append(value, name) {
    if (value !== null && typeof value === 'object') {
      for (const [key, child] of Object.entries(value)) append(child, `${name}[${key}]`);
    } else fields.append(name, value == null ? '' : String(value));
  }
  append(data, 'form');
  fields.append('_form_complete', '1');
  return fields;
}

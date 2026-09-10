import { parseBytes, stringify, Value } from 'ordered-json';

function number(value) {
  if (!Number.isFinite(value) || (Number.isInteger(value) && !Number.isSafeInteger(value))) {
    throw new TypeError('JSON number exceeds the form data range');
  }
  return value;
}

function toValue(data) {
  if (data === null) return Value.null();
  if (typeof data === 'string') return Value.string(data);
  if (typeof data === 'boolean') return Value.boolean(data);
  if (typeof data === 'number') return Value.number(String(number(data)));
  if (Array.isArray(data)) return Value.array(data.map(toValue));
  if (typeof data === 'object' && [Object.prototype, null].includes(Object.getPrototypeOf(data))) {
    return Value.object(Object.entries(data).map(([key, child]) => [key, toValue(child)]));
  }
  throw new TypeError('Expected JSON form data');
}

function fromValue(value) {
  switch (value.kind) {
    case 'null': return null;
    case 'string': return value.stringValue();
    case 'boolean': return value.booleanValue();
    case 'number': return number(Number(value.numberLiteral()));
    case 'array': return value.items.map(fromValue);
    case 'object': {
      const entries = Array.from(value.members, ([key, child]) => [key, fromValue(child)]);
      const record = Object.fromEntries(entries);
      if (Object.keys(record).some((key, index) => key !== entries[index][0])) {
        throw new TypeError('JSON object order cannot be represented by form records');
      }
      return record;
    }
  }
}

/** Encode form records without changing keyed collection order or empty types. */
export function encodeJson(data) { return stringify(toValue(data)); }

/** Decode UTF-8 JSON bytes into the existing form and validator data model. */
export function decodeJson(bytes) { return fromValue(parseBytes(bytes)); }

/** Parse API responses with the same ordered processor used for requests. */
export async function readJson(response) {
  return decodeJson(new Uint8Array(await response.arrayBuffer()));
}

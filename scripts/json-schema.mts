// The shapes of the JSON that the scripts read (kit K157, K158): a schema states the shape, ajv validates the value, and a
// value of another shape fails with an Error that names the file and the JSON Pointer of the wrong value.
import { readFileSync } from 'node:fs';
import { Ajv, type ErrorObject, type SchemaObject, type ValidateFunction } from 'ajv';

const ajv = new Ajv({ allErrors: false, strict: false });

/** The validator of `schema`: a type guard of T, which accepts exactly the values that the schema states. */
export function shapeOf<T>(schema: SchemaObject): ValidateFunction<T> {
  return ajv.compile<T>(schema);
}

/** The first error of a refused value, as the JSON Pointer of the wrong value and the message of ajv: `at <pointer>: <message>`. */
export function shapeDetail(errors: ErrorObject[] | null | undefined): string {
  const [first] = errors ?? [];
  if (!first) return 'breaks its schema';
  return `${first.instancePath ? `at ${first.instancePath}: ` : ''}${first.message ?? 'breaks its schema'}`;
}

/** The Error of a value that a schema refused: `<label>`, then the JSON Pointer of the wrong value and the message of ajv. */
export function shapeError(label: string, errors: ErrorObject[] | null | undefined): Error {
  return new Error(`${label}: ${shapeDetail(errors)}`);
}

/** `value` checked against `shape`, typed T; `label` names the value, such as the file that holds it. */
export function checkedShape<T>(shape: ValidateFunction<T>, value: unknown, label: string): T {
  if (!shape(value)) throw shapeError(label, shape.errors);
  return value;
}

/** The JSON file `file`, read and checked against `shape`; a file that is not JSON fails with its parse error. */
export function readShape<T>(shape: ValidateFunction<T>, file: string): T {
  return checkedShape(shape, JSON.parse(readFileSync(file, 'utf8')), file);
}

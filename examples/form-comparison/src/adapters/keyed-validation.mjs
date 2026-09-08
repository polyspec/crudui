import { Validator } from '#validator';

export function createValidator(spec) {
  return new Validator(spec);
}

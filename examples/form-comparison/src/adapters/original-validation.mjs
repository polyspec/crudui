import { ValidatorV2 } from '#validator';

export function createValidator(spec) {
  return new ValidatorV2(spec);
}

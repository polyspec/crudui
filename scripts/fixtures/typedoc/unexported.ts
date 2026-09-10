/** Input accepted by the public operation. */
interface HiddenInput {
  /** Input value. */
  value: string;
}

/** Return the supplied input value. */
export function publicOperation(input: HiddenInput): string {
  return input.value;
}

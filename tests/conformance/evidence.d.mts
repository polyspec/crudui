// Types of the conformance evidence recorder for TypeScript tests.
export interface ConformanceRecord {
  feature: string;
  fixture: string;
  runtime: string;
  case: string;
  passed: boolean;
}

export function recordConformance(item: ConformanceRecord): void;

export function provesConformance<T>(
  target: { features: string[]; fixture: string; runtime: string; case: string },
  run: () => T | Promise<T>
): Promise<T>;

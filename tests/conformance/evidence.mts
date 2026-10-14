// Conformance evidence for JavaScript tests. A test that runs a shared fixture case records the
// feature it proves, the fixture, the runtime and the case. Nothing is written unless
// CRUDUI_CONFORMANCE_EVIDENCE names a directory; scripts/check-conformance.mts reads it.
import { appendFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

export interface ConformanceRecord {
  feature: string;
  fixture: string;
  runtime: string;
  case: string;
  passed: boolean;
}

export interface ConformanceTarget {
  features: string[];
  fixture: string;
  runtime: string;
  case: string;
}

/**
 * Record one case result.
 */
export function recordConformance({ feature, fixture, runtime, case: name, passed }: ConformanceRecord): void {
  for (const [key, value] of Object.entries({ feature, fixture, runtime, case: name })) {
    if (typeof value !== 'string' || value === '') throw new TypeError(`Conformance evidence ${key} must be a non-empty string`);
  }
  if (typeof passed !== 'boolean') throw new TypeError('Conformance evidence passed must be a boolean');
  const directory = process.env.CRUDUI_CONFORMANCE_EVIDENCE;
  if (!directory) return;
  mkdirSync(directory, { recursive: true });
  const line = JSON.stringify({ feature, fixture, runtime, case: name, passed });
  appendFileSync(path.join(directory, `javascript-${process.pid}.jsonl`), `${line}\n`);
}

/**
 * Run one fixture case and record its result for every feature it proves; the case's own
 * failure is rethrown.
 */
export async function provesConformance<T>(
  { features, fixture, runtime, case: name }: ConformanceTarget,
  run: () => T | Promise<T>
): Promise<T> {
  let passed = false;
  try {
    const result = await run();
    passed = true;
    return result;
  } finally {
    for (const feature of features) recordConformance({ feature, fixture, runtime, case: name, passed });
  }
}

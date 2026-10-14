// Run records of the suites that record conformance evidence (docs/spec/conformance.md, "Suite
// runs"). A run writes its record when it starts, with the status null, and again when its process
// exits, with the exit status, so a stopped run keeps null. scripts/check-conformance.mts reads the
// records to name the suites behind missing evidence. Nothing is written unless
// CRUDUI_CONFORMANCE_EVIDENCE names a directory.
import { randomBytes } from 'node:crypto';
import { mkdirSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export interface SuiteRun {
  program: string;
  tool?: string;
  cwd: string;
  args: string[];
}

interface SuiteRunRecord {
  program: string;
  tool: string | null;
  cwd: string;
  args: string[];
  started: string;
  status: number | null;
}

/**
 * Record the run of this process as a suite run.
 *
 * @param run the program relative to the repository root, the test tool it runs, the working
 *   directory relative to the root and the arguments
 */
export function recordSuiteRun({ program, tool, cwd, args }: SuiteRun): void {
  const directory = process.env.CRUDUI_CONFORMANCE_EVIDENCE;
  if (!directory) return;
  const runs = path.join(directory, 'runs');
  mkdirSync(runs, { recursive: true });
  const file = path.join(runs, `${process.pid}-${randomBytes(6).toString('hex')}.json`);
  const record: SuiteRunRecord = { program, tool: tool ?? null, cwd, args, started: new Date().toISOString(), status: null };
  // The record is written to a private file and renamed, so a reader never sees a partial record.
  const write = () => {
    writeFileSync(`${file}.partial`, `${JSON.stringify(record)}\n`);
    renameSync(`${file}.partial`, file);
  };
  write();
  process.once('exit', code => {
    record.status = code;
    write();
  });
}

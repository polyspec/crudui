// Vitest reporter printing through the shared progress lines. Vitest stops a test at its own
// timeout (--testTimeout); this reporter shows every test starting, still running and ending.
import path from 'node:path';

import { createProgress } from './progress.mjs';

const ROOT = path.resolve(import.meta.dirname, '../..');

export default class ProgressReporter {
  onInit() {
    this.progress = createProgress({ write: text => process.stdout.write(text) });
  }

  id(entity) {
    const file = path.relative(ROOT, entity.module?.moduleId ?? entity.moduleId);
    return entity.fullName ? `${file} › ${entity.fullName.replaceAll(' > ', ' › ')}` : file;
  }

  onTestModuleStart(testModule) {
    this.progress.start(this.id(testModule), { group: true });
  }

  onTestModuleEnd(testModule) {
    const id = this.id(testModule);
    const errors = testModule.errors();
    const duration = testModule.diagnostic().duration;
    if (errors.length || testModule.state() === 'failed') this.progress.fail(id, duration, errors.map(error => error.stack ?? error.message).join('\n'));
    else this.progress.pass(id, duration);
  }

  onTestCaseReady(testCase) {
    this.progress.start(this.id(testCase));
  }

  onTestCaseResult(testCase) {
    const id = this.id(testCase);
    const result = testCase.result();
    const duration = testCase.diagnostic()?.duration;
    if (result.state === 'passed') this.progress.pass(id, duration);
    else if (result.state === 'skipped') this.progress.skip(id);
    else this.progress.fail(id, duration, (result.errors ?? []).map(error => error.stack ?? error.message).join('\n'));
  }

  onTestRunEnd(testModules, unhandledErrors) {
    for (const error of unhandledErrors) this.progress.line(`✖ unhandled error: ${error.stack ?? error.message}`);
    this.progress.close('vitest');
  }
}

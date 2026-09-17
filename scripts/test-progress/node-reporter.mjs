// node:test reporter printing through the shared progress lines. node --test enforces each test's
// own timeout (--test-timeout); this reporter shows every test starting, still running and ending.
import path from 'node:path';
import { Transform } from 'node:stream';

import { createProgress } from './progress.mjs';

const ROOT = path.resolve(import.meta.dirname, '../..');

export default class ProgressReporter extends Transform {
  constructor() {
    super({ writableObjectMode: true });
    this.progress = createProgress({ write: text => this.push(text) });
    this.names = new Map();
  }

  // A test's position: its file, then the names of its enclosing tests.
  id(data) {
    const file = data.file ? path.relative(ROOT, data.file) : '';
    if (data.nesting === 0 && (data.name === file || data.name === data.file)) return { id: file, group: true };
    const trail = this.names.get(file) ?? [];
    trail.length = data.nesting;
    trail[data.nesting] = data.name;
    this.names.set(file, trail);
    return { id: [file, ...trail].filter(Boolean).join(' › '), group: false };
  }

  // node:test reports a start when a test leaves the queue and its result, in execution order,
  // when it completes.
  _transform(event, encoding, callback) {
    const { type, data } = event;
    if (type === 'test:dequeue') {
      const { id, group } = this.id(data);
      this.progress.start(id, { group });
    } else if (type === 'test:complete') {
      const { id } = this.id(data);
      const { duration_ms: duration, error, passed } = data.details;
      if (data.skip || data.todo) this.progress.skip(id);
      else if (passed) this.progress.pass(id, duration);
      else {
        const cause = error?.cause ?? error;
        this.progress.fail(id, duration, cause?.stack ?? cause?.message ?? String(cause));
      }
    } else if (type === 'test:stderr' || type === 'test:stdout') this.push(data.message);
    callback();
  }

  _flush(callback) {
    this.progress.close('node --test');
    callback();
  }
}

import assert from 'node:assert/strict';
import test from 'node:test';

import { failOnErrors } from './vue-errors.mjs';

test('the Vue error handler rethrows the error the application receives', () => {
  const config = { errorHandler: null };
  failOnErrors({ config });
  assert.notEqual(config.errorHandler, null);
  assert.throws(() => config.errorHandler(new Error('render failed')), /render failed/);
});

import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import test from 'node:test';

import { forwardLines } from './process-output.mjs';

test('forwards each line with its server name as it arrives, without the dropped lines', async () => {
  const stream = new PassThrough();
  const written = [];
  forwardLines(stream, {
    prefix: '[php] ', drop: line => line.startsWith('drop:'), write: text => written.push(text),
  });
  stream.write('drop: this line\n[Tue Sep 15 11:07:51 2026] PHP ');
  stream.write('Warning:  something\ndrop: that line\n');
  stream.end('no newline at the end');
  await new Promise(resolve => stream.once('end', resolve));
  assert.deepEqual(written, [
    '[php] [Tue Sep 15 11:07:51 2026] PHP Warning:  something\n',
    '[php] no newline at the end\n',
  ]);
});

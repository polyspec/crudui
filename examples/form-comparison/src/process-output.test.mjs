import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import test from 'node:test';

import { forwardLines, isPhpAccessLogLine } from './process-output.mjs';

test('drops the PHP access lines and keeps every other message', () => {
  for (const line of [
    '[Tue Sep 15 11:07:51 2026] 127.0.0.1:40274 Accepted',
    '[Tue Sep 15 11:07:51 2026] 127.0.0.1:40274 Closing',
    '[Tue Sep 15 11:07:51 2026] [::1]:40274 Accepted',
  ]) {
    assert.equal(isPhpAccessLogLine(line), true, line);
  }
  for (const line of [
    '[Tue Sep 15 11:07:14 2026] PHP Warning:  PHP Request Startup: POST Content-Length of '
      + '2100559 bytes exceeds the limit of 2097152 bytes in Unknown on line 0',
    '[Tue Sep 15 11:07:51 2026] PHP Warning:  PHP Request Startup: Input variables exceeded '
      + '10000. To increase the limit change max_input_vars in php.ini. in Unknown on line 0',
    '[Tue Sep 15 11:05:45 2026] PHP 8.4.24 Development Server (http://127.0.0.1:8081) started',
    '[Tue Sep 15 11:07:51 2026] 127.0.0.1:40274 [200]: POST /api/save/bindForm/react',
    '[supervisor] cycle 1: ready',
  ]) {
    assert.equal(isPhpAccessLogLine(line), false, line);
  }
});

test('forwards each line with its server name as it arrives', async () => {
  const stream = new PassThrough();
  const written = [];
  forwardLines(stream, {
    prefix: '[php] ', drop: isPhpAccessLogLine, write: text => written.push(text),
  });
  stream.write('[Tue Sep 15 11:07:51 2026] 127.0.0.1:1 Accepted\n[Tue Sep 15 11:07:51 2026] PHP ');
  stream.write('Warning:  something\n[Tue Sep 15 11:07:51 2026] 127.0.0.1:1 Closing\n');
  stream.end('no newline at the end');
  await new Promise(resolve => stream.once('end', resolve));
  assert.deepEqual(written, [
    '[php] [Tue Sep 15 11:07:51 2026] PHP Warning:  something\n',
    '[php] no newline at the end\n',
  ]);
});

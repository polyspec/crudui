import assert from 'node:assert/strict';

/** Navigate comparison frames after subscribing to their exact readiness messages. */
export async function loadComparisonFrames({
  host, frames, paths, framework, server, language, title,
}) {
  assert.equal(frames.length, paths.length,
    'Frame readiness requires one frame per rendering path');
  const expected = new Map(frames.map((frame, index) => [frame.contentWindow, paths[index]]));
  let resolve;
  let reject;
  const readiness = new Promise((ready, fail) => { resolve = ready; reject = fail; });

  function receive(event) {
    if (event.origin !== host.location.origin || !expected.has(event.source)
        || event.data?.type !== 'crudui:frame-ready') return;
    const path = expected.get(event.source);
    try {
      assert.deepEqual(event.data, {
        type: 'crudui:frame-ready', server, framework, path,
      });
      expected.delete(event.source);
      if (expected.size === 0) resolve();
    } catch (error) {
      reject(new Error('Frame readiness differs', { cause: error }));
    }
  }

  host.addEventListener('message', receive);
  try {
    for (const [index, path] of paths.entries()) {
      frames[index].title = title(path);
      frames[index].src = '/frames/' + path + '-' + framework
        + '/?lang=' + language + '&server=' + server;
    }
    await readiness;
  } finally {
    host.removeEventListener('message', receive);
  }
}

/** Navigate comparison frames after subscribing to their exact readiness messages. */
export async function loadComparisonFrames({
  host, frames, paths, framework, server, language, title,
}) {
  if (frames.length !== paths.length) {
    throw new Error('Frame readiness requires one frame per rendering path');
  }
  const expected = new Map(frames.map((frame, index) => [frame.contentWindow, paths[index]]));
  let resolve;
  let reject;
  const readiness = new Promise((ready, fail) => { resolve = ready; reject = fail; });

  function receive(event) {
    if (event.origin !== host.location.origin || !expected.has(event.source)
        || event.data?.type !== 'crudui:frame-ready') return;
    const path = expected.get(event.source);
    const value = event.data;
    if (value.server !== server || value.framework !== framework
        || value.path !== path || Object.keys(value).length !== 4) {
      reject(new Error('Frame readiness differs'));
      return;
    }
    expected.delete(event.source);
    if (expected.size === 0) resolve();
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

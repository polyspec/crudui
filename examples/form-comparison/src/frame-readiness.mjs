/** Navigate the initialization-path frames after subscribing to their exact readiness messages. */
export async function loadComparisonFrames({
  host, frames, initializations, path, framework, server, language, title, onReady,
}) {
  if (frames.length !== initializations.length) {
    throw new Error('Frame readiness requires one frame per initialization path');
  }
  const expected = new Map(frames.map((frame, index) => [frame.contentWindow, initializations[index]]));
  let resolve;
  let reject;
  const readiness = new Promise((ready, fail) => { resolve = ready; reject = fail; });

  function receive(event) {
    if (event.origin !== host.location.origin || !expected.has(event.source)
        || event.data?.type !== 'crudui:frame-ready') return;
    const initialization = expected.get(event.source);
    const value = event.data;
    if (value.server !== server || value.framework !== framework || value.path !== path
        || value.initialization !== initialization || Object.keys(value).length !== 5) {
      reject(new Error('Frame readiness differs'));
      return;
    }
    expected.delete(event.source);
    onReady(initialization);
    if (expected.size === 0) resolve();
  }

  host.addEventListener('message', receive);
  try {
    for (const [index, initialization] of initializations.entries()) {
      frames[index].title = title(initialization);
      frames[index].src = '/frames/' + path + '-' + framework
        + '/?lang=' + language + '&server=' + server + '&initialization=' + initialization;
    }
    await readiness;
  } finally {
    host.removeEventListener('message', receive);
  }
}

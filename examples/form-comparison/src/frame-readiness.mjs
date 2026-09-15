import {
  formFrameworks, formInitializations, formRenderingPaths, formServers,
} from './runtime-paths.mjs';

/**
 * The document of one initialization frame. The SSR frame is the selected server's document with
 * the form already rendered; the CSR frame is the built page that mounts the form in the browser.
 */
export function frameUrl({ initialization, path, framework, server, language }) {
  const query = '?lang=' + language + '&server=' + server + '&initialization=' + initialization;
  return initialization === 'ssr'
    ? '/api/' + server + '/ssr/' + path + '/' + framework + query
    : '/frames/' + path + '-' + framework + '/' + query;
}

/** The frame a document URL addresses, or null when the URL is not a frame document. */
export function parseFrameDocument(url) {
  const initialization = url.searchParams.get('initialization');
  const server = url.searchParams.get('server');
  const language = url.searchParams.get('lang');
  if (!formInitializations.includes(initialization) || !formServers.includes(server)
      || !['ko', 'en'].includes(language)) return null;
  const names = `(${formRenderingPaths.join('|')})-(${formFrameworks.join('|')})`;
  const match = initialization === 'ssr'
    ? new RegExp(`^/api/${server}/ssr/${names.replace('-', '/')}$`).exec(url.pathname)
    : new RegExp(`^/frames/${names}/$`).exec(url.pathname);
  return match && { server, initialization, language, path: match[1], framework: match[2] };
}

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
    if (event.origin !== host.location.origin || !expected.has(event.source)) return;
    const value = event.data;
    // A frame that cannot initialize reports why, instead of never becoming ready.
    if (value?.type === 'crudui:frame-failed') {
      reject(new Error(`Frame initialization failed: ${value.reason}`));
      return;
    }
    if (value?.type !== 'crudui:frame-ready') return;
    const initialization = expected.get(event.source);
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
      frames[index].src = frameUrl({ initialization, path, framework, server, language });
    }
    await readiness;
  } finally {
    host.removeEventListener('message', receive);
  }
}

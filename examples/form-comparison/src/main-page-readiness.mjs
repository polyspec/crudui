/** Subscribe before navigation and return the current main-page readiness wait. */
export async function subscribeMainPageReadiness(page) {
  let resolve;
  let reject;
  let settled = false;
  const readiness = new Promise((ready, fail) => { resolve = ready; reject = fail; });
  readiness.catch(() => {});

  const errorMessage = error => error instanceof Error ? error.message : String(error);
  const removeFailureListeners = () => {
    page.off('pageerror', onPageError);
    page.off('error', onPageFailure);
    page.off('close', onPageClose);
  };
  const succeed = value => {
    if (settled) return;
    settled = true;
    removeFailureListeners();
    resolve(value);
  };
  const fail = error => {
    if (settled) return;
    settled = true;
    removeFailureListeners();
    reject(error);
  };
  const onPageError = error => fail(new Error(
    'Main page initialization failed: ' + errorMessage(error), { cause: error },
  ));
  const onPageFailure = error => fail(new Error(
    'Main page failed: ' + errorMessage(error), { cause: error },
  ));
  const onPageClose = () => fail(new Error('Main page closed before readiness'));

  page.on('pageerror', onPageError);
  page.on('error', onPageFailure);
  page.on('close', onPageClose);
  try {
    await page.exposeFunction('cruduiMainPageReady', succeed);
    await page.evaluateOnNewDocument(() => {
      addEventListener('message', event => {
        if (event.origin === location.origin && event.source === window
            && event.data?.type === 'crudui:main-ready') {
          globalThis.cruduiMainPageReady(event.data);
        }
      });
    });
  } catch (error) {
    fail(new Error('Main page readiness subscription failed', { cause: error }));
    throw error;
  }
  return {
    wait: () => readiness,
  };
}

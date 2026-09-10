/** Subscribe before navigation and return the current main-page readiness wait. */
export async function subscribeMainPageReadiness(page) {
  let resolve;
  const readiness = new Promise(ready => { resolve = ready; });
  await page.exposeFunction('cruduiMainPageReady', value => resolve(value));
  await page.evaluateOnNewDocument(() => {
    addEventListener('message', event => {
      if (event.origin === location.origin && event.source === window
          && event.data?.type === 'crudui:main-ready') {
        globalThis.cruduiMainPageReady(event.data);
      }
    });
  });
  return {
    wait: () => readiness,
  };
}

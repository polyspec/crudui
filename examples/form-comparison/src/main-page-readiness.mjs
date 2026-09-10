/** Subscribe before navigation and return the current main-page readiness wait. */
export async function subscribeMainPageReadiness(page) {
  await page.evaluateOnNewDocument(() => {
    globalThis.cruduiMainReady = new Promise(resolve => {
      addEventListener('message', event => {
        if (event.origin === location.origin && event.source === window
            && event.data?.type === 'crudui:main-ready') resolve(event.data);
      });
    });
  });
  return {
    wait: () => page.evaluate(() => globalThis.cruduiMainReady),
  };
}

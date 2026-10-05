// Requests for one action that must not overlap: the supervisor's comparison of the mounted
// repository and the host's signal to the supervisor. A request runs the action; requests that
// arrive while it runs make it run once more after it ends, so every request is followed by a run
// that started after it, and no request waits on a timer.

/**
 * @param {() => Promise<void>} action
 * @returns {{ request: () => Promise<void> | undefined }} `request` returns the run it started, or
 *   nothing when a running action will run once more
 */
export function changeRequests(action) {
  let running = false;
  let pending = false;
  async function drain() {
    running = true;
    try {
      do {
        pending = false;
        await action();
      } while (pending);
    } finally {
      running = false;
    }
  }
  return {
    request() {
      if (running) {
        pending = true;
        return undefined;
      }
      return drain();
    },
  };
}

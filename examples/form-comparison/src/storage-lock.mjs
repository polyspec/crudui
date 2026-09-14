/**
 * The comparison servers keep the saved records that every frame and tab of the page origin
 * reads and replaces. An operation that changes them runs only while it holds this origin
 * lock; an operation started while another holds it fails at once instead of waiting.
 */
const storageLock = 'crudui-comparison-storage';

/** Run `task` while holding the storage lock, or throw `busyMessage` when it is held. */
export function exclusive(task, busyMessage) {
  return navigator.locks.request(storageLock, { ifAvailable: true }, lock => {
    if (!lock) throw new Error(busyMessage);
    return task();
  });
}

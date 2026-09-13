/** Undo history rules shared by form instances and applications that own their data. */

/** Maximum number of records kept for undo. */
export const HISTORY_LIMIT = 100;

/** Records before earlier changes, oldest first, and the path of the last value edit. */
export interface History<T> {
  /** Earlier records, at most `HISTORY_LIMIT`. */
  readonly entries: readonly T[];
  /** Path of the last change when it was a value edit. */
  readonly lastPath?: string;
}

/** A history with nothing to undo. Replacing the record returns to it. */
export function emptyHistory<T>(): History<T> {
  return { entries: [] };
}

/**
 * Record the record before a change. A value edit on the same path as the previous
 * value edit shares its entry; every other change adds an entry, dropping the oldest
 * beyond `HISTORY_LIMIT`.
 */
export function recordChange<T>(history: History<T>, previous: T, path?: string): History<T> {
  const merged = path !== undefined && path === history.lastPath;
  const entries = merged ? history.entries : [...history.entries, previous].slice(-HISTORY_LIMIT);
  return path === undefined ? { entries } : { entries, lastPath: path };
}

/** Whether a history has a record to restore. */
export function canUndo<T>(history: History<T>): boolean {
  return history.entries.length > 0;
}

/** The outcome of undoing one change. */
export interface UndoResult<T> {
  /** History without the restored record. */
  readonly history: History<T>;
  /** The record before the last change. */
  readonly value: T;
}

/** Take the record before the last change; the next value edit starts a new entry. */
export function undoChange<T>(history: History<T>): UndoResult<T> {
  if (!history.entries.length) throw new RangeError('Nothing to undo');
  return { history: { entries: history.entries.slice(0, -1) }, value: history.entries[history.entries.length - 1]! };
}

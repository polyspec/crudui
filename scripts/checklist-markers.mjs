/**
 * Check that a task state marker of the execution checklist appears only as the state of a task row: at the start
 * of the last cell of a row whose first cell is a task ID. An x or a capital X between brackets, the task list states of
 * GitHub, is a marker too. A marker in a legend, in prose, in a task text, in another
 * table or in inline code is an error with its file, line and column.
 */
const TASK_ROW = /^\|\s*C\d[\w.-]*\s*\|/;
const MARKER = /\[[ ~o!xX]\]/g;

/** The column index of the state of a task row, or -1 when the line is not a task row. */
function stateIndex(line) {
  const end = line.trimEnd().length - 1;
  if (!TASK_ROW.test(line) || line[end] !== '|' || line[end - 1] === '\\') return -1;
  // The last cell starts after the last unescaped `|` before the closing one.
  let cell = end - 1;
  while (cell >= 0 && !(line[cell] === '|' && line[cell - 1] !== '\\')) cell -= 1;
  return cell + 1 + line.slice(cell + 1).search(/\S/);
}

/** The errors of the markers of `text`, the checklist file at the repository path `path`. */
export function markerErrors(path, text) {
  const errors = [];
  text.split('\n').forEach((line, index) => {
    const state = stateIndex(line);
    for (const marker of line.matchAll(MARKER)) {
      if (marker.index !== state) {
        errors.push(`${path}:${index + 1}:${marker.index + 1}: state marker ${marker[0]} outside a task state; ` +
          'a checklist marker appears only as the state of a task row');
      }
    }
  });
  return errors;
}

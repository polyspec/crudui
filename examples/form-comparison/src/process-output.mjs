/**
 * Forward one child stream line by line with its server name, without the dropped lines.
 * Warnings, errors and every other message keep their text.
 */
export function forwardLines(stream, { prefix, drop = () => false, write }) {
  let pending = '';
  stream.setEncoding('utf8');
  function emit(line) {
    if (!drop(line)) write(`${prefix}${line}\n`);
  }
  stream.on('data', chunk => {
    pending += chunk;
    const lines = pending.split('\n');
    pending = lines.pop();
    for (const line of lines) emit(line);
  });
  stream.on('end', () => {
    if (pending) emit(pending);
    pending = '';
  });
}

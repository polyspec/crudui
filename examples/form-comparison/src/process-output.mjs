/**
 * The PHP built-in server logs one `Accepted` and one `Closing` line per request. Those lines
 * bury every other message in the container log, and they carry nothing the checks read.
 */
const phpAccessLine =
  /^\[[^\]]*\] (?:\d{1,3}(?:\.\d{1,3}){3}|\[[0-9a-fA-F:]+\]):\d+ (?:Accepted|Closing)$/;

/** Whether one output line is a PHP built-in server access line. */
export function isPhpAccessLogLine(line) {
  return phpAccessLine.test(line.trimEnd());
}

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

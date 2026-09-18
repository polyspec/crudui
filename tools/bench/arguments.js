/**
 * arguments.js — the iteration counts of the JavaScript driver and of run.js.
 *
 * Every driver applies the same rule (bench-php.php, go/main.go and rust/main.rs repeat it):
 * a count is one to eight decimal digits inside its range, `--iters` from 1 and `--warmup`
 * from 0, both up to MAX_COUNT. Anything else, a missing value included, stops the program
 * with exit status 2 and the one message tools/bench/iteration-arguments.json lists.
 */

const MAX_COUNT = 10000000;
const MINIMUM = { '--iters': 1, '--warmup': 0 };

/** The count a flag names, or the exit with the shared message. */
function count(flag, value) {
  const minimum = MINIMUM[flag];
  const number = /^[0-9]{1,8}$/.test(value ?? '') ? Number(value) : NaN;
  if (!(number >= minimum && number <= MAX_COUNT)) {
    process.stderr.write(`${flag} must be a whole number from ${minimum} to ${MAX_COUNT}\n`);
    process.exit(2);
  }
  return number;
}

module.exports = { count };

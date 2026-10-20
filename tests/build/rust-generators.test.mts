// The Rust generators of the contracts write the committed Rust sources: running a generator from the folder of its crate
// leaves its output byte for byte as committed, so a generator that cannot find its contract fails here.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));

/** The generators: the crate they run in, the tool and the Rust source that it writes. */
const GENERATORS = [
  { crate: 'packages/generator/rust', tool: 'tools/generate-interface-messages.mjs', output: 'src/messages/interface_messages.rs' },
  { crate: 'packages/validator/rust', tool: 'tools/generate-unicode-properties.mjs', output: 'src/validate/unicode/data.rs' },
] as const;

for (const { crate, tool, output } of GENERATORS) {
  test(`${crate}/${tool} rewrites ${output} as committed`, () => {
    const file = path.join(ROOT, crate, output);
    const committed = readFileSync(file);
    const run = spawnSync(process.execPath, [tool], { cwd: path.join(ROOT, crate), encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr);
    assert.deepEqual(readFileSync(file), committed);
  });
}

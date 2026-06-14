#!/usr/bin/env node
/**
 * run.js — benchmark orchestrator for the four crudui validators.
 *
 * Runs each language's in-process driver (bench-js.js, bench-php.php,
 * tools/bench/go, tools/bench/rust) on the SAME spec+input fixtures, collects
 * the one-JSON-line-per-spec reports, verifies all four backends agree on the
 * validation OUTCOME (valid/error/field) per spec — divergent results abort the
 * run, because comparing throughput on workloads that split the validators is
 * meaningless — then prints a table and writes results.md.
 *
 * Each driver does its OWN warmup + timing in-process. This orchestrator only
 * launches one process per language per run; process startup is amortized over
 * the whole N-iteration loop and is NOT inside any per-iteration measurement.
 * Contrast compare-all.js, which spawns one process PER CASE — correct for an
 * idempotency check, wrong for a throughput benchmark.
 *
 * Absolute times are machine-dependent. Read the columns RELATIVELY: the ratios
 * between backends are the signal, not the microsecond counts.
 *
 * Args: --iters N (default 50000), --warmup N (default 5000),
 *       --only js,go (comma list), --json (print raw JSON, skip table/file).
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const BENCH_DIR = __dirname;
const FIXTURES = path.join(BENCH_DIR, 'fixtures');
const REPO_ROOT = path.resolve(BENCH_DIR, '..', '..');
const RESULTS_MD = path.join(BENCH_DIR, 'results.md');

const SPECS = [
  { name: 'contact', label: 'contact (small, ~6 fields)' },
  { name: 'productnft', label: 'ProductNft (large, ~80 fields)' },
];

function parseArgs(argv) {
  const out = { iters: 50000, warmup: 5000, only: null, json: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--iters') out.iters = parseInt(argv[++i], 10);
    else if (argv[i] === '--warmup') out.warmup = parseInt(argv[++i], 10);
    else if (argv[i] === '--only') out.only = argv[++i].split(',').map((s) => s.trim());
    else if (argv[i] === '--json') out.json = true;
  }
  return out;
}

/** How to launch each language driver. cwd matters for Go/Rust module resolution. */
function drivers(iters, warmup) {
  const cargoBin = path.join(process.env.HOME || '', '.cargo', 'bin');
  return {
    js: {
      cmd: 'node',
      args: [path.join(BENCH_DIR, 'bench-js.js'), '--iters', String(iters), '--warmup', String(warmup)],
      cwd: BENCH_DIR,
      env: process.env,
    },
    php: {
      cmd: 'php',
      args: [path.join(BENCH_DIR, 'bench-php.php'), '--iters', String(iters), '--warmup', String(warmup)],
      cwd: BENCH_DIR,
      env: process.env,
    },
    go: {
      cmd: 'go',
      args: ['run', '.', '--fixtures', FIXTURES, '--iters', String(iters), '--warmup', String(warmup)],
      cwd: path.join(BENCH_DIR, 'go'),
      env: process.env,
    },
    rust: {
      cmd: 'cargo',
      args: [
        'run',
        '--release',
        '--quiet',
        '--',
        '--fixtures',
        FIXTURES,
        '--iters',
        String(iters),
        '--warmup',
        String(warmup),
      ],
      cwd: path.join(BENCH_DIR, 'rust'),
      // cargo/rustc may not be on the default PATH.
      env: { ...process.env, PATH: `${cargoBin}:${process.env.PATH || ''}` },
    },
  };
}

/** Run one driver, parse its JSON lines. Returns { ok, rows, error }. */
function runDriver(lang, d) {
  const res = spawnSync(d.cmd, d.args, {
    cwd: d.cwd,
    env: d.env,
    encoding: 'utf-8',
    timeout: 600000,
    maxBuffer: 1024 * 1024 * 16,
  });

  if (res.error) {
    return { ok: false, error: `${lang}: ${res.error.message}` };
  }
  if (res.status !== 0) {
    return { ok: false, error: `${lang}: exit ${res.status}\n${res.stderr || res.stdout}` };
  }

  const rows = [];
  for (const line of res.stdout.split('\n')) {
    const t = line.trim();
    if (!t.startsWith('{')) continue;
    try {
      rows.push(JSON.parse(t));
    } catch {
      // ignore non-JSON noise (e.g. cargo build chatter)
    }
  }
  if (rows.length === 0) {
    return { ok: false, error: `${lang}: no JSON rows in output\n${res.stdout}` };
  }
  return { ok: true, rows };
}

/** Verify all four backends agree on valid/error/field per spec. */
function checkAgreement(byLangBySpec, langs) {
  const problems = [];
  for (const { name } of SPECS) {
    const outcomes = {};
    for (const lang of langs) {
      const r = byLangBySpec[lang] && byLangBySpec[lang][name];
      if (!r) continue;
      outcomes[lang] = `valid=${r.valid} error=${r.error} field=${r.field}`;
    }
    const distinct = new Set(Object.values(outcomes));
    if (distinct.size > 1) {
      problems.push(
        `spec "${name}" — backends disagree on result:\n` +
          Object.entries(outcomes)
            .map(([l, o]) => `    ${l}: ${o}`)
            .join('\n')
      );
    }
  }
  return problems;
}

function fmtInt(n) {
  return n.toLocaleString('en-US');
}

function buildTable(byLangBySpec, langs) {
  // Columns: Spec | Lang | ops/sec | avg µs | ms total
  const header = ['Spec', 'Lang', 'ops/sec', 'avg µs', 'total ms'];
  const rows = [];
  for (const { name } of SPECS) {
    // Sort languages by ops/sec descending within each spec.
    const present = langs
      .map((lang) => ({ lang, r: byLangBySpec[lang] && byLangBySpec[lang][name] }))
      .filter((x) => x.r)
      .sort((a, b) => b.r.opsSec - a.r.opsSec);
    for (const { lang, r } of present) {
      rows.push([name, lang, fmtInt(r.opsSec), r.avgUs.toFixed(3), r.ms.toFixed(1)]);
    }
  }
  return { header, rows };
}

function printTable(table) {
  const widths = table.header.map((h, i) =>
    Math.max(h.length, ...table.rows.map((r) => String(r[i]).length))
  );
  const pad = (s, w, right) =>
    right ? String(s).padStart(w) : String(s).padEnd(w);
  const line = (cells) =>
    cells.map((c, i) => pad(c, widths[i], i >= 2)).join('  ');
  console.log('\n' + line(table.header));
  console.log(widths.map((w) => '-'.repeat(w)).join('  '));
  for (const r of table.rows) console.log(line(r));
  console.log('');
}

function writeResultsMd(table, args, langs, meta) {
  const lines = [];
  lines.push('# Validator benchmark results');
  lines.push('');
  lines.push(
    'Throughput of the four crudui validators (JS / PHP / Go / Rust) on an'
  );
  lines.push(
    'identical, cross-language-agreed workload. Each backend builds the'
  );
  lines.push(
    'validator once, then loops `validate(input)` for N iterations in-process.'
  );
  lines.push('');
  lines.push('## Run parameters');
  lines.push('');
  lines.push(`- iterations (measured): ${fmtInt(args.iters)}`);
  lines.push(`- warmup iterations: ${fmtInt(args.warmup)}`);
  lines.push(`- backends: ${langs.join(', ')}`);
  lines.push(`- node: ${meta.node}`);
  lines.push(`- php: ${meta.php}`);
  lines.push(`- go: ${meta.go}`);
  lines.push(`- rust/cargo: ${meta.cargo}`);
  lines.push('');
  lines.push('## Results');
  lines.push('');
  lines.push('| ' + table.header.join(' | ') + ' |');
  lines.push('| ' + table.header.map(() => '---').join(' | ') + ' |');
  for (const r of table.rows) lines.push('| ' + r.join(' | ') + ' |');
  lines.push('');
  lines.push('## How to read this');
  lines.push('');
  lines.push(
    '- **Absolute numbers are machine-dependent.** They were produced on one'
  );
  lines.push(
    "  developer machine in one run. Don't quote them as the validator's"
  );
  lines.push('  speed; quote the *ratios* between backends.');
  lines.push(
    '- **Compare down a column, within one spec.** ops/sec across the four'
  );
  lines.push(
    '  rows of a spec is the apples-to-apples backend comparison.'
  );
  lines.push(
    '- **The two specs are not comparable to each other.** `contact` runs a'
  );
  lines.push(
    '  fully-valid payload through every rule; `productnft` runs the empty'
  );
  lines.push(
    '  form, which short-circuits at the first required field. A spec being'
  );
  lines.push(
    '  "faster" than the other reflects the input, not difficulty.'
  );
  lines.push('');
  lines.push('## Fairness / method');
  lines.push('');
  lines.push(
    '- In-process loop per backend: process startup, module/autoload, spec'
  );
  lines.push(
    '  parse, and fixture I/O all happen BEFORE timing. The measured window is'
  );
  lines.push('  `validate()`-only. Startup cost is excluded by construction.');
  lines.push(
    '- One process per backend per run (not one per iteration). The per-case'
  );
  lines.push(
    '  spawn in `tests/runner/compare-all.js` is correct for idempotency but'
  );
  lines.push('  would fold interpreter/binary boot into every call — unfair here.');
  lines.push(
    '- All four read the SAME `tools/bench/fixtures/*.json` spec+input, and the'
  );
  lines.push(
    '  orchestrator aborts if the backends disagree on valid/error/field.'
  );
  lines.push(
    '- Rust is built `--release`; an unoptimized debug build would mismeasure.'
  );
  lines.push('');
  fs.writeFileSync(RESULTS_MD, lines.join('\n') + '\n');
}

function toolVersion(cmd, args, env) {
  try {
    const r = spawnSync(cmd, args, { encoding: 'utf-8', env: env || process.env });
    return (r.stdout || r.stderr || '').trim().split('\n')[0] || 'unknown';
  } catch {
    return 'unavailable';
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const allLangs = ['js', 'php', 'go', 'rust'];
  const langs = args.only ? allLangs.filter((l) => args.only.includes(l)) : allLangs;

  if (!fs.existsSync(path.join(FIXTURES, 'contact.spec.json'))) {
    console.error('Fixtures missing. Run: node tools/bench/gen-fixtures.js');
    process.exit(1);
  }

  const d = drivers(args.iters, args.warmup);
  const byLangBySpec = {};
  const failures = [];

  for (const lang of langs) {
    process.stderr.write(`[bench] running ${lang} (iters=${args.iters}, warmup=${args.warmup})...\n`);
    const out = runDriver(lang, d[lang]);
    if (!out.ok) {
      failures.push(out.error);
      process.stderr.write(`[bench] ${lang} FAILED: ${out.error}\n`);
      continue;
    }
    byLangBySpec[lang] = {};
    for (const row of out.rows) byLangBySpec[lang][row.spec] = row;
    if (args.json) for (const row of out.rows) process.stdout.write(JSON.stringify(row) + '\n');
  }

  const okLangs = langs.filter((l) => byLangBySpec[l]);
  if (okLangs.length === 0) {
    console.error('\n[bench] all backends failed:\n' + failures.join('\n'));
    process.exit(1);
  }

  // Agreement gate across the backends that ran.
  const problems = checkAgreement(byLangBySpec, okLangs);
  if (problems.length > 0) {
    console.error('\n[bench] CROSS-LANGUAGE DISAGREEMENT — refusing to report throughput:');
    for (const p of problems) console.error('  ' + p);
    process.exit(1);
  }

  const table = buildTable(byLangBySpec, okLangs);

  if (!args.json) {
    printTable(table);
    const cargoBin = path.join(process.env.HOME || '', '.cargo', 'bin');
    const meta = {
      node: toolVersion('node', ['--version']),
      php: toolVersion('php', ['--version']),
      go: toolVersion('go', ['version']),
      cargo: toolVersion('cargo', ['--version'], {
        ...process.env,
        PATH: `${cargoBin}:${process.env.PATH || ''}`,
      }),
    };
    writeResultsMd(table, args, okLangs, meta);
    console.log(`[bench] wrote ${path.relative(REPO_ROOT, RESULTS_MD)}`);
  }

  if (failures.length > 0) {
    console.error(`\n[bench] note: ${failures.length} backend(s) failed and were skipped:`);
    for (const f of failures) console.error('  ' + f.split('\n')[0]);
    process.exit(1);
  }
}

main();

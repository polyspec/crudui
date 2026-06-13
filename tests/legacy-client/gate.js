/**
 * Legacy-client vs new-validator comparison gate.
 *
 * Drives the legacy browser runtime (examples/legacy-original/assets/js/
 * legacy-client.validate.js) under jsdom+jQuery via ./adapter and compares its
 * {valid,error} verdict, per case, against the new validator-js (the canonical
 * client replacement; PHP/Go/Rust already agree with it per
 * tests/runner/compare-all.js). The case `expected` is also recorded.
 *
 * This is the missing axis: compare-all.js deliberately excludes the legacy
 * runtime. This gate asks "does the legacy browser verdict still match the new
 * stack?" — and where it does not, surfaces the exact client<->server gap.
 *
 * Verdict classes per case:
 *   match      legacy == validator-js
 *   gap        legacy != validator-js AND listed in known-gaps.js (documented)
 *   regression legacy != validator-js AND NOT documented  -> gate FAILS
 *   excluded   legacy cannot be faithfully driven (array/file/display_switch/
 *              absolute-path-resolution/etc.) -> not compared
 *
 * The gate also fails if a documented gap stops reproducing (stale list).
 */
const fs = require('fs');
const path = require('path');
const { runLegacyCase } = require('./adapter');
const knownGaps = require('./known-gaps');

const CASES_DIR = path.join(__dirname, '..', 'cases');
const JS_VALIDATOR = path.join(__dirname, '..', '..', 'packages', 'validator-js', 'dist', 'index.js');

function loadJs() {
  // eslint-disable-next-line global-require, import/no-dynamic-require
  return require(JS_VALIDATOR);
}

function convertSpec(spec) {
  if (spec.type === 'group' && spec.properties) return spec;
  return { type: 'group', properties: { value: spec } };
}
function convertInput(spec, input) {
  if (spec.type === 'group' && spec.properties) return input;
  if (input === '__undefined__') return { value: undefined };
  return { value: input };
}
function runJs(v, spec, input) {
  const validator = new v.Validator(convertSpec(spec));
  const r = validator.validate(convertInput(spec, input));
  if (r.valid) return { valid: true, error: null, field: null };
  const e = r.errors[0];
  return { valid: false, error: e.rule, field: e.path };
}

function caseKey(file, id, ci) {
  return `${file} ${id}[${ci}]`;
}

/**
 * Run the full gate.
 * @returns {{
 *   total:number, matched:number, gaps:number, excluded:number,
 *   regressions:Array, staleGaps:Array, exclusionsByReason:Object,
 *   gapList:Array
 * }}
 */
function runGate(options = {}) {
  const onlyFile = options.file || null;
  const v = loadJs();

  const seenGapKeys = new Set();
  const result = {
    total: 0,
    matched: 0,
    gaps: 0,
    excluded: 0,
    regressions: [],
    staleGaps: [],
    exclusionsByReason: {},
    gapList: [],
  };

  let files = fs.readdirSync(CASES_DIR).filter((f) => f.endsWith('.json'));
  if (onlyFile) files = files.filter((f) => f === onlyFile);

  for (const file of files) {
    const suite = JSON.parse(fs.readFileSync(path.join(CASES_DIR, file), 'utf-8'));
    for (const t of suite.tests) {
      for (let ci = 0; ci < t.cases.length; ci++) {
        const c = t.cases[ci];
        result.total++;
        const key = caseKey(file, t.id, ci);

        const legacy = runLegacyCase(t.spec, c.input);
        if (!legacy.supported) {
          result.excluded++;
          // bucket reason by leading phrase for a compact summary
          const bucket = legacy.reason.split(' @ ')[0].split(';')[0].trim();
          result.exclusionsByReason[bucket] = (result.exclusionsByReason[bucket] || 0) + 1;
          continue;
        }

        const js = runJs(v, t.spec, c.input);
        const same =
          legacy.valid === js.valid && (legacy.error || null) === (js.error || null);

        if (same) {
          result.matched++;
          continue;
        }

        // mismatch
        const detail = {
          key,
          input: c.input,
          legacy: { valid: legacy.valid, error: legacy.error, field: legacy.field },
          js: { valid: js.valid, error: js.error, field: js.field },
          expected: c.expected,
        };
        if (Object.prototype.hasOwnProperty.call(knownGaps, key)) {
          result.gaps++;
          seenGapKeys.add(key);
          result.gapList.push({ ...detail, reason: knownGaps[key] });
        } else {
          result.regressions.push(detail);
        }
      }
    }
  }

  // Stale documented gaps: listed but never reproduced (only meaningful for a
  // full run; skip when filtering to one file).
  if (!onlyFile) {
    for (const k of Object.keys(knownGaps)) {
      if (!seenGapKeys.has(k)) result.staleGaps.push(k);
    }
  }

  return result;
}

module.exports = { runGate };

// CLI mode
if (require.main === module) {
  const args = process.argv.slice(2);
  const fileArg = args.indexOf('--file');
  const opts = {};
  if (fileArg !== -1) opts.file = args[fileArg + 1];

  const r = runGate(opts);
  const C = {
    reset: '\x1b[0m', red: '\x1b[31m', green: '\x1b[32m',
    yellow: '\x1b[33m', cyan: '\x1b[36m', gray: '\x1b[90m', bold: '\x1b[1m',
  };
  console.log(`${C.bold}${C.cyan}Legacy-client vs new-validator gate${C.reset}`);
  console.log(`${C.gray}legacy: examples/legacy-original/assets/js/legacy-client.validate.js (jsdom+jQuery)${C.reset}`);
  console.log(`${C.gray}new:    packages/validator-js/dist (PHP/Go/Rust agree per compare-all.js)${C.reset}\n`);

  console.log(`Total cases:      ${r.total}`);
  console.log(`${C.green}Matched:          ${r.matched}${C.reset}`);
  console.log(`${C.yellow}Documented gaps:  ${r.gaps}${C.reset}`);
  console.log(`${C.gray}Excluded:         ${r.excluded}${C.reset}`);
  console.log(`${C.red}Regressions:      ${r.regressions.length}${C.reset}`);

  console.log(`\n${C.bold}Exclusion reasons:${C.reset}`);
  for (const [reason, n] of Object.entries(r.exclusionsByReason).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${C.gray}${n.toString().padStart(4)}${C.reset}  ${reason}`);
  }

  console.log(`\n${C.bold}Documented client<->server gaps (mismatches):${C.reset}`);
  for (const g of r.gapList) {
    console.log(`  ${C.yellow}${g.key}${C.reset} input=${JSON.stringify(g.input)}`);
    console.log(`     legacy: valid=${g.legacy.valid} error=${g.legacy.error}`);
    console.log(`     new:    valid=${g.js.valid} error=${g.js.error}  ${C.gray}(${g.reason})${C.reset}`);
  }

  if (r.staleGaps.length) {
    console.log(`\n${C.red}Stale documented gaps (no longer reproduce):${C.reset}`);
    r.staleGaps.forEach((k) => console.log(`  ${k}`));
  }

  if (r.regressions.length) {
    console.log(`\n${C.red}${C.bold}UNDOCUMENTED mismatches (gate FAIL):${C.reset}`);
    for (const d of r.regressions) {
      console.log(`  ${C.red}${d.key}${C.reset} input=${JSON.stringify(d.input)}`);
      console.log(`     legacy: valid=${d.legacy.valid} error=${d.legacy.error}`);
      console.log(`     new:    valid=${d.js.valid} error=${d.js.error}`);
      console.log(`     expected: valid=${d.expected.valid} error=${d.expected.error || ''}`);
    }
  }

  const ok = r.regressions.length === 0 && r.staleGaps.length === 0;
  console.log(`\n${ok ? C.green + 'GATE PASS' : C.red + 'GATE FAIL'}${C.reset}`);
  process.exit(ok ? 0 : 1);
}

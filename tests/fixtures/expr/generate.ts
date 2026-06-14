/**
 * Shared-fixture generator for the 4-language expression engine.
 *
 * Runs the JS reference engine (Lexer / Parser / evaluator) for real and dumps
 * tokens / AST / per-data evaluation results. AST + token `position` fields are
 * stripped (Rust AST holds no position; including it would break 4-language
 * parity). AST field names are the JS-actual ones.
 *
 * value  = evaluateExpressionValue(ast, ctx)   (ternary returns its branch value)
 * truthy = evaluateCondition(ast, ctx)          (boolean evaluate())
 */
import { Lexer, Parser } from '/path/to/ai/gui/form-spec/packages/validator-ts/src/parser/ConditionParser';
import {
  evaluateCondition,
  evaluateExpressionValue,
} from '/path/to/ai/gui/form-spec/packages/validator-ts/src/parser/PathResolver';
import type { PathContext } from '/path/to/ai/gui/form-spec/packages/validator-ts/src/types';

// ---------------------------------------------------------------------------
// Serialization helpers (drop `position`, keep JS-actual field names)
// ---------------------------------------------------------------------------

function serializeTokens(expr: string): unknown[] {
  const tokens = new Lexer(expr).tokenize();
  return tokens.map((t) => ({
    type: t.type,
    value: t.value,
    literal: t.literal as string | number | boolean | null,
  }));
}

const AST_FIELD_ORDER: Record<string, string[]> = {
  Ternary: ['type', 'condition', 'trueValue', 'falseValue'],
  Binary: ['type', 'operator', 'left', 'right'],
  Unary: ['type', 'operator', 'operand'],
  In: ['type', 'negated', 'value', 'list'],
  Path: ['type', 'relative', 'levelsUp', 'segments'],
  Literal: ['type', 'valueType', 'value'],
  Group: ['type', 'expression'],
};

function stripPosition(node: any): any {
  if (Array.isArray(node)) {
    return node.map(stripPosition);
  }
  if (node === null || typeof node !== 'object') {
    return node;
  }
  // Path segment: {type:'identifier',value} | {type:'wildcard'} | {type:'index',value}
  if (node.type === 'identifier' || node.type === 'wildcard' || node.type === 'index') {
    if (node.type === 'wildcard') return { type: 'wildcard' };
    return { type: node.type, value: node.value };
  }
  const order = AST_FIELD_ORDER[node.type as string];
  const out: Record<string, unknown> = {};
  if (order) {
    for (const k of order) {
      if (k in node) out[k] = stripPosition(node[k]);
    }
    return out;
  }
  // Fallback: copy everything except position
  for (const k of Object.keys(node)) {
    if (k === 'position') continue;
    out[k] = stripPosition(node[k]);
  }
  return out;
}

function buildAst(expr: string): unknown {
  const tokens = new Lexer(expr).tokenize();
  const ast = new Parser(tokens).parse();
  return stripPosition(ast);
}

// ---------------------------------------------------------------------------
// Case specs: { name, expr, dataCases: [{data, currentPath?, groupNode?}] }
// Expected value/truthy are computed by the real engine below.
// ---------------------------------------------------------------------------

interface DataSpec {
  data: Record<string, unknown>;
  currentPath?: string[];
  groupNode?: boolean;
}
interface CaseSpec {
  name: string;
  expr: string;
  dataCases: DataSpec[];
}

const SPECS: CaseSpec[] = [
  // ---- simple paths -----------------------------------------------------
  {
    name: 'path-sibling-truthy',
    expr: '.x',
    dataCases: [
      { data: { x: 1, self: 0 }, currentPath: ['self'] },
      { data: { x: 0, self: 0 }, currentPath: ['self'] },
      { data: { self: 0 }, currentPath: ['self'] },
    ],
  },
  {
    name: 'path-parent-up',
    expr: '..x',
    dataCases: [
      { data: { x: 'on', group: { self: 1 } }, currentPath: ['group', 'self'] },
      { data: { group: { self: 1 } }, currentPath: ['group', 'self'] },
    ],
  },
  {
    name: 'path-wildcard-array',
    expr: 'items.*.y',
    dataCases: [
      { data: { items: [{ y: 0 }, { y: 5 }] }, currentPath: ['items', '0', 'self'] },
      { data: { items: [{ y: 0 }, { y: 0 }] }, currentPath: ['items', '1', 'self'] },
    ],
  },
  {
    name: 'path-wildcard-compare',
    expr: 'items.*.is_close == 0',
    dataCases: [
      { data: { items: [{ is_close: 0 }, { is_close: 1 }] }, currentPath: ['items', '0', 'self'] },
      { data: { items: [{ is_close: 1 }, { is_close: 1 }] }, currentPath: ['items', '1', 'self'] },
    ],
  },

  // ---- comparisons ------------------------------------------------------
  {
    name: 'cmp-eq-string',
    expr: ".country == 'US'",
    dataCases: [
      { data: { country: 'US' } },
      { data: { country: 'CA' } },
    ],
  },
  {
    name: 'cmp-eq-unquoted-ident',
    expr: '.status == draft',
    dataCases: [
      { data: { status: 'draft' } },
      { data: { status: 'final' } },
    ],
  },
  {
    name: 'cmp-ne',
    expr: ".type != 'a'",
    dataCases: [{ data: { type: 'b' } }, { data: { type: 'a' } }],
  },
  {
    name: 'cmp-gt',
    expr: '.age > 18',
    dataCases: [{ data: { age: 21 } }, { data: { age: 18 } }, { data: { age: 5 } }],
  },
  {
    name: 'cmp-ge-le',
    expr: '.n >= 10',
    dataCases: [{ data: { n: 10 } }, { data: { n: 9 } }],
  },
  {
    name: 'cmp-lt-coerce-string',
    expr: '.score < 50',
    dataCases: [{ data: { score: '30' } }, { data: { score: '90' } }],
  },
  {
    name: 'in-number-list',
    expr: '.is_display in 2,3',
    dataCases: [
      { data: { is_display: 2 } },
      { data: { is_display: 3 } },
      { data: { is_display: 1 } },
    ],
  },
  {
    name: 'in-bracket-ident-list',
    expr: '.country in [US, CA, UK]',
    dataCases: [{ data: { country: 'CA' } }, { data: { country: 'FR' } }],
  },
  {
    name: 'not-in-list',
    expr: '.role not in admin,root',
    dataCases: [{ data: { role: 'user' } }, { data: { role: 'admin' } }],
  },

  // ---- logical ----------------------------------------------------------
  {
    name: 'logic-and',
    expr: ".a == 'x' && .b > 5",
    dataCases: [
      { data: { a: 'x', b: 6 } },
      { data: { a: 'x', b: 5 } },
      { data: { a: 'y', b: 6 } },
    ],
  },
  {
    name: 'logic-or',
    expr: '.a == 1 || .b == 1',
    dataCases: [
      { data: { a: 1, b: 0 } },
      { data: { a: 0, b: 1 } },
      { data: { a: 0, b: 0 } },
    ],
  },
  {
    name: 'logic-not',
    expr: '!.flag',
    dataCases: [{ data: { flag: false } }, { data: { flag: true } }],
  },
  {
    name: 'logic-not-group',
    expr: '!(.a == 1 || .b == 1)',
    dataCases: [{ data: { a: 0, b: 0 } }, { data: { a: 1, b: 0 } }],
  },

  // ---- precedence stress -----------------------------------------------
  {
    name: 'precedence-and-or-mix',
    expr: '.a == 1 || .b == 1 && .c == 1',
    dataCases: [
      { data: { a: 1, b: 0, c: 0 } }, // a true -> overall true regardless
      { data: { a: 0, b: 1, c: 1 } }, // b&&c true
      { data: { a: 0, b: 1, c: 0 } }, // b true but c false -> and is false -> false
    ],
  },
  {
    name: 'precedence-group-overrides',
    expr: '(.a == 1 || .b == 1) && .c == 1',
    dataCases: [
      { data: { a: 1, b: 0, c: 1 } },
      { data: { a: 1, b: 0, c: 0 } },
    ],
  },
  {
    name: 'precedence-not-vs-and',
    expr: '!.a && .b',
    dataCases: [
      { data: { a: false, b: true } },
      { data: { a: true, b: true } },
    ],
  },

  // ---- nested ternary (right-assoc), value-returning --------------------
  {
    name: 'ternary-value-string',
    expr: ".status == 'active' ? 'text-success' : 'text-muted'",
    dataCases: [{ data: { status: 'active' } }, { data: { status: 'off' } }],
  },
  {
    name: 'ternary-value-number',
    expr: '.big ? 100 : 0',
    dataCases: [{ data: { big: true } }, { data: { big: false } }],
  },
  {
    name: 'ternary-value-null',
    expr: ".show == 1 ? 'visible' : null",
    dataCases: [{ data: { show: 1 } }, { data: { show: 0 } }],
  },
  {
    name: 'ternary-nested-right-assoc',
    expr: ".level == 1 ? 'a' : .level == 2 ? 'b' : 'c'",
    dataCases: [
      { data: { level: 1 } },
      { data: { level: 2 } },
      { data: { level: 3 } },
    ],
  },

  // ---- path vs path comparison (.a < .b) -------------------------------
  {
    name: 'path-vs-path-lt',
    expr: '.a < .b',
    dataCases: [
      { data: { a: 1, b: 2 } },
      { data: { a: 2, b: 2 } },
      { data: { a: 3, b: 2 } },
    ],
  },
  {
    name: 'path-vs-path-eq',
    expr: '.password == .password_confirm',
    dataCases: [
      { data: { password: 'pw', password_confirm: 'pw' } },
      { data: { password: 'pw', password_confirm: 'no' } },
    ],
  },
  {
    name: 'path-vs-path-ge',
    expr: '.max >= .min',
    dataCases: [
      { data: { max: 10, min: 5 } },
      { data: { max: 5, min: 10 } },
    ],
  },

  // ---- condition-map shaped (default key true) -------------------------
  // The condition map is a thin wrapper that calls the engine per key in
  // declaration order. We model each key as its own case; the default key is
  // the literal `true` (always-true), evaluated as a standalone expression.
  {
    name: 'condmap-key-active',
    expr: ".status == 'active'",
    dataCases: [{ data: { status: 'active' } }, { data: { status: 'pending' } }],
  },
  {
    name: 'condmap-key-pending',
    expr: ".status == 'pending'",
    dataCases: [{ data: { status: 'pending' } }, { data: { status: 'active' } }],
  },
  {
    name: 'condmap-default-key-true',
    expr: 'true',
    dataCases: [{ data: {} }, { data: { status: 'active' } }],
  },

  // ---- truthy boundaries (null / 0 / "" / empty array) -----------------
  {
    name: 'truthy-null',
    expr: '.v',
    dataCases: [{ data: { v: null } }, { data: {} }],
  },
  {
    name: 'truthy-zero',
    expr: '.v',
    dataCases: [{ data: { v: 0 } }],
  },
  {
    name: 'truthy-empty-string',
    expr: '.v',
    dataCases: [{ data: { v: '' } }],
  },
  {
    name: 'truthy-empty-array',
    expr: '.v',
    dataCases: [{ data: { v: [] } }],
  },
  {
    name: 'truthy-empty-object',
    expr: '.v',
    dataCases: [{ data: { v: {} } }],
  },
  {
    name: 'truthy-nonempty-string',
    expr: '.v',
    dataCases: [{ data: { v: 'hello' } }],
  },
  {
    name: 'literal-bool-true',
    expr: 'true',
    dataCases: [{ data: {} }],
  },
  {
    name: 'literal-bool-false',
    expr: 'false',
    dataCases: [{ data: {} }],
  },
];

// ---------------------------------------------------------------------------
// Run the engine for real
// ---------------------------------------------------------------------------

function normalize(v: unknown): boolean | string | number | null {
  if (v === undefined) return null;
  if (
    v === null ||
    typeof v === 'boolean' ||
    typeof v === 'string' ||
    typeof v === 'number'
  ) {
    return v;
  }
  // Wildcard arrays etc. — should not appear in these fixtures; flag loudly.
  throw new Error('non-scalar evaluation value: ' + JSON.stringify(v));
}

const out = SPECS.map((spec) => {
  const tokens = serializeTokens(spec.expr);
  const ast = buildAst(spec.expr);
  const parsed = new Parser(new Lexer(spec.expr).tokenize()).parse();

  const cases = spec.dataCases.map((dc) => {
    const ctx: PathContext = {
      currentPath: dc.currentPath ?? [],
      formData: dc.data,
      ...(dc.groupNode ? { groupNode: true } : {}),
    };
    const value = normalize(evaluateExpressionValue(parsed, ctx, 'CURRENT'));
    const truthy = evaluateCondition(parsed, ctx, 'CURRENT');
    const entry: Record<string, unknown> = { data: dc.data };
    if (dc.currentPath && dc.currentPath.length > 0) entry.currentPath = dc.currentPath;
    entry.value = value;
    entry.truthy = truthy;
    return entry;
  });

  return { name: spec.name, expr: spec.expr, tokens, ast, cases };
});

process.stdout.write(JSON.stringify(out, null, 2) + '\n');

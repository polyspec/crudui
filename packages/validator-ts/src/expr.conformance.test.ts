/**
 * CRUDUI expression-engine conformance — JS reference verification.
 *
 * The shared fixture tests/fixtures/expr/cases.json is declared to be the JS
 * reference engine's own output (tokens + AST + eval). This test RE-VERIFIES
 * that claim by running the real JS engine (Lexer / parseCondition /
 * evaluateCondition / evaluateExpressionValue) against the same fixture the
 * other three engines load, with position stripped and type-strict comparison.
 *
 * Do not weaken assertions. If JS disagrees with the fixture, the fixture is
 * NOT the JS output and the cross-language contract is broken.
 */

import { describe, test, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Lexer, ParseError, parseCondition } from './parser/ConditionParser';
import {
  evaluateCondition,
  evaluateExpressionValue,
} from './parser/PathResolver';
import type { ASTNode, Token, PathContext } from './types';
import { provesConformance } from '../../../tests/conformance/evidence.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// packages/validator-ts/src -> repo root is three levels up.
const FIXTURE = path.resolve(
  __dirname,
  '../../../tests/fixtures/expr/cases.json'
);

interface FixtureCase {
  data: Record<string, unknown>;
  currentPath?: string[];
  value: unknown;
  truthy: boolean;
}
interface FixtureSpec {
  name: string;
  expr: string;
  tokens: Array<Record<string, unknown>>;
  ast: Record<string, unknown>;
  cases: FixtureCase[];
}
/** An expression the parser rejects, with the first line of its message. */
interface RejectedSpec {
  name: string;
  expr: string;
  error: string;
}

const specs: Array<FixtureSpec | RejectedSpec> = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));

function parseFailure(expr: string): string | null {
  try {
    parseCondition(expr);
    return null;
  } catch (error) {
    return error instanceof ParseError ? error.message.split('\n')[0]! : String(error);
  }
}

// Strip the engine's position metadata so the comparison is "position excluded".
function tokenToFixture(t: Token): Record<string, unknown> {
  return { type: t.type, value: t.value, literal: t.literal };
}

function astToFixture(node: ASTNode): unknown {
  const stripPos = (o: Record<string, unknown>): Record<string, unknown> => {
    const rest = { ...o };
    delete rest.position;
    return rest;
  };
  switch (node.type) {
    case 'Binary':
      return {
        ...stripPos(node),
        left: astToFixture(node.left),
        right: astToFixture(node.right),
      };
    case 'Unary':
      return { ...stripPos(node), operand: astToFixture(node.operand) };
    case 'In':
      return {
        ...stripPos(node),
        value: astToFixture(node.value),
        list: node.list.map(astToFixture),
      };
    case 'Group':
      return { ...stripPos(node), expression: astToFixture(node.expression) };
    case 'Ternary':
      return {
        ...stripPos(node),
        condition: astToFixture(node.condition),
        trueValue: astToFixture(node.trueValue),
        falseValue: astToFixture(node.falseValue),
      };
    case 'Path':
      return stripPos(node); // segments already plain
    case 'Literal':
      return stripPos(node);
    default:
      return stripPos(node as unknown as Record<string, unknown>);
  }
}

// Type-strict canonicalization mirroring the other three harnesses: numbers
// canonicalize (0 vs 0.0), key order is irrelevant, but booleans/strings/null
// stay strictly typed. JSON.parse already gives canonical numbers, so the only
// thing we need is stable key ordering for object comparison.
function canon(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canon);
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as Record<string, unknown>).sort()) {
      out[k] = canon((v as Record<string, unknown>)[k]);
    }
    return out;
  }
  return v;
}

function ctx(c: FixtureCase): PathContext {
  return {
    currentPath: c.currentPath ?? [],
    formData: c.data,
  };
}

// One test per fixture entry: its lexer, parser and every evaluation sub-case must match, and
// the entry is recorded as validate evidence only when all of them do.
describe('expr — lexer, parser and evaluation match fixture (JS reference)', () => {
  for (const spec of specs) {
    test(spec.name, () =>
      provesConformance(
        { features: ['validate'], fixture: 'tests/fixtures/expr/cases.json', runtime: 'javascript', case: spec.name },
        () => {
          if ('error' in spec) {
            expect(parseFailure(spec.expr), `parser of ${spec.name}`).toBe(spec.error);
            return;
          }
          const toks = new Lexer(spec.expr).tokenize().map(tokenToFixture);
          expect(canon(toks), `lexer of ${spec.name}`).toStrictEqual(canon(spec.tokens));

          const parsed = astToFixture(parseCondition(spec.expr));
          expect(canon(parsed), `parser of ${spec.name}`).toStrictEqual(canon(spec.ast));

          const ast = parseCondition(spec.expr);
          spec.cases.forEach((c, i) => {
            const value = evaluateExpressionValue(ast, ctx(c));
            // null vs undefined: fixture encodes null; JS path-miss returns
            // boolean false for conditions, and ternary null branch returns null.
            expect(value, `value case ${i} of ${spec.name}`).toStrictEqual(c.value);
            const truthy = evaluateCondition(ast, ctx(c));
            expect(truthy, `truthy case ${i} of ${spec.name}`).toStrictEqual(
              c.truthy
            );
          });
        }
      ));
  }
});

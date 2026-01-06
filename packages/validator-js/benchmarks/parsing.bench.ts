/**
 * Condition Expression Parsing Benchmarks
 *
 * Measures parsing performance including:
 * - Simple conditions
 * - Complex conditions with AND/OR
 * - Ternary expressions
 * - Path resolution with wildcards
 * - Cache performance comparison
 */

import {
  parseCondition,
  clearConditionCache,
  Lexer,
  Parser,
} from '../src/parser/ConditionParser';
import {
  benchmark,
  printResult,
  printComparison,
  getMemoryUsage,
  getMemoryDiff,
  formatBytes,
  BenchmarkResult,
} from './index';

// Sample condition expressions for benchmarking
const SIMPLE_CONDITIONS = [
  '.is_display == 1',
  '.name != ""',
  '.price > 0',
  '.quantity >= 10',
  '..is_close == 0',
  '.status == active',
];

const COMPLEX_CONDITIONS = [
  '.is_display == 2 || .is_display == 3',
  'common.is_option == 1 && option.button != ""',
  '.price > 0 && .quantity > 0 && .is_active == 1',
  '(..is_sale == 1 || ..is_sale == 2) && .price > 0',
  '.country in [US, CA, UK, AU]',
  '.status not in [deleted, archived, draft]',
  'common.is_option == 2 && option_multiple.items.*.is_close == 0',
];

const TERNARY_CONDITIONS = [
  '.is_required ? true : false',
  '.type == 1 ? .min_value : .max_value',
  '.is_display == 2 ? ..is_sale > 0 : false',
  '(.a > 0 && .b < 10) ? .result_a : .result_b',
];

const PATH_CONDITIONS = [
  '.field',
  '..parent_field',
  '...grandparent',
  'root.child.grandchild',
  'items.*.name',
  'option_multiple.items.*.is_close',
  '....deeply.nested.*.path.value',
];

const REAL_WORLD_CONDITIONS = [
  // From ProductNft.yml
  '..is_display == 2 || ..is_display == 3',
  'common.is_sale == 2',
  'common.is_option == 1',
  'common.is_option == 0 && option_single.items.*.is_close == 0',
  'common.is_option == 2 && option_multiple.items.*.is_close == 0',
  'common.is_option == 2 && common.is_quantity > 0 && option_multiple.items.*.is_close == 0',
  '..is_allday == 1',
];

/**
 * Run all parsing benchmarks
 */
export async function runParsingBenchmarks(): Promise<void> {
  // Benchmark 1: Lexer tokenization
  console.log('\n  Running lexer tokenization benchmarks...');
  await runLexerBenchmarks();

  // Benchmark 2: Parser (AST generation)
  console.log('\n  Running parser (AST) benchmarks...');
  await runParserBenchmarks();

  // Benchmark 3: Full parsing (Lexer + Parser)
  console.log('\n  Running full parsing benchmarks...');
  await runFullParsingBenchmarks();

  // Benchmark 4: Cache performance
  console.log('\n  Running cache performance benchmarks...');
  await runCacheBenchmarks();

  // Benchmark 5: Memory usage
  console.log('\n  Running memory usage benchmarks...');
  await runMemoryBenchmarks();
}

/**
 * Benchmark lexer tokenization
 */
async function runLexerBenchmarks(): Promise<void> {
  const allExpressions = [
    ...SIMPLE_CONDITIONS,
    ...COMPLEX_CONDITIONS,
    ...TERNARY_CONDITIONS,
  ];

  const lexerResult = await benchmark(
    'Lexer Tokenization (mixed expressions)',
    () => {
      for (const expr of allExpressions) {
        const lexer = new Lexer(expr);
        lexer.tokenize();
      }
    },
    { iterations: 1000 }
  );
  printResult(lexerResult);

  // Benchmark individual complexity levels
  const simpleResult = await benchmark(
    'Lexer - Simple Conditions',
    () => {
      for (const expr of SIMPLE_CONDITIONS) {
        const lexer = new Lexer(expr);
        lexer.tokenize();
      }
    },
    { iterations: 2000 }
  );
  printResult(simpleResult);

  const complexResult = await benchmark(
    'Lexer - Complex Conditions',
    () => {
      for (const expr of COMPLEX_CONDITIONS) {
        const lexer = new Lexer(expr);
        lexer.tokenize();
      }
    },
    { iterations: 2000 }
  );
  printResult(complexResult);
}

/**
 * Benchmark parser (AST generation)
 */
async function runParserBenchmarks(): Promise<void> {
  // Pre-tokenize for pure parser benchmarking
  const tokenizedSimple = SIMPLE_CONDITIONS.map((expr) => ({
    expr,
    tokens: new Lexer(expr).tokenize(),
  }));

  const tokenizedComplex = COMPLEX_CONDITIONS.map((expr) => ({
    expr,
    tokens: new Lexer(expr).tokenize(),
  }));

  const tokenizedTernary = TERNARY_CONDITIONS.map((expr) => ({
    expr,
    tokens: new Lexer(expr).tokenize(),
  }));

  const simpleParseResult = await benchmark(
    'Parser - Simple Conditions (pre-tokenized)',
    () => {
      for (const { tokens } of tokenizedSimple) {
        const parser = new Parser([...tokens]); // Clone tokens
        parser.parse();
      }
    },
    { iterations: 2000 }
  );
  printResult(simpleParseResult);

  const complexParseResult = await benchmark(
    'Parser - Complex Conditions (pre-tokenized)',
    () => {
      for (const { tokens } of tokenizedComplex) {
        const parser = new Parser([...tokens]);
        parser.parse();
      }
    },
    { iterations: 2000 }
  );
  printResult(complexParseResult);

  const ternaryParseResult = await benchmark(
    'Parser - Ternary Expressions (pre-tokenized)',
    () => {
      for (const { tokens } of tokenizedTernary) {
        const parser = new Parser([...tokens]);
        parser.parse();
      }
    },
    { iterations: 2000 }
  );
  printResult(ternaryParseResult);
}

/**
 * Benchmark full parsing (Lexer + Parser combined)
 */
async function runFullParsingBenchmarks(): Promise<void> {
  // Clear cache before each benchmark
  clearConditionCache();

  const simpleFullResult = await benchmark(
    'Full Parse - Simple Conditions (no cache)',
    () => {
      clearConditionCache();
      for (const expr of SIMPLE_CONDITIONS) {
        parseCondition(expr);
      }
    },
    { iterations: 1000 }
  );
  printResult(simpleFullResult);

  clearConditionCache();

  const complexFullResult = await benchmark(
    'Full Parse - Complex Conditions (no cache)',
    () => {
      clearConditionCache();
      for (const expr of COMPLEX_CONDITIONS) {
        parseCondition(expr);
      }
    },
    { iterations: 1000 }
  );
  printResult(complexFullResult);

  clearConditionCache();

  const realWorldResult = await benchmark(
    'Full Parse - Real-world Conditions (no cache)',
    () => {
      clearConditionCache();
      for (const expr of REAL_WORLD_CONDITIONS) {
        parseCondition(expr);
      }
    },
    { iterations: 1000 }
  );
  printResult(realWorldResult);
}

/**
 * Benchmark cache performance (with and without caching)
 */
async function runCacheBenchmarks(): Promise<void> {
  const allExpressions = [
    ...SIMPLE_CONDITIONS,
    ...COMPLEX_CONDITIONS,
    ...REAL_WORLD_CONDITIONS,
  ];

  // Benchmark without cache (clear before each iteration)
  const noCacheResult = await benchmark(
    'Parsing WITHOUT Cache',
    () => {
      clearConditionCache();
      for (const expr of allExpressions) {
        parseCondition(expr);
      }
    },
    { iterations: 500, measureMemory: true }
  );
  printResult(noCacheResult);

  // Prime the cache
  clearConditionCache();
  for (const expr of allExpressions) {
    parseCondition(expr);
  }

  // Benchmark with cache (already primed)
  const withCacheResult = await benchmark(
    'Parsing WITH Cache (pre-populated)',
    () => {
      for (const expr of allExpressions) {
        parseCondition(expr);
      }
    },
    { iterations: 500, measureMemory: true }
  );
  printResult(withCacheResult);

  // Print comparison
  printComparison(noCacheResult, withCacheResult);

  // Cold cache vs warm cache comparison
  console.log('\n  Cache Hit Performance:');
  const cacheSpeedup = noCacheResult.avgTime / withCacheResult.avgTime;
  console.log(`    Cache provides ${cacheSpeedup.toFixed(2)}x speedup`);
  console.log(`    Time saved per call: ${((noCacheResult.avgTime - withCacheResult.avgTime) / allExpressions.length).toFixed(4)} ms`);
}

/**
 * Benchmark memory usage of parsing
 */
async function runMemoryBenchmarks(): Promise<void> {
  const allExpressions = [
    ...SIMPLE_CONDITIONS,
    ...COMPLEX_CONDITIONS,
    ...TERNARY_CONDITIONS,
    ...REAL_WORLD_CONDITIONS,
  ];

  // Memory for storing 1000 parsed ASTs
  console.log('\n  Memory Usage for AST Storage:');

  clearConditionCache();
  const memBefore = getMemoryUsage();

  // Parse many unique expressions to fill cache
  const uniqueExpressions: string[] = [];
  for (let i = 0; i < 1000; i++) {
    const baseExpr = allExpressions[i % allExpressions.length];
    const uniqueExpr = `${baseExpr} && .field_${i} == ${i}`;
    uniqueExpressions.push(uniqueExpr);
    parseCondition(uniqueExpr);
  }

  const memAfter = getMemoryUsage();
  const memDiff = getMemoryDiff(memBefore, memAfter);

  console.log(`    1000 cached ASTs:`);
  console.log(`      Heap used:    ${formatBytes(memDiff.heapUsed)}`);
  console.log(`      Per AST:      ${formatBytes(memDiff.heapUsed / 1000)}`);

  // Token memory benchmark
  console.log('\n  Token Generation Memory:');
  const tokenMemBefore = getMemoryUsage();

  const allTokens: unknown[] = [];
  for (const expr of uniqueExpressions) {
    const lexer = new Lexer(expr);
    allTokens.push(lexer.tokenize());
  }

  const tokenMemAfter = getMemoryUsage();
  const tokenMemDiff = getMemoryDiff(tokenMemBefore, tokenMemAfter);

  console.log(`    1000 token arrays:`);
  console.log(`      Heap used:    ${formatBytes(tokenMemDiff.heapUsed)}`);
  console.log(`      Per array:    ${formatBytes(tokenMemDiff.heapUsed / 1000)}`);

  // Clear cache
  clearConditionCache();
}

/**
 * Additional benchmark: Path expression parsing
 */
async function runPathBenchmarks(): Promise<void> {
  console.log('\n  Running path expression benchmarks...');

  clearConditionCache();

  const pathResult = await benchmark(
    'Path Expression Parsing',
    () => {
      clearConditionCache();
      for (const expr of PATH_CONDITIONS) {
        parseCondition(expr);
      }
    },
    { iterations: 2000 }
  );
  printResult(pathResult);
}

/**
 * Form-Spec Validator Benchmark Runner
 *
 * Measures performance of:
 * 1. ProductNft.yml (1,318 lines) form validation
 * 2. Condition expression parsing
 * 3. Caching before/after comparison
 * 4. Memory usage
 */

import { runValidationBenchmarks } from './validation.bench';
import { runParsingBenchmarks } from './parsing.bench';

// ANSI color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

/**
 * Format bytes to human readable string
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(Math.abs(bytes)) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

/**
 * Format duration in milliseconds to human readable string
 */
export function formatDuration(ms: number): string {
  if (ms < 0.001) {
    return `${(ms * 1000000).toFixed(2)} ns`;
  }
  if (ms < 1) {
    return `${(ms * 1000).toFixed(2)} us`;
  }
  if (ms < 1000) {
    return `${ms.toFixed(2)} ms`;
  }
  return `${(ms / 1000).toFixed(2)} s`;
}

/**
 * Get current memory usage
 */
export function getMemoryUsage(): NodeJS.MemoryUsage {
  if (typeof global.gc === 'function') {
    global.gc();
  }
  return process.memoryUsage();
}

/**
 * Calculate memory difference
 */
export function getMemoryDiff(
  before: NodeJS.MemoryUsage,
  after: NodeJS.MemoryUsage
): { heapUsed: number; heapTotal: number; external: number; rss: number } {
  return {
    heapUsed: after.heapUsed - before.heapUsed,
    heapTotal: after.heapTotal - before.heapTotal,
    external: after.external - before.external,
    rss: after.rss - before.rss,
  };
}

export interface BenchmarkResult {
  name: string;
  iterations: number;
  totalTime: number;
  avgTime: number;
  minTime: number;
  maxTime: number;
  opsPerSecond: number;
  memoryBefore?: NodeJS.MemoryUsage;
  memoryAfter?: NodeJS.MemoryUsage;
}

/**
 * Run a benchmark with warmup and multiple iterations
 */
export async function benchmark(
  name: string,
  fn: () => void | Promise<void>,
  options: {
    warmupIterations?: number;
    iterations?: number;
    measureMemory?: boolean;
  } = {}
): Promise<BenchmarkResult> {
  const { warmupIterations = 10, iterations = 100, measureMemory = false } = options;

  // Warmup
  for (let i = 0; i < warmupIterations; i++) {
    await fn();
  }

  // Memory measurement before
  let memoryBefore: NodeJS.MemoryUsage | undefined;
  if (measureMemory) {
    memoryBefore = getMemoryUsage();
  }

  // Actual benchmark
  const times: number[] = [];
  const startTotal = performance.now();

  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    await fn();
    const end = performance.now();
    times.push(end - start);
  }

  const endTotal = performance.now();
  const totalTime = endTotal - startTotal;

  // Memory measurement after
  let memoryAfter: NodeJS.MemoryUsage | undefined;
  if (measureMemory) {
    memoryAfter = getMemoryUsage();
  }

  // Calculate statistics
  const avgTime = totalTime / iterations;
  const minTime = Math.min(...times);
  const maxTime = Math.max(...times);
  const opsPerSecond = 1000 / avgTime;

  return {
    name,
    iterations,
    totalTime,
    avgTime,
    minTime,
    maxTime,
    opsPerSecond,
    memoryBefore,
    memoryAfter,
  };
}

/**
 * Print benchmark result to console
 */
export function printResult(result: BenchmarkResult): void {
  console.log(`\n${colors.bold}${colors.cyan}${result.name}${colors.reset}`);
  console.log(`${colors.dim}${'─'.repeat(50)}${colors.reset}`);
  console.log(`  Iterations:     ${colors.yellow}${result.iterations}${colors.reset}`);
  console.log(`  Total time:     ${colors.green}${formatDuration(result.totalTime)}${colors.reset}`);
  console.log(`  Avg time:       ${colors.green}${formatDuration(result.avgTime)}${colors.reset}`);
  console.log(`  Min time:       ${colors.blue}${formatDuration(result.minTime)}${colors.reset}`);
  console.log(`  Max time:       ${colors.magenta}${formatDuration(result.maxTime)}${colors.reset}`);
  console.log(`  Ops/sec:        ${colors.yellow}${result.opsPerSecond.toFixed(2)}${colors.reset}`);

  if (result.memoryBefore && result.memoryAfter) {
    const diff = getMemoryDiff(result.memoryBefore, result.memoryAfter);
    console.log(`\n  ${colors.bold}Memory Usage:${colors.reset}`);
    console.log(`    Heap used:    ${formatBytes(diff.heapUsed)}`);
    console.log(`    Heap total:   ${formatBytes(diff.heapTotal)}`);
    console.log(`    RSS:          ${formatBytes(diff.rss)}`);
  }
}

/**
 * Print comparison between two benchmark results
 */
export function printComparison(
  baseline: BenchmarkResult,
  comparison: BenchmarkResult
): void {
  const speedup = baseline.avgTime / comparison.avgTime;
  const percentChange = ((baseline.avgTime - comparison.avgTime) / baseline.avgTime) * 100;

  console.log(`\n${colors.bold}${colors.magenta}Comparison: ${baseline.name} vs ${comparison.name}${colors.reset}`);
  console.log(`${colors.dim}${'─'.repeat(50)}${colors.reset}`);

  if (speedup > 1) {
    console.log(`  ${colors.green}${comparison.name} is ${speedup.toFixed(2)}x faster${colors.reset}`);
    console.log(`  ${colors.green}(${percentChange.toFixed(2)}% improvement)${colors.reset}`);
  } else {
    console.log(`  ${colors.yellow}${comparison.name} is ${(1 / speedup).toFixed(2)}x slower${colors.reset}`);
    console.log(`  ${colors.yellow}(${Math.abs(percentChange).toFixed(2)}% regression)${colors.reset}`);
  }
}

/**
 * Main benchmark runner
 */
async function main(): Promise<void> {
  console.log(`\n${colors.bold}${colors.blue}${'='.repeat(60)}${colors.reset}`);
  console.log(`${colors.bold}${colors.blue}  Form-Spec Validator Benchmarks${colors.reset}`);
  console.log(`${colors.bold}${colors.blue}${'='.repeat(60)}${colors.reset}\n`);

  console.log(`${colors.dim}Node.js ${process.version}${colors.reset}`);
  console.log(`${colors.dim}Platform: ${process.platform} ${process.arch}${colors.reset}`);
  console.log(`${colors.dim}Date: ${new Date().toISOString()}${colors.reset}\n`);

  // Memory usage at start
  const startMemory = getMemoryUsage();
  console.log(`${colors.dim}Initial memory usage:${colors.reset}`);
  console.log(`  Heap used: ${formatBytes(startMemory.heapUsed)}`);
  console.log(`  RSS: ${formatBytes(startMemory.rss)}\n`);

  try {
    // Run parsing benchmarks
    console.log(`\n${colors.bold}${colors.yellow}${'='.repeat(60)}${colors.reset}`);
    console.log(`${colors.bold}${colors.yellow}  Condition Expression Parsing Benchmarks${colors.reset}`);
    console.log(`${colors.bold}${colors.yellow}${'='.repeat(60)}${colors.reset}`);
    await runParsingBenchmarks();

    // Run validation benchmarks
    console.log(`\n${colors.bold}${colors.yellow}${'='.repeat(60)}${colors.reset}`);
    console.log(`${colors.bold}${colors.yellow}  Validation Benchmarks${colors.reset}`);
    console.log(`${colors.bold}${colors.yellow}${'='.repeat(60)}${colors.reset}`);
    await runValidationBenchmarks();

    // Final memory usage
    const endMemory = getMemoryUsage();
    const memDiff = getMemoryDiff(startMemory, endMemory);
    console.log(`\n${colors.bold}${colors.blue}${'='.repeat(60)}${colors.reset}`);
    console.log(`${colors.bold}${colors.blue}  Final Summary${colors.reset}`);
    console.log(`${colors.bold}${colors.blue}${'='.repeat(60)}${colors.reset}\n`);
    console.log(`${colors.dim}Total memory change during benchmarks:${colors.reset}`);
    console.log(`  Heap used: ${formatBytes(memDiff.heapUsed)}`);
    console.log(`  RSS: ${formatBytes(memDiff.rss)}\n`);
  } catch (error) {
    console.error(`\n${colors.bold}\x1b[31mBenchmark failed:${colors.reset}`, error);
    process.exit(1);
  }
}

main();

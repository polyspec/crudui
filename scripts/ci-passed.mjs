#!/usr/bin/env node
// The result of the job ci-passed of .github/workflows/ci.yml, the last job of the workflow, which needs every other job
// and runs under `if: ${{ always() }}`. `make ci-passed RESULTS='${{ toJSON(needs) }}'` passes the results of the needed
// jobs as GitHub writes them ({ "<job>": { "result": "success", "outputs": {} } }), and this command exits 0 only when
// every needed job has the result `success`: a failed, cancelled or skipped job fails it, and so does an empty or
// unreadable RESULTS. The ruleset main of .github/repository.json requires this check and the check `push-gate`.
import { pathToFileURL } from 'node:url';

/** The needed jobs whose result is not `success`, as `<job>: <result>`; throws for input that names no job. */
export function failedJobs(text) {
  let needs;
  try {
    needs = JSON.parse(text ?? '');
  } catch (error) {
    throw new Error(`RESULTS must be the JSON of toJSON(needs): ${error.message}`, { cause: error });
  }
  if (!needs || typeof needs !== 'object' || Array.isArray(needs)) throw new Error(`RESULTS must be a JSON object of jobs, received ${JSON.stringify(needs)}`);
  const jobs = Object.entries(needs);
  if (jobs.length === 0) throw new Error('RESULTS names no job: ci-passed checked nothing');
  return jobs.filter(([, job]) => job?.result !== 'success').map(([id, job]) => `${id}: ${job?.result ?? 'no result'}`);
}

function main() {
  let failed;
  try {
    failed = failedJobs(process.env.RESULTS);
  } catch (error) {
    console.error(`ci-passed: ${error.message}`);
    return 2;
  }
  if (failed.length === 0) {
    console.error(`ci-passed: every needed job succeeded (${Object.keys(JSON.parse(process.env.RESULTS)).length})`);
    return 0;
  }
  for (const line of failed) console.error(`::error::ci-passed: the job ${line}; expected success`);
  return 1;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = main();

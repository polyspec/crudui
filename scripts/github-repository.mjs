#!/usr/bin/env node
/**
 * Apply or check the GitHub repository settings declared in .github/repository.json, the ruleset of `main` included.
 *
 *   node scripts/github-repository.mjs apply   change only what differs (idempotent)
 *   node scripts/github-repository.mjs check   change nothing; fail when anything differs
 *
 * The ruleset requires a pull request, the merge queue and the checks of the push check and the CI workflow on `main`,
 * so every change reaches `main` through a pull request and the merge queue; this script publishes nothing
 * (docs/operations/repository.md). Requires an authenticated `gh` with administration rights on the repository. Every
 * read and write goes through `gh api`.
 */
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);

/** `gh api` as a function: returns { status, body } and never throws for an HTTP status. */
export async function ghApi(method, path, body) {
  const args = ['api', '--method', method, '--include', path];
  if (body !== undefined) args.push('--input', '-');
  const pending = run('gh', args, { maxBuffer: 16 * 1024 * 1024 });
  pending.child.stdin.end(body === undefined ? '' : JSON.stringify(body));
  // gh exits non-zero for an HTTP error status; the status line is still on stdout.
  const result = await pending.catch((error) => error);
  const output = String(result.stdout ?? '');
  const status = Number(output.match(/^HTTP\/[\d.]+ (\d{3})/)?.[1]);
  if (!status) throw new Error(`gh api ${method} ${path} failed: ${String(result.stderr ?? result.message).trim()}`);
  const text = output.split(/\r?\n\r?\n/).slice(1).join('\n\n').trim();
  return { status, body: text ? JSON.parse(text) : undefined };
}

async function expectOk(api, method, path, body) {
  const response = await api(method, path, body);
  if (response.status >= 300) {
    throw new Error(`${method} ${path} answered ${response.status}: ${JSON.stringify(response.body)}`);
  }
  return response.body;
}

const pick = (object, keys) => Object.fromEntries(keys.map((key) => [key, object?.[key] ?? null]));
const differs = (actual, wanted) => JSON.stringify(actual) !== JSON.stringify(wanted);

/** JSON with the keys of every object sorted, so two values compare by content. */
function canonical(value) {
  const sorted = (entry) => {
    if (Array.isArray(entry)) return entry.map(sorted);
    if (entry !== null && typeof entry === 'object') {
      return Object.fromEntries(Object.keys(entry).sort().map((key) => [key, sorted(entry[key])]));
    }
    return entry;
  };
  return JSON.stringify(sorted(value) ?? null);
}

const byCanonical = (a, b) => (canonical(a) < canonical(b) ? -1 : canonical(a) > canonical(b) ? 1 : 0);

/**
 * The fields of a ruleset that the declaration sets, in an order-free form: the rules, the required checks, the merge
 * methods and the bypass actors sorted. Fields that GitHub adds (id, source, _links, timestamps) are not compared.
 */
export function rulesetFields(ruleset, keys) {
  const picked = pick(ruleset, keys);
  if (Array.isArray(picked.bypass_actors)) picked.bypass_actors = [...picked.bypass_actors].sort(byCanonical);
  if (Array.isArray(picked.rules)) {
    picked.rules = picked.rules.map((rule) => {
      const parameters = { ...rule.parameters };
      for (const key of ['required_status_checks', 'allowed_merge_methods']) {
        if (Array.isArray(parameters[key])) parameters[key] = [...parameters[key]].sort(byCanonical);
      }
      return rule.parameters ? { ...rule, parameters } : rule;
    }).sort(byCanonical);
  }
  return JSON.parse(canonical(picked));
}

/** The change of the ruleset of the declared name, or none; fails when the name is not unique. Reads only. */
async function rulesetChanges(declaration, api) {
  const repo = `repos/${declaration.repository}`;
  const { ruleset } = declaration;
  const listed = (await expectOk(api, 'GET', `${repo}/rulesets?includes_parents=false&per_page=100`)) ?? [];
  const named = listed.filter((entry) => entry.name === ruleset.name);
  if (named.length > 1) {
    throw new Error(`${declaration.repository} has ${named.length} rulesets named ${ruleset.name} (ids ${named.map((entry) => entry.id).join(', ')}); delete all but one`);
  }
  if (named.length === 0) {
    return [{ what: `ruleset ${ruleset.name}`, actual: null, wanted: ruleset.name, method: 'POST', path: `${repo}/rulesets`, body: ruleset }];
  }
  const live = await expectOk(api, 'GET', `${repo}/rulesets/${named[0].id}`);
  const keys = Object.keys(ruleset);
  const actual = rulesetFields(live, keys);
  const wanted = rulesetFields(ruleset, keys);
  const fields = keys.filter((key) => canonical(actual[key]) !== canonical(wanted[key]));
  if (fields.length === 0) return [];
  return [{
    what: `ruleset ${ruleset.name} (${fields.join(', ')})`, actual: pick(actual, fields), wanted: pick(wanted, fields),
    method: 'PUT', path: `${repo}/rulesets/${named[0].id}`, body: ruleset,
  }];
}

/**
 * Compare the declaration with the live repository and return the changes, each with a
 * description and the request that applies it. Reads only.
 */
export async function plan(declaration, api) {
  const repo = `repos/${declaration.repository}`;
  const changes = [];
  const add = (what, actual, wanted, method, path, body) => {
    if (differs(actual, wanted)) changes.push({ what, actual, wanted, method, path, body });
  };

  const settingKeys = Object.keys(declaration.settings);
  const current = await expectOk(api, 'GET', repo);
  add('repository settings', pick(current, settingKeys), pick(declaration.settings, settingKeys),
    'PATCH', repo, declaration.settings);

  const actionKeys = Object.keys(declaration.actions);
  const actions = await expectOk(api, 'GET', `${repo}/actions/permissions`);
  add('Actions permissions', pick(actions, actionKeys), pick(declaration.actions, actionKeys),
    'PUT', `${repo}/actions/permissions`, declaration.actions);

  const workflowKeys = Object.keys(declaration.workflowPermissions);
  const workflow = await expectOk(api, 'GET', `${repo}/actions/permissions/workflow`);
  add('workflow permissions', pick(workflow, workflowKeys), pick(declaration.workflowPermissions, workflowKeys),
    'PUT', `${repo}/actions/permissions/workflow`, declaration.workflowPermissions);

  const alerts = (await api('GET', `${repo}/vulnerability-alerts`)).status === 204;
  add('vulnerability alerts', alerts, declaration.vulnerabilityAlerts,
    declaration.vulnerabilityAlerts ? 'PUT' : 'DELETE', `${repo}/vulnerability-alerts`);

  const fixes = (await expectOk(api, 'GET', `${repo}/automated-security-fixes`)).enabled;
  add('automated security fixes', fixes, declaration.automatedSecurityFixes,
    declaration.automatedSecurityFixes ? 'PUT' : 'DELETE', `${repo}/automated-security-fixes`);

  const pages = await api('GET', `${repo}/pages`);
  const buildType = pages.status === 200 ? pages.body.build_type : null;
  add('Pages build type', buildType, declaration.pages.build_type,
    pages.status === 200 ? 'PUT' : 'POST', `${repo}/pages`, declaration.pages);

  for (const [name, environment] of Object.entries(declaration.environments)) {
    const path = `${repo}/environments/${name}`;
    const wantedPolicy = { protected_branches: false, custom_branch_policies: true };
    const found = await api('GET', path);
    const policy = found.status === 200 ? found.body.deployment_branch_policy : null;
    add(`environment ${name}`, policy, wantedPolicy, 'PUT', path, { deployment_branch_policy: wantedPolicy });
    const branches = found.status === 200 && policy?.custom_branch_policies
      ? (await expectOk(api, 'GET', `${path}/deployment-branch-policies`)).branch_policies
      : [];
    const names = branches.map((branch) => branch.name).sort();
    for (const branch of environment.deploymentBranches) {
      if (!names.includes(branch)) {
        changes.push({ what: `environment ${name} deploys from ${branch}`, actual: names, wanted: environment.deploymentBranches,
          method: 'POST', path: `${path}/deployment-branch-policies`, body: { name: branch, type: 'branch' } });
      }
    }
    for (const branch of branches) {
      if (!environment.deploymentBranches.includes(branch.name)) {
        changes.push({ what: `environment ${name} stops deploying from ${branch.name}`, actual: names,
          wanted: environment.deploymentBranches, method: 'DELETE', path: `${path}/deployment-branch-policies/${branch.id}` });
      }
    }
  }
  changes.push(...await rulesetChanges(declaration, api));
  return changes;
}

/** Apply the planned changes in order, then plan again: the second plan must be empty. */
export async function apply(declaration, api, log = () => {}) {
  const changes = await plan(declaration, api);
  for (const change of changes) {
    log(`[github] ${change.what}: ${JSON.stringify(change.actual)} -> ${JSON.stringify(change.wanted)}`);
    await expectOk(api, change.method, change.path, change.body);
  }
  const remaining = await plan(declaration, api);
  if (remaining.length) {
    throw new Error(`settings still differ after applying: ${remaining.map((change) => change.what).join(', ')}`);
  }
  return changes;
}

async function main() {
  const mode = process.argv[2];
  if (mode !== 'apply' && mode !== 'check') throw new Error('usage: github-repository.mjs apply|check');
  const declaration = JSON.parse(await readFile(new URL('../.github/repository.json', import.meta.url), 'utf8'));
  const log = (line) => process.stdout.write(`${line}\n`);
  if (mode === 'apply') {
    const changes = await apply(declaration, ghApi, log);
    log(`[github] ${declaration.repository}: ${changes.length} change(s) applied; settings match .github/repository.json`);
    return;
  }
  const changes = await plan(declaration, ghApi);
  for (const change of changes) {
    log(`[github] differs: ${change.what}: ${JSON.stringify(change.actual)}, declared ${JSON.stringify(change.wanted)}`);
  }
  if (changes.length) process.exit(1);
  log(`[github] ${declaration.repository}: settings match .github/repository.json`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
  });
}

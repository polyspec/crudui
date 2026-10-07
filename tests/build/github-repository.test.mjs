import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

import { parse } from 'yaml';

import { apply, plan } from '../../scripts/github-repository.mjs';

const declaration = JSON.parse(await readFile(new URL('../../.github/repository.json', import.meta.url), 'utf8'));
const repo = `repos/${declaration.repository}`;

/** A live ruleset of GitHub: the declared one with the fields that GitHub adds. */
function liveRuleset(ruleset, id = 7) {
  return { ...structuredClone(ruleset), id, source: declaration.repository, source_type: 'Repository', _links: {}, created_at: '2026-10-06T00:00:00Z', updated_at: '2026-10-06T00:00:00Z', current_user_can_bypass: 'never' };
}

/** An in-memory repository that answers the requests the script makes. */
function fakeGitHub({ fresh }) {
  const state = fresh
    ? {
      settings: { ...declaration.settings, homepage: null, has_wiki: false },
      actions: { enabled: true, allowed_actions: 'selected' },
      workflow: { default_workflow_permissions: 'write', can_approve_pull_request_reviews: false },
      alerts: false, fixes: true, pages: null, environments: {}, rulesets: [],
    }
    : {
      settings: { ...declaration.settings, stargazers_count: 0 },
      actions: { ...declaration.actions },
      workflow: { ...declaration.workflowPermissions },
      alerts: declaration.vulnerabilityAlerts, fixes: declaration.automatedSecurityFixes,
      pages: { ...declaration.pages },
      environments: { 'github-pages': { policy: { protected_branches: false, custom_branch_policies: true }, branches: [{ id: 1, name: 'main' }] } },
      rulesets: [liveRuleset(declaration.ruleset)],
    };
  const writes = [];
  let nextId = 10;
  const api = async (method, path, body) => {
    if (method !== 'GET') writes.push(`${method} ${path}`);
    const environment = path.match(/environments\/([^/]+)(\/.*)?$/);
    if (path === repo) {
      if (method === 'PATCH') Object.assign(state.settings, body);
      return { status: 200, body: state.settings };
    }
    if (path === `${repo}/actions/permissions`) {
      if (method === 'PUT') state.actions = { ...body };
      return { status: method === 'PUT' ? 204 : 200, body: state.actions };
    }
    if (path === `${repo}/actions/permissions/workflow`) {
      if (method === 'PUT') state.workflow = { ...body };
      return { status: method === 'PUT' ? 204 : 200, body: state.workflow };
    }
    if (path === `${repo}/vulnerability-alerts`) {
      if (method !== 'GET') state.alerts = method === 'PUT';
      return { status: method === 'GET' && !state.alerts ? 404 : 204 };
    }
    if (path === `${repo}/automated-security-fixes`) {
      if (method !== 'GET') state.fixes = method === 'PUT';
      return { status: method === 'GET' ? 200 : 204, body: method === 'GET' ? { enabled: state.fixes } : undefined };
    }
    if (path === `${repo}/pages`) {
      if (method === 'GET') return state.pages ? { status: 200, body: state.pages } : { status: 404, body: {} };
      state.pages = { ...body };
      return { status: 201, body: state.pages };
    }
    if (path === `${repo}/rulesets?includes_parents=false&per_page=100`) {
      return { status: 200, body: state.rulesets.map((ruleset) => ({ id: ruleset.id, name: ruleset.name, target: ruleset.target })) };
    }
    if (path === `${repo}/rulesets` && method === 'POST') {
      state.rulesets.push(liveRuleset(body, nextId++));
      return { status: 201, body: state.rulesets.at(-1) };
    }
    if (path.startsWith(`${repo}/rulesets/`)) {
      const id = Number(path.split('/').pop());
      const index = state.rulesets.findIndex((ruleset) => ruleset.id === id);
      if (method === 'PUT') state.rulesets[index] = liveRuleset(body, id);
      return { status: 200, body: state.rulesets[index] };
    }
    if (environment) {
      const [, name, rest] = environment;
      if (!rest) {
        if (method === 'PUT') state.environments[name] = { policy: body.deployment_branch_policy, branches: [] };
        const found = state.environments[name];
        return found ? { status: 200, body: { deployment_branch_policy: found.policy } } : { status: 404, body: {} };
      }
      const found = state.environments[name];
      if (method === 'GET') return { status: 200, body: { branch_policies: found.branches } };
      if (method === 'POST') {
        found.branches.push({ id: nextId++, name: body.name });
        return { status: 200, body: {} };
      }
      const id = Number(rest.split('/').pop());
      found.branches = found.branches.filter((branch) => branch.id !== id);
      return { status: 204 };
    }
    throw new Error(`unexpected request ${method} ${path}`);
  };
  return { api, writes, state };
}

test('a repository that matches the declaration needs no change', async () => {
  const { api, writes } = fakeGitHub({ fresh: false });
  assert.deepEqual(await plan(declaration, api), []);
  assert.deepEqual(await apply(declaration, api), []);
  assert.deepEqual(writes, []);
});

test('a recreated repository is brought to the declaration, and a second apply changes nothing', async () => {
  const { api, writes, state } = fakeGitHub({ fresh: true });
  const changes = await apply(declaration, api);
  assert.deepEqual(changes.map((change) => change.what), [
    'repository settings', 'Actions permissions', 'workflow permissions', 'vulnerability alerts',
    'automated security fixes', 'Pages build type', 'environment github-pages',
    'environment github-pages deploys from main', 'ruleset main',
  ]);
  assert.deepEqual(writes.filter((write) => write.includes('rulesets')), [`POST ${repo}/rulesets`]);
  assert.equal(state.settings.homepage, declaration.settings.homepage);
  assert.deepEqual(state.environments['github-pages'].branches.map((branch) => branch.name), ['main']);
  const count = writes.length;
  assert.deepEqual(await apply(declaration, api), []);
  assert.equal(writes.length, count);
});

test('an environment branch that is not declared is removed', async () => {
  const { api, state } = fakeGitHub({ fresh: false });
  state.environments['github-pages'].branches.push({ id: 7, name: 'temp' });
  const changes = await plan(declaration, api);
  assert.deepEqual(changes.map((change) => `${change.method} ${change.path}`),
    [`DELETE ${repo}/environments/github-pages/deployment-branch-policies/7`]);
  await apply(declaration, api);
  assert.deepEqual(state.environments['github-pages'].branches.map((branch) => branch.name), ['main']);
});

test('the ruleset main requires a pull request, the merge queue and the checks push-gate and ci-passed', async () => {
  const { ruleset } = declaration;
  assert.equal(ruleset.enforcement, 'active');
  assert.deepEqual(ruleset.bypass_actors, []);
  assert.deepEqual(ruleset.conditions.ref_name.include, ['refs/heads/main']);
  const rules = Object.fromEntries(ruleset.rules.map((rule) => [rule.type, rule.parameters ?? null]));
  assert.deepEqual(Object.keys(rules).sort(), ['deletion', 'merge_queue', 'non_fast_forward', 'pull_request', 'required_linear_history', 'required_status_checks']);
  assert.equal(rules.pull_request.required_approving_review_count, 0);
  // gh pr merge --auto on a branch with a merge queue asks for a method of the rule; the queue merges with REBASE.
  assert.deepEqual([...rules.pull_request.allowed_merge_methods].sort(), ['merge', 'rebase', 'squash']);
  assert.equal(rules.merge_queue.merge_method, 'REBASE');
  assert.equal(rules.merge_queue.check_response_timeout_minutes, 360);
  for (const key of ['allow_rebase_merge', 'allow_auto_merge', 'delete_branch_on_merge']) assert.equal(declaration.settings[key], true, key);

  // The ruleset requires exactly the push check and the completion job ci-passed of the CI workflow, which needs every
  // other CI job (tests/build/ci-local.test.mjs); the check run of a job carries its name, or its id without one.
  const required = ['push-gate', 'ci-passed'];
  // 15368 is the GitHub Actions app, so a check of the same name from another app does not satisfy the rule.
  assert.deepEqual(rules.required_status_checks.required_status_checks, required.map((context) => ({ context, integration_id: 15368 })));
  const checks = [];
  for (const file of ['push-gate.yml', 'ci.yml']) {
    const workflow = parse(await readFile(new URL(`../../.github/workflows/${file}`, import.meta.url), 'utf8'));
    for (const [id, job] of Object.entries(workflow.jobs)) checks.push({ file, id, name: job.name ?? id });
  }
  for (const [index, file] of ['push-gate.yml', 'ci.yml'].entries()) {
    assert.deepEqual(checks.filter(({ name }) => name === required[index]).map(({ file: found, id }) => `${found} ${id}`), [`${file} ${required[index]}`]);
  }
  assert.equal(rules.required_status_checks.strict_required_status_checks_policy, false);
});

test('the order of rules, checks and merge methods and the fields that GitHub adds are not differences', async () => {
  const { api, state, writes } = fakeGitHub({ fresh: false });
  const live = state.rulesets[0];
  live.rules.reverse();
  for (const rule of live.rules) {
    if (rule.parameters?.required_status_checks) rule.parameters.required_status_checks.reverse();
    if (rule.parameters?.allowed_merge_methods) rule.parameters.allowed_merge_methods.reverse();
  }
  assert.deepEqual(await plan(declaration, api), []);
  assert.deepEqual(writes, []);
});

test('a bypass actor or a missing check differs, and apply replaces only the ruleset of the name', async () => {
  const { api, state, writes } = fakeGitHub({ fresh: false });
  state.rulesets.unshift(liveRuleset({ ...declaration.ruleset, name: 'tags', target: 'tag' }, 8));
  const live = state.rulesets[1];
  live.bypass_actors = [{ actor_id: 5, actor_type: 'RepositoryRole', bypass_mode: 'always' }];
  live.rules.find((rule) => rule.type === 'required_status_checks').parameters.required_status_checks.pop();
  const changes = await plan(declaration, api);
  assert.deepEqual(changes.map((change) => `${change.what}: ${change.method} ${change.path}`), [`ruleset main (bypass_actors, rules): PUT ${repo}/rulesets/7`]);
  await apply(declaration, api);
  assert.deepEqual(writes, [`PUT ${repo}/rulesets/7`]);
  assert.equal(state.rulesets[0].name, 'tags');
  assert.deepEqual(await plan(declaration, api), []);
});

test('two rulesets of the name fail with both ids', async () => {
  const { api, state } = fakeGitHub({ fresh: false });
  state.rulesets.push(liveRuleset(declaration.ruleset, 9));
  await assert.rejects(plan(declaration, api), new RegExp(`${declaration.repository} has 2 rulesets named main \\(ids 7, 9\\); delete all but one`));
});

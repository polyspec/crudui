import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

import { apply, plan } from '../../scripts/github-repository.mjs';

const declaration = JSON.parse(await readFile(new URL('../../.github/repository.json', import.meta.url), 'utf8'));
const repo = `repos/${declaration.repository}`;

/** An in-memory repository that answers the requests the script makes. */
function fakeGitHub({ fresh }) {
  const state = fresh
    ? {
      settings: { ...declaration.settings, homepage: null, has_wiki: false },
      actions: { enabled: true, allowed_actions: 'selected' },
      workflow: { default_workflow_permissions: 'write', can_approve_pull_request_reviews: false },
      alerts: false, fixes: true, pages: null, environments: {},
    }
    : {
      settings: { ...declaration.settings, stargazers_count: 0 },
      actions: { ...declaration.actions },
      workflow: { ...declaration.workflowPermissions },
      alerts: declaration.vulnerabilityAlerts, fixes: declaration.automatedSecurityFixes,
      pages: { ...declaration.pages },
      environments: { 'github-pages': { policy: { protected_branches: false, custom_branch_policies: true }, branches: [{ id: 1, name: 'main' }] } },
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
    'environment github-pages deploys from main',
  ]);
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

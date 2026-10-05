// ESLint rules for node:test files (docs/operations/testing.md, "Test runner").
//
// no-await-after-test-registration: node --test runs with --test-force-exit, which ends a file's
// process when its known tests end. A top-level `await` after the first registration lets the
// registered tests end while the module waits, so the tests registered after the wait may never
// run; the runner then fails the file. Every test is registered before the module's first wait.

const registrations = new Set(['test', 'describe', 'it', 'suite']);

/** Whether a node, outside nested functions, contains a node that `match` accepts. */
function contains(node, visitorKeys, match) {
  if (!node || typeof node.type !== 'string') return false;
  if (match(node)) return true;
  if (/Function/.test(node.type)) return false;
  for (const key of visitorKeys[node.type] ?? []) {
    const value = node[key];
    const children = Array.isArray(value) ? value : [value];
    if (children.some(child => contains(child, visitorKeys, match))) return true;
  }
  return false;
}

const noAwaitAfterTestRegistration = {
  meta: {
    type: 'problem',
    docs: { description: 'Register every node:test test before the first top-level await of the module' },
    schema: [],
    messages: {
      late: 'A top-level await after the first node:test registration (line {{line}}) lets --test-force-exit end the process before the tests registered after it run; load the data before the first test.',
    },
  },
  create(context) {
    return {
      Program(program) {
        const names = new Set();
        const objects = new Set();
        for (const statement of program.body) {
          if (statement.type !== 'ImportDeclaration' || !['node:test', 'test'].includes(statement.source.value)) continue;
          for (const specifier of statement.specifiers) {
            if (specifier.type === 'ImportSpecifier' && registrations.has(specifier.imported.name)) names.add(specifier.local.name);
            else objects.add(specifier.local.name);
          }
        }
        if (names.size === 0 && objects.size === 0) return;
        const { visitorKeys } = context.sourceCode;
        const isRegistration = node => {
          if (node.type !== 'CallExpression') return false;
          const { callee } = node;
          if (callee.type === 'Identifier') return names.has(callee.name) || objects.has(callee.name);
          return callee.type === 'MemberExpression' && callee.object.type === 'Identifier' && objects.has(callee.object.name)
            && callee.property.type === 'Identifier' && registrations.has(callee.property.name);
        };
        const isWait = node => node.type === 'AwaitExpression' || (node.type === 'ForOfStatement' && node.await);
        let first;
        for (const statement of program.body) {
          if (first) {
            if (contains(statement, visitorKeys, isWait)) context.report({ node: statement, messageId: 'late', data: { line: first.loc.start.line } });
          } else if (contains(statement, visitorKeys, isRegistration)) first = statement;
        }
      },
    };
  },
};

export default { rules: { 'no-await-after-test-registration': noAwaitAfterTestRegistration } };

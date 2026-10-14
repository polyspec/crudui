import { existsSync, statSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import assert from 'node:assert/strict';
import type { MarkdownIt } from 'markdown-it';

/** Resolve repository files outside the documentation web to their source URLs. */
export function repositoryLink(href: string, sourceFile: string, repositoryRoot: string): string {
  if (!href.startsWith('.')) return href;
  const [pathname] = href.split(/[?#]/, 1);
  assert.ok(pathname !== undefined);
  const target = resolve(dirname(sourceFile), decodeURIComponent(pathname));
  const docsRelative = relative(resolve(repositoryRoot, 'docs'), target);
  if (docsRelative !== '..' && !docsRelative.startsWith(`..${sep}`)) return href;
  const repositoryRelative = relative(repositoryRoot, target);
  if (repositoryRelative === '..' || repositoryRelative.startsWith(`..${sep}`) || !existsSync(target)) {
    throw new Error(`Invalid repository link in ${sourceFile}: ${href}`);
  }
  const operation = statSync(target).isDirectory() ? 'tree' : 'blob';
  const path = repositoryRelative.split(sep).map(encodeURIComponent).join('/');
  return `https://github.com/polyspec/crudui/${operation}/main/${path}${href.slice(pathname.length)}`;
}

/** Apply repository source links before the docs build checks local links. */
export function configureRepositoryLinks(markdown: MarkdownIt, repositoryRoot: string): void {
  const renderLink = markdown.renderer.rules.link_open;
  markdown.renderer.rules.link_open = (tokens, index, options, environment, renderer) => {
    const token = tokens[index];
    assert.ok(token);
    const href = token.attrGet('href');
    if (href) {
      const sourceFile = environment?.path;
      assert.ok(typeof href === 'string' && typeof sourceFile === 'string');
      token.attrSet('href', repositoryLink(href, sourceFile, repositoryRoot));
    }
    assert.ok(renderLink);
    return renderLink(tokens, index, options, environment, renderer);
  };
}

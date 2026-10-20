import { existsSync, statSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import assert from 'node:assert/strict';
import type { Env, MarkdownIt, RendererRule } from 'markdown-it';

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

/** Wrap a renderer rule of markdown-it so that an attribute of its token is replaced by `rewrite`. */
export function rewriteAttribute(
  markdown: MarkdownIt, rule: 'link_open' | 'image', attribute: 'href' | 'src',
  rewrite: (value: string, environment: Env | undefined) => string,
): void {
  const render: RendererRule = markdown.renderer.rules[rule]
    ?? ((tokens, index, options, environment, renderer) => renderer.renderToken(tokens, index, options));
  markdown.renderer.rules[rule] = (tokens, index, options, environment, renderer) => {
    const token = tokens[index];
    assert.ok(token);
    const value = token.attrGet(attribute);
    if (value) {
      assert.ok(typeof value === 'string');
      token.attrSet(attribute, rewrite(value, environment));
    }
    return render(tokens, index, options, environment, renderer);
  };
}

/** Apply repository source links before the docs build checks local links. */
export function configureRepositoryLinks(markdown: MarkdownIt, repositoryRoot: string): void {
  rewriteAttribute(markdown, 'link_open', 'href', (href, environment) => {
    const sourceFile = environment?.path;
    assert.ok(typeof sourceFile === 'string');
    return repositoryLink(href, sourceFile, repositoryRoot);
  });
}

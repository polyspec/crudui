import { existsSync, statSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';

/** Resolve repository files outside the documentation site to their source URLs. */
export function repositoryLink(href, sourceFile, repositoryRoot) {
  if (!href.startsWith('.')) return href;
  const pathname = href.split(/[?#]/, 1)[0];
  const target = resolve(dirname(sourceFile), decodeURIComponent(pathname));
  const siteRelative = relative(resolve(repositoryRoot, 'docs'), target);
  if (siteRelative !== '..' && !siteRelative.startsWith(`..${sep}`)) return href;
  const repositoryRelative = relative(repositoryRoot, target);
  if (repositoryRelative === '..' || repositoryRelative.startsWith(`..${sep}`) || !existsSync(target)) {
    throw new Error(`Invalid repository link in ${sourceFile}: ${href}`);
  }
  const operation = statSync(target).isDirectory() ? 'tree' : 'blob';
  const path = repositoryRelative.split(sep).map(encodeURIComponent).join('/');
  return `https://github.com/crudui/crudui/${operation}/main/${path}${href.slice(pathname.length)}`;
}

/** Apply repository source links before VitePress checks site links. */
export function configureRepositoryLinks(markdown, repositoryRoot) {
  const renderLink = markdown.renderer.rules.link_open;
  markdown.renderer.rules.link_open = (tokens, index, options, environment, renderer) => {
    const token = tokens[index];
    const href = token.attrGet('href');
    if (href) token.attrSet('href', repositoryLink(href, environment.path, repositoryRoot));
    return renderLink(tokens, index, options, environment, renderer);
  };
}

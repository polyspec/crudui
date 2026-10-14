import assert from 'node:assert/strict';
import { copyFile, mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import MarkdownIt from 'markdown-it';
import type { Env, MarkdownIt as MarkdownItInstance, RendererRule, Token } from 'markdown-it';

import { repositoryLink } from '../documentation-links.mts';
import { documentationBasePath, documentationUrl } from './paths.mts';

const SOURCE_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const DOCS_CSS = join(SOURCE_DIRECTORY, 'docs.css');
const EXTERNAL_SCHEME = /^[A-Za-z][A-Za-z\d+.-]*:/;
const HEADING_COMBINING = /[\u0300-\u036F]/g;
// eslint-disable-next-line no-control-regex -- heading slugs drop the C0 control characters this class names.
const HEADING_CONTROL = /[\u0000-\u001F]/g;
const HEADING_SPECIAL = /[\s~\x60!@#$%^&*()\-_+=[\]{}|\\;:"'“”‘’<>,.?/]+/g;

interface Heading {
  level: number;
  text: string;
  id: string;
}

interface Page {
  sourceFile: string;
  docsDirectory: string;
  source: string;
  route: string;
  output: string;
  tokens: Token[];
  headings: Heading[];
  title: string;
  headingIds: Set<string>;
}

interface LinkContext {
  repositoryRoot: string;
  docsDirectory: string;
  publicDirectory: string;
  publicFiles: Map<string, string>;
  pagesBySource: Map<string, Page>;
  pagesByRoute: Map<string, Page>;
  basePath: string;
}

// The environment that buildDocumentationWeb passes to the renderer for each page.
type RenderEnvironment = { page: Page, context: LinkContext };
// markdown-it passes its environment to every rule; the page and the links of buildDocumentationWeb are its members here.
declare module 'markdown-it' {
  interface Env {
    page?: Page;
    context?: LinkContext;
  }
}
// The environment of a parse: the heading rule records the headings of the document in it.
type ParseEnvironment = { headings?: Heading[] };

export interface DocumentationWebOptions {
  repositoryRoot: string;
  docsDirectory: string;
  outputDirectory: string;
  /** Checked by documentationBasePath, which rejects every value that is no base path. */
  basePath?: unknown;
}

export interface DocumentationWebReport {
  pages: number;
  documents: number;
  assets: number;
}

function renderEnvironment(environment: Env | undefined): RenderEnvironment {
  const page = environment?.page;
  const context = environment?.context;
  assert.ok(page && context, 'the renderer environment holds the page and its link context');
  return { page, context };
}

function posix(path: string): string {
  return path.split(sep).join('/');
}

function within(directory: string, filename: string): boolean {
  const path = relative(directory, filename);
  return path === '' || (!isAbsolute(path) && path !== '..' && !path.startsWith(`..${sep}`));
}

function escapeHtml(value: string): string {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function headingText(inline: Token): string {
  return (inline.children ?? []).map(token => {
    if (['text', 'code_inline'].includes(token.type)) return token.content;
    if (token.type === 'html_inline') return token.content.replace(/<[^>]*>/g, '');
    if (token.type === 'image') return token.content;
    if (['softbreak', 'hardbreak'].includes(token.type)) return ' ';
    return '';
  }).join('').replace(/\s+/g, ' ').trim();
}

function headingSlug(text: string, used: Set<string>): string {
  const base = text.normalize('NFKD')
    .replace(HEADING_COMBINING, '')
    .replace(HEADING_CONTROL, '')
    .replace(HEADING_SPECIAL, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .normalize('NFC')
    .toLowerCase();
  let slug = base;
  for (let index = 1; used.has(slug); index += 1) slug = base + '-' + index;
  used.add(slug);
  return slug;
}

function sourceRoute(sourceFile: string, docsDirectory: string): string {
  const markdownPath = posix(relative(docsDirectory, sourceFile));
  const withoutExtension = markdownPath.slice(0, -extname(markdownPath).length);
  if (withoutExtension === 'index') return '/';
  if (withoutExtension.endsWith('/index')) return `/${withoutExtension.slice(0, -'/index'.length)}/`;
  return `/${withoutExtension}`;
}

function outputPath(sourceFile: string, docsDirectory: string): string {
  return posix(relative(docsDirectory, sourceFile)).replace(/\.md$/, '.html');
}

function pageUrl(page: Page, basePath: string): string {
  return documentationUrl(page.output.replace(/(^|\/)index\.html$/, '$1'), basePath);
}

function splitHref(href: string): { pathname: string, query: string, fragment: string } {
  const hashAt = href.indexOf('#');
  const beforeHash = hashAt === -1 ? href : href.slice(0, hashAt);
  const fragment = hashAt === -1 ? '' : href.slice(hashAt + 1);
  const queryAt = beforeHash.indexOf('?');
  return {
    pathname: queryAt === -1 ? beforeHash : beforeHash.slice(0, queryAt),
    query: queryAt === -1 ? '' : beforeHash.slice(queryAt),
    fragment,
  };
}

function suffix(query: string, fragment: string): string {
  return `${query}${fragment ? `#${fragment}` : ''}`;
}

function pageForRoute(route: string, pagesByRoute: Map<string, Page>): Page | undefined {
  const decoded = decodeURIComponent(route);
  const candidates = new Set([decoded]);
  if (decoded !== '/' && decoded.endsWith('/')) candidates.add(decoded.slice(0, -1));
  if (decoded !== '/' && !decoded.endsWith('/')) candidates.add(`${decoded}/`);
  if (decoded.endsWith('.html')) candidates.add(decoded.slice(0, -'.html'.length));
  for (const candidate of candidates) {
    const page = pagesByRoute.get(candidate);
    if (page) return page;
  }
  return undefined;
}

function validateFragment(page: Page, encodedFragment: string, sourceFile: string): void {
  if (!encodedFragment) return;
  const fragment = decodeURIComponent(encodedFragment);
  if (!page.headingIds.has(fragment)) {
    throw new Error(`Missing documentation fragment in ${sourceFile}: ${page.route}#${encodedFragment}`);
  }
}

function resolveDocsLink(href: string, page: Page, context: LinkContext): string {
  if (!href || EXTERNAL_SCHEME.test(href) || href.startsWith('//')) return href;
  const { pathname, query, fragment } = splitHref(href);
  if (!pathname) {
    validateFragment(page, fragment, page.sourceFile);
    return suffix(query, fragment);
  }

  if (pathname.startsWith('/')) {
    const targetPage = pageForRoute(pathname, context.pagesByRoute);
    if (targetPage) {
      validateFragment(targetPage, fragment, page.sourceFile);
      return `${pageUrl(targetPage, context.basePath)}${suffix(query, fragment)}`;
    }
    const staticPath = decodeURIComponent(pathname).replace(/^\/+/, '');
    if (!context.publicFiles.has(staticPath) && staticPath !== 'assets/docs.css') {
      throw new Error(`Missing documentation target in ${page.sourceFile}: ${href}`);
    }
    return documentationUrl(pathname, context.basePath) + suffix(query, fragment);
  }

  const decodedPath = decodeURIComponent(pathname);
  const target = resolve(dirname(page.sourceFile), decodedPath);
  if (!within(context.docsDirectory, target)) {
    return repositoryLink(href, page.sourceFile, context.repositoryRoot);
  }

  if (within(context.publicDirectory, target)) {
    const staticPath = posix(relative(context.publicDirectory, target));
    if (!context.publicFiles.has(staticPath)) {
      throw new Error(`Missing documentation target in ${page.sourceFile}: ${href}`);
    }
    return documentationUrl(staticPath, context.basePath) + suffix(query, fragment);
  }

  let targetPage = context.pagesBySource.get(target);
  if (!targetPage && existsSync(target)) targetPage = context.pagesBySource.get(join(target, 'index.md'));
  if (!targetPage && !extname(target)) targetPage = context.pagesBySource.get(`${target}.md`);
  if (!targetPage) {
    throw new Error(`Missing documentation target in ${page.sourceFile}: ${href}`);
  }
  validateFragment(targetPage, fragment, page.sourceFile);
  return `${pageUrl(targetPage, context.basePath)}${suffix(query, fragment)}`;
}

function markdownRenderer(): MarkdownItInstance {
  const markdown = new MarkdownIt({ html: true, linkify: true, typographer: false });
  markdown.core.ruler.push('crudui-heading-ids', state => {
    const used = new Set<string>();
    const headings: Heading[] = [];
    state.env.headings = headings;
    for (let index = 0; index < state.tokens.length; index += 1) {
      const opening = state.tokens[index];
      assert.ok(opening);
      if (opening.type !== 'heading_open') continue;
      const inline = state.tokens[index + 1];
      assert.ok(inline);
      const text = headingText(inline);
      const level = Number(opening.tag.slice(1));
      const id = headingSlug(text, used);
      opening.attrSet('id', id);
      headings.push({ level, text, id });
    }
  });
  const renderLink: RendererRule = markdown.renderer.rules.link_open
    ?? ((tokens, index, options, environment, renderer) => renderer.renderToken(tokens, index, options));
  markdown.renderer.rules.link_open = (tokens, index, options, environment, renderer) => {
    const token = tokens[index];
    assert.ok(token);
    const href = token.attrGet('href');
    if (href) {
      assert.ok(typeof href === 'string');
      const { page, context } = renderEnvironment(environment);
      token.attrSet('href', resolveDocsLink(href, page, context));
    }
    return renderLink(tokens, index, options, environment, renderer);
  };
  const renderImage: RendererRule = markdown.renderer.rules.image
    ?? ((tokens, index, options, environment, renderer) => renderer.renderToken(tokens, index, options));
  markdown.renderer.rules.image = (tokens, index, options, environment, renderer) => {
    const token = tokens[index];
    assert.ok(token);
    const source = token.attrGet('src');
    if (source) {
      assert.ok(typeof source === 'string');
      const { page, context } = renderEnvironment(environment);
      token.attrSet('src', resolveDocsLink(source, page, context));
    }
    return renderImage(tokens, index, options, environment, renderer);
  };
  return markdown;
}

async function walk(
  directory: string, predicate: (filename: string) => boolean = () => true,
): Promise<string[]> {
  if (!existsSync(directory)) return [];
  const result: string[] = [];
  async function visit(current: string): Promise<void> {
    for (const entry of (await readdir(current, { withFileTypes: true })).sort((a, b) =>
      a.name < b.name ? -1 : a.name > b.name ? 1 : 0)) {
      const filename = join(current, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`Documentation input cannot be a symbolic link: ${filename}`);
      if (entry.isDirectory()) await visit(filename);
      else if (entry.isFile() && predicate(filename)) result.push(filename);
    }
  }
  await visit(directory);
  return result;
}

function navigation(pages: Page[], current: Page, basePath: string): string {
  const korean = current.sourceFile.endsWith('.ko.md');
  const visiblePages = pages.filter(page => {
    const path = posix(relative(page.docsDirectory, page.sourceFile));
    if (path === 'README.md' || path === 'README.ko.md') return false;
    if (path.startsWith('api/')) return true;
    return page.sourceFile.endsWith(korean ? '.ko.md' : '.md');
  });
  const groups = new Map<string, Page[]>();
  for (const page of visiblePages) {
    const path = posix(relative(page.docsDirectory, page.sourceFile));
    const [first] = path.split('/');
    assert.ok(first !== undefined);
    const top = path.includes('/') ? first : 'Documentation';
    const label = top === 'api' ? 'API reference'
      : top === 'operations' ? 'Operations'
        : top === 'spec' ? 'Specification' : top;
    let group = groups.get(label);
    if (!group) {
      group = [];
      groups.set(label, group);
    }
    group.push(page);
  }
  return [...groups.entries()].map(([label, entries]) => {
    const links = entries.map(page => {
      const active = page.route === current.route ? ' aria-current="page"' : '';
      return `<li><a href="${escapeHtml(pageUrl(page, basePath))}"${active}>${escapeHtml(page.title)}</a></li>`;
    }).join('');
    const open = label !== 'API reference' || current.route.startsWith('/api/') ? ' open' : '';
    return `<details${open}><summary>${escapeHtml(label)}</summary><ul>${links}</ul></details>`;
  }).join('');
}

function outline(page: Page): string {
  const entries = page.headings.filter(heading => heading.level > 1 && heading.level < 4);
  if (!entries.length) return '';
  return `<nav class="outline" aria-label="Page headings"><strong>On this page</strong><ul>${entries.map(heading =>
    `<li class="level-${heading.level}"><a href="#${escapeHtml(heading.id)}">${escapeHtml(heading.text)}</a></li>`).join('')}</ul></nav>`;
}

function documentHtml(page: Page, body: string, pages: Page[], basePath: string): string {
  const language = page.sourceFile.endsWith('.ko.md') ? 'ko-KR' : 'en-US';
  const description = language === 'ko-KR'
    ? 'YAML 폼 명세, 다중 언어 검증과 React, Vue, Svelte 렌더링'
    : 'YAML form specifications, multi-language validation and React, Vue and Svelte rendering';
  return `<!doctype html>
<html lang="${language}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="${escapeHtml(description)}">
  <title>${escapeHtml(page.title)} | CRUDUI</title>
  <link rel="stylesheet" href="${basePath}assets/docs.css">
</head>
<body>
  <a class="skip-link" href="#main">Skip to content</a>
  <header class="docs-header">
    <a class="brand" href="${basePath}">CRUDUI</a>
    <nav aria-label="Primary"><a href="${basePath}README.html">Guide</a><a href="${basePath}README.ko.html">한국어</a><a href="${basePath}spec/schema.html">Specification</a><a href="${basePath}spec/validation-rules.html">Validation</a><a href="${basePath}api/">API</a><a href="https://github.com/polyspec/crudui">GitHub</a></nav>
  </header>
  <div class="docs-layout">
    <aside class="sidebar" aria-label="Documentation">${navigation(pages, page, basePath)}</aside>
    <main id="main"><article>${body}</article></main>
    ${outline(page)}
  </div>
  <footer>CRUDUI documentation</footer>
</body>
</html>
`;
}

function notFoundHtml(basePath: string): string {
  return `<!doctype html>
<html lang="en-US">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>404 | CRUDUI</title><link rel="stylesheet" href="${basePath}assets/docs.css"></head>
<body><main class="not-found"><p class="error-code">404</p><p>Page not found</p><p><a href="${basePath}">Open the documentation index</a></p></main></body>
</html>
`;
}

async function writeOutput(filename: string, content: string | NodeJS.ArrayBufferView): Promise<void> {
  await mkdir(dirname(filename), { recursive: true });
  await writeFile(filename, content);
}

// The first line of every page that API Documenter writes; such a page has level-two headings only.
const API_DOCUMENTER_MARKER = '<!-- Do not edit this file. It is automatically generated by API Documenter. -->';

/**
 * The title heading of a page: the first heading of a page of API Documenter, taken as the tool writes it, and the one
 * level-one heading of a written page, which fails when it has none or more than one.
 */
function pageTitle(source: string, headings: NonNullable<ParseEnvironment['headings']>, sourceFile: string): { text: string; id: string } {
  const generated = source.startsWith(API_DOCUMENTER_MARKER);
  const titles = generated ? headings.slice(0, 1) : headings.filter(heading => heading.level === 1);
  const [title] = titles;
  if (titles.length !== 1 || !title || !title.text || !title.id) {
    throw new Error(generated ? `An API Documenter page has no heading: ${sourceFile}` : `Documentation requires exactly one level-one heading: ${sourceFile}`);
  }
  return { text: title.text, id: title.id };
}

export async function buildDocumentationWeb(
  { repositoryRoot, docsDirectory, outputDirectory, basePath: baseInput }: DocumentationWebOptions,
): Promise<DocumentationWebReport> {
  const basePath = documentationBasePath(baseInput);
  const root = resolve(repositoryRoot);
  const docs = resolve(docsDirectory);
  const output = resolve(outputDirectory);
  if (!within(root, docs)) throw new Error('Documentation input must be inside the repository');
  if (!within(root, output)) throw new Error('Documentation output must be inside the repository');
  if (within(output, docs)) throw new Error('Documentation output cannot contain the documentation input');
  const publicDirectory = join(docs, 'public');
  const sourceFiles = (await walk(docs, filename => filename.endsWith('.md')))
    .filter(filename => !within(join(docs, '.web'), filename)
      && !within(join(docs, '.site'), filename)
      && !within(publicDirectory, filename));
  const publicInputs = await walk(publicDirectory);
  const publicFiles = new Map(publicInputs.map(filename => [posix(relative(publicDirectory, filename)), filename]));
  const renderer = markdownRenderer();
  const pages: Page[] = [];
  const pagesBySource = new Map<string, Page>();
  const pagesByRoute = new Map<string, Page>();
  const outputs = new Set(['404.html', 'assets/docs.css']);

  for (const sourceFile of sourceFiles) {
    const source = await readFile(sourceFile, 'utf8');
    const route = sourceRoute(sourceFile, docs);
    const output = outputPath(sourceFile, docs);
    if (outputs.has(output)) throw new Error(`Duplicate documentation output: ${output}`);
    if (pagesByRoute.has(route)) throw new Error(`Duplicate documentation route: ${route}`);
    outputs.add(output);
    const environment: ParseEnvironment = {};
    const tokens = renderer.parse(source, environment);
    const { headings } = environment;
    assert.ok(headings);
    const title = pageTitle(source, headings, sourceFile);
    const page: Page = {
      sourceFile,
      docsDirectory: docs,
      source,
      route,
      output,
      tokens,
      headings,
      title: title.text,
      headingIds: new Set(headings.map(heading => heading.id)),
    };
    pages.push(page);
    pagesBySource.set(sourceFile, page);
    pagesByRoute.set(page.route, page);
    if (page.route !== '/' && page.route.endsWith('/')) pagesByRoute.set(page.route.slice(0, -1), page);
  }

  for (const staticPath of publicFiles.keys()) {
    if (outputs.has(staticPath)) throw new Error(`Duplicate documentation output: ${staticPath}`);
    outputs.add(staticPath);
  }

  const context: LinkContext = { repositoryRoot: root, docsDirectory: docs, publicDirectory, publicFiles, pagesBySource, pagesByRoute, basePath };
  const parent = dirname(output);
  await mkdir(parent, { recursive: true });
  const temporary = await mkdtemp(join(parent, '.web-build-'));
  const previous = output + '.previous';
  try {
    for (const page of pages) {
      const environment: RenderEnvironment = { page, context };
      const body = renderer.renderer.render(page.tokens, renderer.options, environment);
      await writeOutput(join(temporary, page.output), documentHtml(page, body, pages, basePath));
    }
    await writeOutput(join(temporary, '404.html'), notFoundHtml(basePath));
    await writeOutput(join(temporary, 'assets/docs.css'), await readFile(DOCS_CSS));
    for (const [staticPath, sourceFile] of publicFiles) {
      const destination = join(temporary, staticPath);
      await mkdir(dirname(destination), { recursive: true });
      await copyFile(sourceFile, destination);
    }
    await rm(previous, { recursive: true, force: true });
    if (existsSync(output)) await rename(output, previous);
    try {
      await rename(temporary, output);
    } catch (error) {
      if (existsSync(previous)) await rename(previous, output);
      throw error;
    }
    await rm(previous, { recursive: true, force: true });
  } catch (error) {
    await rm(temporary, { recursive: true, force: true });
    throw error;
  }
  return { pages: pages.length + 1, documents: pages.length, assets: publicFiles.size + 1 };
}

import { copyFile, mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import MarkdownIt from 'markdown-it';

import { repositoryLink } from '../documentation-links.mjs';
import { documentationBasePath, documentationUrl } from './paths.mjs';

const SOURCE_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const SITE_CSS = join(SOURCE_DIRECTORY, 'site.css');
const EXTERNAL_SCHEME = /^[A-Za-z][A-Za-z\d+.-]*:/;
const HEADING_COMBINING = /[\u0300-\u036F]/g;
const HEADING_CONTROL = /[\u0000-\u001F]/g;
const HEADING_SPECIAL = /[\s~\x60!@#$%^&*()\-_+=[\]{}|\\;:"'“”‘’<>,.?/]+/g;

function posix(path) {
  return path.split(sep).join('/');
}

function within(directory, filename) {
  const path = relative(directory, filename);
  return path === '' || (!isAbsolute(path) && path !== '..' && !path.startsWith(`..${sep}`));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function headingText(inline) {
  return (inline.children ?? []).map(token => {
    if (['text', 'code_inline'].includes(token.type)) return token.content;
    if (token.type === 'html_inline') return token.content.replace(/<[^>]*>/g, '');
    if (token.type === 'image') return token.content;
    if (['softbreak', 'hardbreak'].includes(token.type)) return ' ';
    return '';
  }).join('').replace(/\s+/g, ' ').trim();
}

function headingSlug(text, used) {
  const base = text.normalize('NFKD')
    .replace(HEADING_COMBINING, '')
    .replace(HEADING_CONTROL, '')
    .replace(HEADING_SPECIAL, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/^(\d)/, '_$1')
    .toLowerCase();
  let slug = base;
  for (let index = 1; used.has(slug); index += 1) slug = base + '-' + index;
  used.add(slug);
  return slug;
}

function sourceRoute(sourceFile, docsDirectory) {
  const markdownPath = posix(relative(docsDirectory, sourceFile));
  const withoutExtension = markdownPath.slice(0, -extname(markdownPath).length);
  if (withoutExtension === 'index') return '/';
  if (withoutExtension.endsWith('/index')) return `/${withoutExtension.slice(0, -'/index'.length)}/`;
  return `/${withoutExtension}`;
}

function outputPath(sourceFile, docsDirectory) {
  return posix(relative(docsDirectory, sourceFile)).replace(/\.md$/, '.html');
}

function pageUrl(page, basePath) {
  return documentationUrl(page.output.replace(/(^|\/)index\.html$/, '$1'), basePath);
}

function splitHref(href) {
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

function suffix(query, fragment) {
  return `${query}${fragment ? `#${fragment}` : ''}`;
}

function pageForRoute(route, pagesByRoute) {
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

function validateFragment(page, encodedFragment, sourceFile) {
  if (!encodedFragment) return;
  const fragment = decodeURIComponent(encodedFragment);
  if (!page.headingIds.has(fragment)) {
    throw new Error(`Missing documentation fragment in ${sourceFile}: ${page.route}#${encodedFragment}`);
  }
}

function resolveSiteLink(href, page, site) {
  if (!href || EXTERNAL_SCHEME.test(href) || href.startsWith('//')) return href;
  const { pathname, query, fragment } = splitHref(href);
  if (!pathname) {
    validateFragment(page, fragment, page.sourceFile);
    return suffix(query, fragment);
  }

  if (pathname.startsWith('/')) {
    const targetPage = pageForRoute(pathname, site.pagesByRoute);
    if (targetPage) {
      validateFragment(targetPage, fragment, page.sourceFile);
      return `${pageUrl(targetPage, site.basePath)}${suffix(query, fragment)}`;
    }
    const staticPath = decodeURIComponent(pathname).replace(/^\/+/, '');
    if (!site.publicFiles.has(staticPath) && staticPath !== 'assets/site.css') {
      throw new Error(`Missing documentation target in ${page.sourceFile}: ${href}`);
    }
    return documentationUrl(pathname, site.basePath) + suffix(query, fragment);
  }

  const decodedPath = decodeURIComponent(pathname);
  const target = resolve(dirname(page.sourceFile), decodedPath);
  if (!within(site.docsDirectory, target)) {
    return repositoryLink(href, page.sourceFile, site.repositoryRoot);
  }

  if (within(site.publicDirectory, target)) {
    const staticPath = posix(relative(site.publicDirectory, target));
    if (!site.publicFiles.has(staticPath)) {
      throw new Error(`Missing documentation target in ${page.sourceFile}: ${href}`);
    }
    return documentationUrl(staticPath, site.basePath) + suffix(query, fragment);
  }

  let targetPage = site.pagesBySource.get(target);
  if (!targetPage && existsSync(target)) targetPage = site.pagesBySource.get(join(target, 'index.md'));
  if (!targetPage && !extname(target)) targetPage = site.pagesBySource.get(`${target}.md`);
  if (!targetPage) {
    throw new Error(`Missing documentation target in ${page.sourceFile}: ${href}`);
  }
  validateFragment(targetPage, fragment, page.sourceFile);
  return `${pageUrl(targetPage, site.basePath)}${suffix(query, fragment)}`;
}

function markdownRenderer() {
  const markdown = new MarkdownIt({ html: true, linkify: true, typographer: false });
  markdown.core.ruler.push('crudui-heading-ids', state => {
    const used = new Set();
    state.env.headings = [];
    for (let index = 0; index < state.tokens.length; index += 1) {
      const opening = state.tokens[index];
      if (opening.type !== 'heading_open') continue;
      const inline = state.tokens[index + 1];
      const text = headingText(inline);
      const level = Number(opening.tag.slice(1));
      const id = headingSlug(text, used);
      opening.attrSet('id', id);
      state.env.headings.push({ level, text, id });
    }
  });
  const renderLink = markdown.renderer.rules.link_open
    ?? ((tokens, index, options, environment, renderer) => renderer.renderToken(tokens, index, options));
  markdown.renderer.rules.link_open = (tokens, index, options, environment, renderer) => {
    const href = tokens[index].attrGet('href');
    if (href) tokens[index].attrSet('href', resolveSiteLink(href, environment.page, environment.site));
    return renderLink(tokens, index, options, environment, renderer);
  };
  const renderImage = markdown.renderer.rules.image
    ?? ((tokens, index, options, environment, renderer) => renderer.renderToken(tokens, index, options));
  markdown.renderer.rules.image = (tokens, index, options, environment, renderer) => {
    const source = tokens[index].attrGet('src');
    if (source) tokens[index].attrSet('src', resolveSiteLink(source, environment.page, environment.site));
    return renderImage(tokens, index, options, environment, renderer);
  };
  return markdown;
}

async function walk(directory, predicate = () => true) {
  if (!existsSync(directory)) return [];
  const result = [];
  async function visit(current) {
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

function navigation(pages, current, basePath) {
  const groups = new Map();
  for (const page of pages) {
    const path = posix(relative(page.docsDirectory, page.sourceFile));
    const top = path.includes('/') ? path.split('/')[0] : 'Documentation';
    const label = top === 'api' ? 'API reference'
      : top === 'operations' ? 'Operations'
        : top === 'spec' ? 'Specification' : top;
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label).push(page);
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

function outline(page) {
  const entries = page.headings.filter(heading => heading.level > 1 && heading.level < 4);
  if (!entries.length) return '';
  return `<nav class="outline" aria-label="Page headings"><strong>On this page</strong><ul>${entries.map(heading =>
    `<li class="level-${heading.level}"><a href="#${escapeHtml(heading.id)}">${escapeHtml(heading.text)}</a></li>`).join('')}</ul></nav>`;
}

function documentHtml(page, body, pages, basePath) {
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
  <link rel="stylesheet" href="${basePath}assets/site.css">
</head>
<body>
  <a class="skip-link" href="#main">Skip to content</a>
  <header class="site-header">
    <a class="brand" href="${basePath}">CRUDUI</a>
    <nav aria-label="Primary"><a href="${basePath}README.html">Guide</a><a href="${basePath}README.ko.html">한국어</a><a href="${basePath}spec/schema.html">Specification</a><a href="${basePath}spec/validation-rules.html">Validation</a><a href="${basePath}api/">API</a><a href="https://github.com/polyspec/crudui">GitHub</a></nav>
  </header>
  <div class="site-layout">
    <aside class="sidebar" aria-label="Documentation">${navigation(pages, page, basePath)}</aside>
    <main id="main"><article>${body}</article></main>
    ${outline(page)}
  </div>
  <footer>CRUDUI documentation</footer>
</body>
</html>
`;
}

function notFoundHtml(basePath) {
  return `<!doctype html>
<html lang="en-US">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>404 | CRUDUI</title><link rel="stylesheet" href="${basePath}assets/site.css"></head>
<body><main class="not-found"><p class="error-code">404</p><p>Page not found</p><p><a href="${basePath}">Open the documentation index</a></p></main></body>
</html>
`;
}

async function writeOutput(filename, content) {
  await mkdir(dirname(filename), { recursive: true });
  await writeFile(filename, content);
}

export async function buildDocumentationSite({ repositoryRoot, docsDirectory, outputDirectory, basePath: baseInput }) {
  const basePath = documentationBasePath(baseInput);
  const root = resolve(repositoryRoot);
  const docs = resolve(docsDirectory);
  const output = resolve(outputDirectory);
  if (!within(root, docs)) throw new Error('Documentation input must be inside the repository');
  if (!within(root, output)) throw new Error('Documentation output must be inside the repository');
  if (within(output, docs)) throw new Error('Documentation output cannot contain the documentation input');
  const publicDirectory = join(docs, 'public');
  const sourceFiles = (await walk(docs, filename => filename.endsWith('.md')))
    .filter(filename => !within(join(docs, '.site'), filename) && !within(publicDirectory, filename));
  const publicInputs = await walk(publicDirectory);
  const publicFiles = new Map(publicInputs.map(filename => [posix(relative(publicDirectory, filename)), filename]));
  const renderer = markdownRenderer();
  const pages = [];
  const pagesBySource = new Map();
  const pagesByRoute = new Map();
  const outputs = new Set(['404.html', 'assets/site.css']);

  for (const sourceFile of sourceFiles) {
    const page = {
      sourceFile,
      docsDirectory: docs,
      source: await readFile(sourceFile, 'utf8'),
      route: sourceRoute(sourceFile, docs),
      output: outputPath(sourceFile, docs),
    };
    if (outputs.has(page.output)) throw new Error(`Duplicate documentation output: ${page.output}`);
    if (pagesByRoute.has(page.route)) throw new Error(`Duplicate documentation route: ${page.route}`);
    outputs.add(page.output);
    const environment = {};
    page.tokens = renderer.parse(page.source, environment);
    page.headings = environment.headings;
    const titles = page.headings.filter(heading => heading.level === 1);
    if (titles.length !== 1 || !titles[0].text || !titles[0].id) {
      throw new Error(`Documentation requires exactly one level-one heading: ${sourceFile}`);
    }
    page.title = titles[0].text;
    page.headingIds = new Set(page.headings.map(heading => heading.id));
    pages.push(page);
    pagesBySource.set(sourceFile, page);
    pagesByRoute.set(page.route, page);
    if (page.route !== '/' && page.route.endsWith('/')) pagesByRoute.set(page.route.slice(0, -1), page);
  }

  for (const staticPath of publicFiles.keys()) {
    if (outputs.has(staticPath)) throw new Error(`Duplicate documentation output: ${staticPath}`);
    outputs.add(staticPath);
  }

  const site = { repositoryRoot: root, docsDirectory: docs, publicDirectory, publicFiles, pagesBySource, pagesByRoute, basePath };
  const parent = dirname(output);
  await mkdir(parent, { recursive: true });
  const temporary = await mkdtemp(join(parent, '.site-build-'));
  const previous = output + '.previous';
  try {
    for (const page of pages) {
      const environment = { page, site };
      const body = renderer.renderer.render(page.tokens, renderer.options, environment);
      await writeOutput(join(temporary, page.output), documentHtml(page, body, pages, basePath));
    }
    await writeOutput(join(temporary, '404.html'), notFoundHtml(basePath));
    await writeOutput(join(temporary, 'assets/site.css'), await readFile(SITE_CSS));
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

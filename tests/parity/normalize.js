/**
 * HTML normalization for React <-> Limepie(PHP) parity comparison.
 *
 * Both sides MUST pass through the same normalization before comparison.
 * Never normalize only one side.
 *
 * Normalization rules (documented; do not weaken without updating README.md):
 *
 * (a) Non-deterministic token masking — port of the verified perl recipe in
 *     tools/limepie-baseline/README.md, applied to the RAW html string before
 *     parsing. Tokens are replaced order-preservingly with U1/U2..., C1...,
 *     T1... so cross-references (e.g. multiple-group name placeholder ==
 *     data-uniqid) survive masking.
 *       1. tinymce<13hex>            -> tinymce<U n>   (separate rule: the
 *          prefix "tinymce" ends in hex chars, so rule 2's lookbehind
 *          can never match after it)
 *       2. bare <13..14 hex>         -> <U n>          (PHP uniqid() emits 13
 *          hex; React generateUniqid() emits 13 hex too — the verified
 *          limepie-baseline recipe applies unmodified, so token LENGTH
 *          parity is asserted, not erased.)
 *       3. choice-<key>-<5ch>-<n>    -> choice-<key>-<C n>-<n>  (key class
 *          includes A-Z because rule 2 may already have placed U-tokens
 *          inside the key)
 *       4. _<5ch of [a-hj-km-np-z2-9]> -> _<T n>       (display_switch class
 *          suffix; also appears inside inline JS strings, so the boundary is
 *          a negative lookahead, not quotes/whitespace)
 * (b) Attribute order: attributes are sorted alphabetically by name.
 * (c) Inter-tag whitespace: whitespace-only text nodes ([ \t\r\n]) are
 *     dropped; inside mixed text nodes runs of [ \t\r\n]+ collapse to a
 *     single space and leading/trailing ASCII whitespace is trimmed.
 *     U+00A0 (&nbsp;) is NOT whitespace here — it is meaningful content
 *     (legacy button labels are all &nbsp;).
 * (d) HTML comments (e.g. legacy's <!--btn--> slot marker) are removed.
 *     React cannot emit comments, so they are excluded from comparison.
 *     This removal is recorded in README.md.
 * (e) Empty style="" attributes are removed (PHP emits style="" wrappers,
 *     React omits the attribute for an empty style object). Non-empty style
 *     values are canonicalized: declarations split on ';', trimmed,
 *     property lowercased, joined as "prop:value;..." — so
 *     "display: none;" == "display:none".
 * (f) class attribute values: internal whitespace runs collapse to a single
 *     space, value is trimmed; an empty class attribute is removed (same
 *     spirit as (e)). Token ORDER is preserved — class order is part of the
 *     contract and is not sorted.
 * (g) Boolean attributes (selected/checked/disabled/readonly/multiple/
 *     required/autofocus/novalidate/hidden/open) compare presence-only:
 *     their value is normalized to "" so selected="selected" == selected="".
 *
 * Parsing with parse5 additionally unifies pure serialization differences
 * that are not "rules" but parser facts: quote style (class='x' vs
 * class="x"), void-element self-closing slashes (<input /> vs <input/>),
 * and entity encoding.
 */

import fs from 'node:fs';
import { parseFragment } from 'parse5';

// ---------------------------------------------------------------------------
// (a) token masking
// ---------------------------------------------------------------------------

export function maskTokens(html) {
  let i = 0;
  let j = 0;
  let k = 0;
  const uniq = new Map();
  const choice = new Map();
  const sw = new Map();
  const u = (tok) => {
    if (!uniq.has(tok)) uniq.set(tok, `U${++i}`);
    return uniq.get(tok);
  };

  let out = html;
  // rule 1: tinymce<13hex>
  out = out.replace(/(?<=tinymce)[0-9a-f]{13}(?![0-9a-f])/g, (s) => u(s));
  // rule 2: bare 13..14 hex with non-hex boundaries
  out = out.replace(/(?<![0-9a-f])[0-9a-f]{13,14}(?![0-9a-f])/g, (s) => u(s));
  // rule 3: choice-<key>-<5ch>-<n>
  out = out.replace(
    /(choice-[A-Za-z_0-9-]+-)([a-hj-km-np-z2-9]{5})(-\d)/g,
    (s, pre, tok, post) => {
      if (!choice.has(tok)) choice.set(tok, `C${++j}`);
      return pre + choice.get(tok) + post;
    }
  );
  // rule 4: _<5ch> display_switch suffix
  out = out.replace(/_([a-hj-km-np-z2-9]{5})(?![0-9a-zA-Z_-])/g, (s, tok) => {
    if (!sw.has(tok)) sw.set(tok, `T${++k}`);
    return '_' + sw.get(tok);
  });
  return out;
}

// ---------------------------------------------------------------------------
// tree helpers
// ---------------------------------------------------------------------------

const VOID_ELEMENTS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr',
]);

const BOOLEAN_ATTRS = new Set([
  'checked', 'selected', 'disabled', 'readonly', 'multiple', 'required',
  'autofocus', 'novalidate', 'hidden', 'open',
]);

const isElement = (n) => Boolean(n.tagName);

function getAttr(el, name) {
  const a = (el.attrs ?? []).find((x) => x.name === name);
  return a ? a.value : null;
}

function classList(el) {
  const c = getAttr(el, 'class');
  return c ? c.trim().split(/\s+/) : [];
}

function normalizeStyle(value) {
  return value
    .split(';')
    .map((d) => d.trim())
    .filter(Boolean)
    .map((d) => {
      const idx = d.indexOf(':');
      if (idx === -1) return d;
      return d.slice(0, idx).trim().toLowerCase() + ':' + d.slice(idx + 1).trim();
    })
    .join(';');
}

/** Mutates the parse5 tree: drops comments / whitespace-only text, collapses
 *  text whitespace, normalizes + sorts attributes. */
function prune(node) {
  if (node.attrs) {
    const attrs = [];
    for (const a of node.attrs) {
      let { name, value } = a;
      if (name === 'style') {
        value = normalizeStyle(value);
        if (value === '') continue; // (e)
      } else if (name === 'class') {
        value = value.replace(/[ \t\r\n]+/g, ' ').trim(); // (f)
        if (value === '') continue;
      } else if (BOOLEAN_ATTRS.has(name)) {
        value = ''; // (g)
      }
      attrs.push({ name, value });
    }
    attrs.sort((x, y) => (x.name < y.name ? -1 : x.name > y.name ? 1 : 0)); // (b)
    node.attrs = attrs;
  }
  const children = node.content?.childNodes ?? node.childNodes;
  if (!children) return;
  const kept = [];
  for (const child of children) {
    if (child.nodeName === '#comment') continue; // (d)
    if (child.nodeName === '#text') {
      const collapsed = child.value
        .replace(/[ \t\r\n]+/g, ' ')
        .replace(/^ +| +$/g, ''); // (c) —   intentionally preserved
      if (collapsed === '') continue; // U+00A0 is content, not whitespace — survives
      child.value = collapsed;
      kept.push(child);
      continue;
    }
    prune(child);
    kept.push(child);
  }
  if (node.content?.childNodes) node.content.childNodes = kept;
  else node.childNodes = kept;
}

// ---------------------------------------------------------------------------
// canonical serializer — one node per line so line diffs stay readable
// ---------------------------------------------------------------------------

function escText(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\u00a0/g, '&nbsp;');
}

function escAttr(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/\u00a0/g, '&nbsp;');
}

function openTag(el) {
  const attrs = (el.attrs ?? [])
    .map((a) => ` ${a.name}="${escAttr(a.value)}"`)
    .join('');
  return `<${el.tagName}${attrs}`;
}

function serializeInto(node, depth, lines, markers) {
  const indent = '  '.repeat(depth);
  if (markers && markers.has(node)) {
    lines.push(indent + markers.get(node));
    return;
  }
  if (node.nodeName === '#text') {
    lines.push(indent + escText(node.value));
    return;
  }
  if (!isElement(node)) return;
  const children = node.content?.childNodes ?? node.childNodes ?? [];
  if (VOID_ELEMENTS.has(node.tagName)) {
    lines.push(indent + openTag(node) + '/>');
    return;
  }
  if (children.length === 0) {
    lines.push(indent + openTag(node) + `></${node.tagName}>`);
    return;
  }
  lines.push(indent + openTag(node) + '>');
  for (const child of children) serializeInto(child, depth + 1, lines, markers);
  lines.push(`${indent}</${node.tagName}>`);
}

function serializeChildren(parent, markers = null) {
  const lines = [];
  for (const child of parent.childNodes) serializeInto(child, 0, lines, markers);
  return lines;
}

// ---------------------------------------------------------------------------
// public API
// ---------------------------------------------------------------------------

/** Full canonical normalized form of an HTML fragment. */
export function normalizeHtml(html) {
  const frag = parseFragment(maskTokens(html));
  prune(frag);
  return serializeChildren(frag).join('\n');
}

/**
 * Analyze a form fragment for structured comparison.
 * Returns:
 *   canonical : full canonical string
 *   fields    : direct children of the top-level .form-group, keyed by their
 *               name attribute (legacy wrapper layer names, e.g. "name-layer")
 *   chrome    : canonical string with each field subtree replaced by a
 *               <<FIELD key>> marker — everything that is NOT a field
 *               (top label/description/hr, button row, form-group shell)
 */
export function analyzeForm(html) {
  const frag = parseFragment(maskTokens(html));
  prune(frag);
  const canonical = serializeChildren(frag).join('\n');

  const topEls = frag.childNodes.filter(isElement);
  const formGroup = topEls.find((el) => classList(el).includes('form-group')) ?? null;

  const fields = [];
  const markers = new Map();
  if (formGroup) {
    formGroup.childNodes.filter(isElement).forEach((el, idx) => {
      const key = getAttr(el, 'name') ?? `#${idx}`;
      const lines = [];
      serializeInto(el, 0, lines, null);
      fields.push({ key, lines });
      markers.set(el, `<<FIELD ${key}>>`);
    });
  }
  const chrome = serializeChildren(frag, markers).join('\n');
  return { canonical, fields, chrome, hasFormGroup: formGroup !== null };
}

/**
 * Re-number masked tokens (U/C/T) in first-appearance order WITHIN a block.
 *
 * maskTokens() numbers tokens globally over the whole document; when one side
 * omits a section, every later ordinal drifts and structurally identical
 * fields would falsely diff. Field- and chrome-level comparisons therefore
 * relabel tokens locally. Cross-field token correlation is still enforced by
 * the global `canonical` equality — relabeling is diagnostic only.
 */
export function relabelTokens(lines) {
  const maps = { U: new Map(), C: new Map(), T: new Map() };
  const counters = { U: 0, C: 0, T: 0 };
  // \b cannot be used: tokens sit between underscores (__U6__) and _ is a
  // word char. Boundary = no adjacent letter/digit instead.
  const relabel = (text) =>
    text.replace(/(?<![A-Za-z0-9])([UCT])\d+(?![0-9])/g, (s, kind) => {
      const m = maps[kind];
      if (!m.has(s)) m.set(s, `${kind}${++counters[kind]}`);
      return m.get(s);
    });
  return lines.map(relabel);
}

/** First divergence between two line arrays, with context. */
export function firstDiff(a, b, { context = 2, maxLines = 10 } = {}) {
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }
  const from = Math.max(0, start - context);
  return {
    line: start + 1,
    referenceDiffLines: endA - start,
    reactDiffLines: endB - start,
    reference: a.slice(from, Math.min(endA, start + maxLines)),
    react: b.slice(from, Math.min(endB, start + maxLines)),
  };
}

/**
 * Structured comparison report between reference(PHP) and React analyses.
 * Fields are aligned BY POSITION (render order is part of the contract);
 * each pair also reports both wrapper keys so name-prefix drift is visible.
 */
export function compareAnalyses(reference, react) {
  const equal = reference.canonical === react.canonical;
  const total = Math.max(reference.fields.length, react.fields.length);
  const fields = [];
  let matched = 0;
  for (let idx = 0; idx < total; idx++) {
    const g = reference.fields[idx];
    const r = react.fields[idx];
    if (g && r) {
      const gl = relabelTokens(g.lines);
      const rl = relabelTokens(r.lines);
      const same = gl.length === rl.length && gl.join('\n') === rl.join('\n');
      if (same) matched++;
      fields.push({
        index: idx,
        referenceKey: g.key,
        reactKey: r.key,
        status: same ? 'match' : 'differs',
        diff: same ? null : firstDiff(gl, rl),
      });
    } else if (g) {
      fields.push({ index: idx, referenceKey: g.key, reactKey: null, status: 'reference-only' });
    } else {
      fields.push({ index: idx, referenceKey: null, reactKey: r.key, status: 'react-only' });
    }
  }
  const referenceChrome = relabelTokens(reference.chrome.split('\n'));
  const reactChrome = relabelTokens(react.chrome.split('\n'));
  const chromeSame = referenceChrome.join('\n') === reactChrome.join('\n');
  return {
    equal,
    totalFields: total,
    matchedFields: matched,
    mismatchedFields: total - matched,
    fields,
    chrome: chromeSame ? 'match' : 'differs',
    chromeDiff: chromeSame ? null : firstDiff(referenceChrome, reactChrome),
  };
}

/** Human-readable report block for one fixture. */
export function formatReport(name, report) {
  const out = [];
  out.push(`=== ${name} ===`);
  out.push(
    `overall: ${report.equal ? 'MATCH' : 'DIFFERS'} | fields: ${report.matchedFields}/${report.totalFields} match | chrome(label/hr/buttons/shell): ${report.chrome}`
  );
  for (const f of report.fields) {
    if (f.status === 'match') continue;
    if (f.status === 'reference-only') {
      out.push(`  [${f.index}] REFERENCE-ONLY ${f.referenceKey}`);
      continue;
    }
    if (f.status === 'react-only') {
      out.push(`  [${f.index}] REACT-ONLY ${f.reactKey}`);
      continue;
    }
    const keyNote = f.referenceKey === f.reactKey ? f.referenceKey : `${f.referenceKey} <-> ${f.reactKey}`;
    out.push(`  [${f.index}] DIFFERS ${keyNote} @line ${f.diff.line} (reference ${f.diff.referenceDiffLines} / react ${f.diff.reactDiffLines} lines differ)`);
    for (const l of f.diff.reference) out.push(`    G| ${l}`);
    for (const l of f.diff.react) out.push(`    R| ${l}`);
  }
  if (report.chromeDiff) {
    const d = report.chromeDiff;
    out.push(`  [chrome] DIFFERS @line ${d.line} (reference ${d.referenceDiffLines} / react ${d.reactDiffLines} lines differ)`);
    for (const l of d.reference) out.push(`    G| ${l}`);
    for (const l of d.react) out.push(`    R| ${l}`);
  }
  return out.join('\n');
}

// CLI: node normalize.js <file.html>  -> canonical form on stdout
if (import.meta.url === `file://${process.argv[1]}`) {
  const file = process.argv[2];
  if (!file) {
    console.error('usage: node normalize.js <file.html>');
    process.exit(1);
  }
  process.stdout.write(normalizeHtml(fs.readFileSync(file, 'utf8')) + '\n');
}

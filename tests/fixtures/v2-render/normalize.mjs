/**
 * v2-render shared HTML normalizer (4-language / 3-framework parity gate).
 *
 * The shared fixtures hold ONE `expected_html` per case. React/Vue/Svelte each
 * SSR-render the same v2 spec and must match `expected_html` AFTER passing
 * through this normalizer. The normalizer erases the differences that are NOT
 * load-bearing across frameworks (attribute order, inter-tag whitespace, empty
 * class/style attributes) while preserving the load-bearing structure (tag tree,
 * attribute presence + values, text).
 *
 * Row keys and input paths are compared without masking.
 *
 * Rules (also documented in README.md — keep in sync):
 *  N2 attribute order: attributes within a tag are sorted by name.
 *  N3 boolean/empty-value attrs: bare boolean attributes become `x=""`; presence is preserved.
 *  N4 empty class/style: `class=""` and `style=""` are dropped (no-op chrome).
 *  N5 whitespace: runs of whitespace between `>` and `<` are removed; runs of
 *     whitespace inside text are collapsed to one space; leading/trailing
 *     whitespace trimmed.
 *  N6 self-closing: ` />` and `/>` normalize to `>`; `< /` never appears.
 *  N7 HTML comments: `<!-- ... -->` are stripped (decorative chrome; the
 *     load-bearing stub/fallback signal is the `data-source-*` /
 *     `data-unsupported-type` ATTRIBUTE on a real element, which survives N2–N4).
 *     Comments are not byte-stable across frameworks, so they are not compared.
 *  N8 CSS declaration spacing: inside a `style="..."` value, declarations are
 *     canonicalized to `prop: val; prop: val` (one space after `:`, `; ` between
 *     declarations, no trailing `;`). This is a cross-framework no-op — the CSS is
 *     identical — that absorbs each SSR engine's serializer spacing (React object
 *     style emits `prop:val`; the string builders emit `prop: val`).
 */

/** N8: canonicalize a CSS declaration list to `prop: val; prop: val`. */
function canonicalStyle(value) {
  const decls = [];
  for (const decl of value.split(';')) {
    const idx = decl.indexOf(':');
    if (idx === -1) continue;
    const prop = decl.slice(0, idx).trim();
    const val = decl.slice(idx + 1).trim();
    if (!prop || !val) continue;
    decls.push(`${prop}: ${val}`);
  }
  return decls.join('; ');
}

/** Parse a tag's attributes into a sorted, re-serialized attribute string. */
function sortAttributes(tagBody) {
  // tagBody is the inside of <...>: "tagname attr1="x" attr2="y" /" possibly.
  const selfClose = /\/\s*$/.test(tagBody);
  let body = tagBody.replace(/\/\s*$/, '').trim();

  // Closing tag or no attrs: return name only.
  const nameMatch = body.match(/^([/!]?[a-zA-Z0-9-]+)/);
  if (!nameMatch) return tagBody;
  const name = nameMatch[1];
  let rest = body.slice(name.length).trim();
  if (rest === '') return name;

  const attrs = [];
  const attrRe = /([a-zA-Z0-9:_-]+)(?:="([^"]*)")?/g;
  let m;
  while ((m = attrRe.exec(rest)) !== null) {
    if (m[0].trim() === '') continue;
    const key = m[1];
    let val = m[2];
    // HTML boolean presence is equivalent to an empty attribute value.
    if (val === undefined && /^(checked|selected|disabled|readonly|multiple|required|autofocus)$/.test(key)) val = '';
    // N4: drop empty class/style.
    if ((key === 'class' || key === 'style') && (val === undefined || val === '')) {
      continue;
    }
    // N8: canonicalize CSS declaration spacing inside a style="..." value.
    if (key === 'style' && val !== undefined) {
      val = canonicalStyle(val);
      if (val === '') continue;
    }
    attrs.push(val === undefined ? key : `${key}="${val}"`);
  }
  attrs.sort((a, b) => a.localeCompare(b));
  const attrStr = attrs.length ? ' ' + attrs.join(' ') : '';
  void selfClose; // N6: self-close collapses to '>'.
  return name + attrStr;
}

/** Normalize an HTML string for cross-framework comparison. */
export function normalizeHtml(html) {
  if (typeof html !== 'string') return '';
  let out = html;

  // N7: strip HTML comments (before tag processing, so `--` never reaches the
  // attribute sorter). The grep-distinct stub/fallback signal is the data-* attr.
  out = out.replace(/<!--[\s\S]*?-->/g, '');

  // N2/N3/N4/N6: rewrite each tag with sorted attributes.
  out = out.replace(/<([^>]*)>/g, (_full, body) => `<${sortAttributes(body)}>`);

  // N5: strip whitespace between tags, collapse inner whitespace.
  out = out.replace(/>\s+</g, '><');
  out = out.replace(/[ \t\r\n]+/g, ' ');
  out = out.trim();

  return out;
}

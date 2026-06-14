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
 * No uniqid mask: every row identity is now an EXPLICIT, deterministic value
 * (G4) — the client serialization index (`#N` → `data-uniqid="N"`,
 * `name="...[N]"`) for new/array rows, the hidden data key (server PK) for
 * object-keyed rows, and a path-derived element id (`elementId`) for single
 * fields/widgets. Those are byte-identical across React/Vue/Svelte, so nothing
 * needs masking. There is no longer a magic random `__<hex>__` token to erase.
 *
 * Rules (also documented in README.md — keep in sync):
 *  N2 attribute order: attributes within a tag are sorted by name.
 *  N3 boolean/empty-value attrs: `x=""` is kept as `x=""` (presence matters).
 *  N4 empty class/style: `class=""` and `style=""` are dropped (no-op chrome).
 *  N5 whitespace: runs of whitespace between `>` and `<` are removed; runs of
 *     whitespace inside text are collapsed to one space; leading/trailing
 *     whitespace trimmed.
 *  N6 self-closing: ` />` and `/>` normalize to `>`; `< /` never appears.
 *  N7 HTML comments: `<!-- ... -->` are stripped (decorative chrome; the
 *     load-bearing stub/fallback signal is the `data-source-*` /
 *     `data-unsupported-type` ATTRIBUTE on a real element, which survives N2–N4).
 *     Comments are not byte-stable across frameworks, so they are not compared.
 */

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
    const val = m[2];
    // N4: drop empty class/style.
    if ((key === 'class' || key === 'style') && (val === undefined || val === '')) {
      continue;
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

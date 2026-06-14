/**
 * form-render shared HTML normalizer (4-language / 3-framework parity gate).
 *
 * The shared fixtures hold ONE `expected_html` per case. React/Vue/Svelte each
 * SSR-render the same CRUDUI spec and must match `expected_html` AFTER passing
 * through this normalizer. The normalizer erases the differences that are NOT
 * load-bearing across frameworks (attribute order, inter-tag whitespace, the
 * masked uniqid token value, empty class/style attributes) while preserving the
 * load-bearing structure (tag tree, attribute presence + values, text).
 *
 * Rules (also documented in README.md — keep in sync):
 *  N1 uniqid mask: every generated Limepie token `__<11..16 hex>__` → `__UNIQID__`
 *     WHEREVER it appears (data-uniqid, and placeholder/array row keys inside
 *     `name="...[__hex__]"`). Only token LENGTH is contractual; the value is a
 *     per-render counter that differs across frameworks. Real data row ids (e.g.
 *     `p1`) are NOT this shape and survive unmasked (G4 data-id identity).
 *  N2 attribute order: attributes within a tag are sorted by name.
 *  N3 boolean/empty-value attrs: `x=""` is kept as `x=""` (presence matters).
 *  N4 empty class/style: `class=""` and `style=""` are dropped (no-op chrome).
 *  N5 whitespace: runs of whitespace between `>` and `<` are removed; runs of
 *     whitespace inside text are collapsed to one space; leading/trailing
 *     whitespace trimmed.
 *  N6 self-closing: ` />` and `/>` normalize to `>`; `< /` never appears.
 */

// A generated Limepie token: `__` + 11..16 hex + `__`. Masked globally.
const UNIQID_TOKEN_RE = /__[0-9a-f]{11,16}__/g;

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

  // N1: mask every generated uniqid token, wherever it appears.
  out = out.replace(UNIQID_TOKEN_RE, '__UNIQID__');

  // N2/N3/N4/N6: rewrite each tag with sorted attributes.
  out = out.replace(/<([^>]*)>/g, (_full, body) => `<${sortAttributes(body)}>`);

  // N5: strip whitespace between tags, collapse inner whitespace.
  out = out.replace(/>\s+</g, '><');
  out = out.replace(/[ \t\r\n]+/g, ' ');
  out = out.trim();

  return out;
}

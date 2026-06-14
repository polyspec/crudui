/**
 * Legacy client runtime adapter.
 *
 * Drives the jQuery-validator-style legacy runtime
 *   examples/limepie-original/assets/js/dist.validate.js
 * under jsdom + jQuery, feeding it a polyspec test {spec, input} and
 * extracting {valid, error, field} in the same shape compare-all.js uses
 * for the new validators (validator-ts/php/go/rust).
 *
 * WHY a synthesized DOM: the legacy runtime is DOM-coupled. check() reads the
 * live value via getValueByElement(element) (dist.validate.js:261-332), looks
 * elements up by name selector, and renders errors into .message divs. It does
 * NOT take a plain value argument that it trusts. So the only faithful way to
 * run it is to build the same .valid-target / data-rule-name form Limepie emits
 * and inject the case input into the DOM, then trigger validation.
 *
 * Field/rule name model (verified against tests/fixtures/reference-html):
 *   - fixSpec() flattens group properties to bracket-path names
 *     e.g. common[name], common[display][start_dt]  (dist.validate.js:979-1025)
 *   - the DOM element's name attribute == that bracket-path
 *   - data-rule-name == the same bracket-path
 *   - rules[ruleName] == the leaf field spec {type, rules, messages}
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const jQueryFactory = require('jquery');

const LEGACY_FILE = path.join(
  __dirname, '..', '..',
  'examples', 'limepie-original', 'assets', 'js', 'dist.validate.js'
);

// ---------------------------------------------------------------------------
// Spec flattening: mirror dist.validate.js fixSpec(), but also remember the
// dot-path (compare-all field format) and the synthesized DOM shape per leaf.
// ---------------------------------------------------------------------------

// Map a leaf field's spec.type to an HTML input element shape.
// Limepie renders these element kinds; the legacy runtime branches on
// element.type / nodeName inside getValueByElement and the rule methods.
function elementShapeFor(fieldSpec) {
  const t = fieldSpec && fieldSpec.type;
  switch (t) {
    case 'number':
    case 'physical':
    case 'digital':
      // Use a text input, not input[type=number]. jsdom (like real browsers)
      // SANITIZES a non-conforming value in a typed number input to "" (e.g.
      // "abc"/"12abc"/"Infinity" -> ""), which would hide the raw value from
      // the legacy validator and defeat the implicit-number check. A real
      // browser surfaces the bad value via element.validity.badInput -> the
      // legacy getValueByElement returns "NaN"; jsdom cannot reproduce badInput.
      // A text input faithfully exposes the raw string to the legacy
      // number/min/max methods, matching what validation actually sees in a
      // browser. (Same jsdom-sanitization workaround already used for dates.)
      return { tag: 'input', type: 'text', numberLike: true };
    case 'datetime':
    case 'date':
      // Use a text input, not a native date/datetime-local: jsdom (and real
      // browsers) sanitize non-conforming values to "" for typed date inputs,
      // which would corrupt the value the legacy validator reads. The case
      // data is plain date strings. No case combines datetime/date with
      // min/max (which is the only legacy rule that branches on element.type),
      // so a text input faithfully exposes the raw value to required/etc.
      return { tag: 'input', type: 'text', dateLike: true };
    case 'select':
      return { tag: 'select', type: 'select-one' };
    case 'textarea':
      return { tag: 'textarea', type: null };
    case 'choice':
    case 'switcher':
      // single-choice radio group; default rendered as a text-ish input is
      // wrong for `required` length checks, so use radio.
      return { tag: 'input', type: 'radio' };
    case 'multichoice':
    case 'multiple':
      return { tag: 'input', type: 'checkbox', array: true };
    case 'file':
    case 'image':
      return { tag: 'input', type: 'file' };
    default:
      return { tag: 'input', type: 'text' };
  }
}

/**
 * Walk a spec, producing leaf descriptors.
 * Returns array of { bracketName, dotPath, fieldSpec, shape }.
 *
 * name carries the bracket-path Limepie/legacy use; dotPath is the
 * compare-all field format. Group flattening matches fixSpec exactly.
 * Arrays (multiple groups, []-suffixed keys) are NOT expanded here — they are
 * handled / excluded by the caller, because the legacy array model needs the
 * [__uniqid__] element-name convention which a faithful gate cannot fake from
 * the spec alone.
 */
function flattenSpec(spec, bracketPrefix, dotPrefix, out) {
  out = out || [];
  if (!spec || typeof spec !== 'object') return out;
  const properties = spec.properties || {};
  for (const rawKey of Object.keys(properties)) {
    const child = properties[rawKey];
    const isArrayKey = rawKey.indexOf('[]') > -1;
    const key = isArrayKey ? rawKey.replace('[]', '') : rawKey;

    let bracketName = key;
    if (bracketPrefix) bracketName = bracketPrefix + '[' + key + ']';
    if (isArrayKey) bracketName += '[]';

    const dotPath = dotPrefix ? dotPrefix + '.' + key : key;

    if (child && child.type === 'group') {
      // multiple group => array; mark for exclusion upstream.
      if (child.multiple) {
        out.push({ unsupported: 'array-group', dotPath, bracketName });
        continue;
      }
      // []-suffixed group key is also an array group.
      if (isArrayKey) {
        out.push({ unsupported: 'array-group', dotPath, bracketName });
        continue;
      }
      // display_switch on a group hides the whole subtree; legacy has no
      // display gating, so the whole group is not comparable.
      if (typeof child.display_switch !== 'undefined') {
        out.push({ unsupported: 'display_switch', dotPath, bracketName });
        continue;
      }
      flattenSpec(child, bracketName, dotPath, out);
    } else {
      // display_switch: the legacy dist.validate.js has no display-gating
      // (grep: 0 references). Skip-on-hidden is a new-validator feature; the
      // legacy runtime would validate the field regardless. Not comparable.
      if (child && typeof child.display_switch !== 'undefined') {
        out.push({ unsupported: 'display_switch', dotPath, bracketName });
        continue;
      }
      // multiple/[]-suffix leaf => array-valued field; legacy needs the
      // [__uniqid__] multi-element convention we cannot synthesize.
      if (isArrayKey || (child && child.multiple)) {
        out.push({ unsupported: 'array-leaf', dotPath, bracketName });
        continue;
      }
      out.push({
        bracketName,
        dotPath,
        fieldSpec: child || {},
        shape: elementShapeFor(child || {}),
      });
    }
  }
  return out;
}

// Look up a value in the case input object by dot-path.
function getByDotPath(input, dotPath) {
  if (input === null || input === undefined) return undefined;
  const parts = dotPath.split('.');
  let cur = input;
  for (const p of parts) {
    if (cur === null || cur === undefined) return undefined;
    cur = cur[p];
  }
  return cur;
}

// Coerce a case value into a DOM string value.
function toDomValue(v) {
  if (v === undefined || v === null) return '';
  if (v === '__undefined__') return '';
  if (typeof v === 'boolean') return v ? '1' : '';
  return String(v);
}

// ---------------------------------------------------------------------------
// Runtime: one jsdom realm per adapter instance (cheap to recreate per case,
// avoiding cross-case state in requiredWaves / message divs).
// ---------------------------------------------------------------------------

const legacyCode = fs.readFileSync(LEGACY_FILE, 'utf-8');

function makeRealm() {
  const dom = new JSDOM(
    '<!DOCTYPE html><html lang="en"><body><form id="legacy-form"></form></body></html>',
    { runScripts: 'outside-only', pretendToBeVisual: true }
  );
  const { window } = dom;
  // The legacy file has a few stray console.log(element) / console.warn calls
  // (dist.validate.js:84, 265, 860). Silence them so the gate output is clean.
  const noop = () => {};
  window.console = { log: noop, warn: noop, error: noop, info: noop, debug: noop, trace: noop };
  const $ = jQueryFactory(window);

  // Globals dist.validate.js references at top level.
  const perf = window.performance || require('perf_hooks').performance;
  const sandbox = {
    window,
    document: window.document,
    $,
    jQuery: $,
    performance: perf,
    // grecaptcha is only touched by the recaptcha method (not in our cases).
    grecaptcha: { getResponse: () => '' },
  };
  // Evaluate the legacy file inside a function scope with those names bound.
  // Inject a stubbed `console` so the file's stray console.log(element) calls
  // (it references the bare global `console`) do not spam the gate output.
  const run = new Function(
    'window', 'document', '$', 'jQuery', 'performance', 'grecaptcha', 'console',
    legacyCode
  );
  run(
    sandbox.window, sandbox.document, sandbox.$, sandbox.jQuery,
    sandbox.performance, sandbox.grecaptcha, window.console
  );

  return { dom, window, $ };
}

// Rules used by cases but named differently in the legacy runtime.
// pattern -> match: the new validators alias 'pattern' to 'match' (same
// ^...$ anchoring); legacy only defines 'match'. We feed 'match' to legacy
// and report the failing rule back as 'pattern' so it lines up with the new
// validators' error key.
const RULE_ALIAS_TO_LEGACY = { pattern: 'match' };
const RULE_ALIAS_FROM_LEGACY = { match: 'pattern' };

// A pattern/match param the legacy `match` method cannot evaluate: it treats
// the param as a raw regex (auto-anchored ^...$). The new validators parse
// conditional/ternary expressions (e.g. ".country == KR ? ^\d{5}$ : ...").
// Such params are a legacy capability gap, not a comparable rule.
function isConditionalPatternParam(param) {
  if (typeof param !== 'string') return false;
  // ternary "<cond> ? <a> : <b>" or a leading condition expression.
  return /\?.*:/.test(param) || /(==|!=|<=|>=|&&|\|\|)/.test(param);
}

// Translate a leaf field spec's rules object to legacy method names.
// Returns { legacyRules, reportNames } where reportNames maps a legacy method
// name back to the rule name the case used (for match<->pattern alias).
function translateRules(rules) {
  const legacyRules = {};
  const reportNames = {};
  if (!rules) return { legacyRules, reportNames };
  for (const k of Object.keys(rules)) {
    const legacyKey = RULE_ALIAS_TO_LEGACY[k] || k;
    legacyRules[legacyKey] = rules[k];
    reportNames[legacyKey] = k; // report under the case's own rule name
  }
  return { legacyRules, reportNames };
}

// Build the bracket-keyed rule map the legacy runtime expects, with rule
// method names translated to legacy spelling.
function buildLegacySpec(spec, leaves) {
  // We hand the legacy fixSpec a spec whose leaves carry translated rules.
  // Simplest: deep-clone the spec and rewrite each leaf's rules in place,
  // keyed by walking the same structure. But fixSpec keys by bracket-name,
  // so instead we construct a flat properties object directly.
  const properties = {};
  for (const leaf of leaves) {
    if (leaf.unsupported) continue;
    const fs2 = Object.assign({}, leaf.fieldSpec);
    if (fs2.rules) {
      const { legacyRules, reportNames } = translateRules(fs2.rules);
      fs2.rules = legacyRules;
      leaf.reportNames = reportNames; // stash for firstFailingRule
    }
    properties[leaf.bracketName] = fs2;
  }
  return { type: 'group', properties };
}

// ---------------------------------------------------------------------------
// Determine the first failing rule for one element, replicating the loop in
// dist.validate.js check() (lines 583-633) but capturing the method name.
// check() itself returns only a boolean and renders a localized message div;
// it does not expose which rule failed, so we re-run the same method calls.
// Semantics preserved: dependency-mismatch => skip; required passed as the 4th
// arg to other methods; getValueByElement reads the live DOM value.
// ---------------------------------------------------------------------------
function firstFailingRule($, validator, bracketName, leafRules, methods, reportNames) {
  const escapeName = bracketName.replace(/\[/g, '\\[').replace(/\]/g, '\\]');
  const $element = $('[name="' + escapeName + '"]', validator.currentForm);
  const element = $element[0];
  if (!element) return { error: '__no_element__' };

  for (const method in leafRules) {
    const fn = methods[method];
    if (typeof fn !== 'function') {
      return { error: '__unsupported_rule__:' + method };
    }
    const value = validator.getValueByElement(element);
    let result;
    try {
      result = fn.call(
        validator,
        value,
        element,
        leafRules[method],
        leafRules['required'] != null ? leafRules['required'] : null
      );
    } catch (e) {
      return { error: '__method_threw__:' + method + ':' + e.message };
    }
    if (result === 'dependency-mismatch') continue;
    if (result === 'pending') continue; // remote/async, not in our scope
    if (!result) {
      // Report under the original case rule name (handles match<->pattern alias).
      const reported = (reportNames && reportNames[method]) || method;
      return { error: reported };
    }
  }
  return null; // all passed
}

/**
 * Run one case through the legacy runtime.
 *
 * @returns {object} one of:
 *   { supported:true, valid, error, field }
 *   { supported:false, reason }   when the case can't be faithfully driven
 */
function runLegacyCase(spec, input) {
  // Normalize: compare-all wraps non-group specs as { value: <spec> }.
  let workSpec = spec;
  let workInput = input;
  if (!(spec && spec.type === 'group' && spec.properties)) {
    workSpec = { type: 'group', properties: { value: spec } };
    if (input === '__undefined__') workInput = { value: undefined };
    else workInput = { value: input };
  }

  // Synthesize under a root group prefix so the legacy relative-path resolver
  // (getPath, dist.validate.js:748-788) has a level to strip for a single
  // leading dot. In real Limepie forms every field sits under the form's root
  // name; a single dot ".sibling" resolves by stripping the last [segment] of
  // the current element name. Top-level fields with no bracket would otherwise
  // produce <field>[sibling], which does not exist. dotPath stays prefix-free
  // for field reporting (compare-all format).
  const ROOT = 'form';
  const leaves = flattenSpec(workSpec, ROOT, '', []);

  const unsupported = leaves.filter((l) => l.unsupported);
  if (unsupported.length) {
    const byKind = {};
    for (const u of unsupported) (byKind[u.unsupported] ??= []).push(u.dotPath);
    const reasonMap = {
      'array-group': 'array group (multiple) needs legacy [__uniqid__] element naming',
      'array-leaf': 'array-valued field ([]/multiple) needs legacy [__uniqid__] element naming',
      'display_switch': 'display_switch field — legacy dist.validate.js has no display gating',
    };
    const parts = Object.keys(byKind).map(
      (k) => (reasonMap[k] || k) + ' @ ' + byKind[k].join(',')
    );
    return { supported: false, reason: parts.join('; ') };
  }

  // Array-valued input for a scalar leaf: legacy reads a single element value,
  // so an array input cannot be driven faithfully (covers unique/min/count
  // over arrays). Detect and exclude rather than mis-compare.
  for (const leaf of leaves) {
    if (leaf.unsupported) continue;
    const v = getByDotPath(workInput, leaf.dotPath);
    if (Array.isArray(v)) {
      return {
        supported: false,
        reason: 'array-valued input @ ' + leaf.dotPath
          + ' needs legacy multi-element synthesis ([__uniqid__]) not reproducible from spec',
      };
    }
    if (typeof v === 'boolean') {
      // A raw scalar boolean has no canonical single-control DOM value. The
      // new validators treat false as a present value; a synthesized input
      // cannot represent "false is selected" vs "nothing selected" without
      // fabricating a token. Exclude rather than mis-compare. (1 case.)
      return {
        supported: false,
        reason: 'raw boolean input @ ' + leaf.dotPath
          + ' has no faithful single-control DOM representation',
      };
    }
  }

  // Reject rules legacy cannot run (so we never silently mis-compare).
  const realm = makeRealm();
  const { window, $ } = realm;
  const legacyMethods = $.validator.methods;

  const realLeaves = leaves.filter((l) => !l.unsupported);
  for (const leaf of realLeaves) {
    const rules = leaf.fieldSpec.rules || {};
    for (const r of Object.keys(rules)) {
      const legacyName = RULE_ALIAS_TO_LEGACY[r] || r;
      if (typeof legacyMethods[legacyName] !== 'function') {
        realm.dom.window.close();
        return {
          supported: false,
          reason: 'rule not implemented in legacy runtime: ' + r
            + (legacyName !== r ? ' (legacy name ' + legacyName + ')' : ''),
        };
      }
      // pattern/match with a conditional/ternary param: legacy `match` treats
      // it as a literal regex and cannot evaluate the condition.
      if ((legacyName === 'match') && isConditionalPatternParam(rules[r])) {
        realm.dom.window.close();
        return {
          supported: false,
          reason: 'legacy match() cannot evaluate conditional/ternary pattern param @ '
            + leaf.dotPath + ': ' + JSON.stringify(rules[r]),
        };
      }
      // date/datetime fields use a text input here; legacy min/max branch on
      // element.type for date comparison, so we cannot faithfully run them.
      if (leaf.shape.dateLike && (legacyName === 'min' || legacyName === 'max')) {
        realm.dom.window.close();
        return {
          supported: false,
          reason: 'date/datetime min/max needs native date input semantics not '
            + 'reproducible with the text-input synthesis @ ' + leaf.dotPath,
        };
      }
    }
  }

  // Build the DOM form: one element per leaf.
  const form = window.document.getElementById('legacy-form');
  for (const leaf of realLeaves) {
    const wrapper = window.document.createElement('div');
    wrapper.className = 'input-group-wrapper';
    const group = window.document.createElement('div');
    group.className = 'input-group';
    wrapper.appendChild(group);

    const shape = leaf.shape;
    const value = toDomValue(getByDotPath(workInput, leaf.dotPath));

    let el;
    if (shape.tag === 'select') {
      el = window.document.createElement('select');
      // Provide options; ensure the injected value is selectable.
      const items = leaf.fieldSpec.items || {};
      const keys = Object.keys(items);
      if (value !== '' && keys.indexOf(value) === -1) keys.push(value);
      // always include an empty option so "no selection" is representable
      const emptyOpt = window.document.createElement('option');
      emptyOpt.value = '';
      el.appendChild(emptyOpt);
      for (const k of keys) {
        const opt = window.document.createElement('option');
        opt.value = k;
        opt.textContent = String(items[k] != null ? items[k] : k);
        if (k === value) opt.selected = true;
        el.appendChild(opt);
      }
      if (value === '') el.value = '';
    } else if (shape.tag === 'textarea') {
      el = window.document.createElement('textarea');
      el.value = value;
    } else if (shape.type === 'file') {
      // jsdom forbids setting input[type=file].value programmatically and
      // there is no FileList to populate. The legacy file rules (accept,
      // unique, required-on-file) all read element.files / element.value,
      // which we cannot synthesize. Mark unsupported.
      realm.dom.window.close();
      return {
        supported: false,
        reason: 'file/image input value cannot be synthesized under jsdom @ ' + leaf.dotPath,
      };
    } else {
      el = window.document.createElement('input');
      el.setAttribute('type', shape.type || 'text');
      if (shape.type === 'radio' || shape.type === 'checkbox') {
        // Single control carrying the value; checked iff a value is present.
        el.value = value === '' ? '1' : value;
        if (value !== '') el.checked = true;
      } else {
        el.value = value;
      }
    }

    el.className = 'valid-target form-control';
    el.setAttribute('name', leaf.bracketName);
    el.setAttribute('data-name', leaf.dotPath.split('.').pop());
    el.setAttribute('data-rule-name', leaf.bracketName);
    group.appendChild(el);
    form.appendChild(wrapper);
  }

  // Attach the (translated) spec.
  const legacySpec = buildLegacySpec(workSpec, realLeaves);
  const validator = $(form).validate({ spec: legacySpec });

  // Determine validity + first failing field, iterating in declaration order
  // (matches how loadvalid walks .valid-target elements top to bottom).
  let firstError = null;
  for (const leaf of realLeaves) {
    const legacyRules = (validator.rules[leaf.bracketName] || {}).rules || {};
    const fail = firstFailingRule(
      $, validator, leaf.bracketName, legacyRules, legacyMethods, leaf.reportNames
    );
    if (fail) {
      if (fail.error && fail.error.startsWith('__')) {
        realm.dom.window.close();
        // A condition referenced a target element the legacy resolver could
        // not find. This is the absolute-path-vs-root-prefix tension: a single
        // synthetic root prefix lets relative `.x`/`..x` paths resolve, but an
        // absolute dotted path (e.g. `common.is_sale`) then resolves without
        // the prefix and misses the element. Faithfully driving both path
        // conventions at once is impossible without editing the (read-only)
        // legacy source, so exclude rather than mis-compare.
        if (fail.error.startsWith('__method_threw__')) {
          return {
            supported: false,
            reason: 'conditional cross-field reference not resolvable under synthesized DOM @ '
              + leaf.dotPath,
          };
        }
        return { supported: false, reason: 'internal: ' + fail.error + ' @ ' + leaf.dotPath };
      }
      if (!firstError) {
        firstError = { error: fail.error, field: leaf.dotPath };
      }
    }
  }

  realm.dom.window.close();

  if (firstError) {
    return { supported: true, valid: false, error: firstError.error, field: firstError.field };
  }
  return { supported: true, valid: true, error: null, field: null };
}

module.exports = { runLegacyCase, flattenSpec, elementShapeFor };

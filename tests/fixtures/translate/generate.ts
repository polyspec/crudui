/**
 * legacy→CRUDUI translator shared-fixture generator (SPEC §6 round-trip gate).
 *
 * Produces `cases.json`: one case per analysis `fixture_ideas` entry. Each case
 * is the legacy input, the translator's REAL CRUDUI output (never hand-written), the
 * irreversibility note log, and the round-trip verdict.
 *
 * SCOPE — this translator is a JS-only, build-time, R7-transitional tool. It is
 * NOT one of the 4-language runtimes: the bit-for-bit 4-language idempotence
 * guarantee (PHP/Go/Rust/JS reproducing the same result) covers only VALIDATION
 * and RENDER. Legacy legacy→CRUDUI migration is a one-way JS-only step run during the R7
 * transition, not a per-language runtime contract. `cases.json` is the JS
 * translator's frozen output (the cross-language fixtures it feeds are the
 * already-migrated CRUDUI specs, validated/rendered by all four engines).
 *
 * Two case families (the analysis roundtrip_rule split):
 *   - reversible cases: `legacy → CRUDUI → legacy` MUST equal the original bit-for-bit. The
 *     fixture records `roundtrip: { reversible:true, lossless:true }`.
 *   - irreversible (R7 transcend) cases: at least one absorption fires; the
 *     round-trip is OUTSIDE the gate. The fixture records the note(s) and
 *     `roundtrip: { reversible:false }` — losslessness is NOT asserted (we do not
 *     sacrifice CRUDUI for the translator).
 *
 * Every emitted CRUDUI spec is also asserted to carry ZERO forbidden meta keys (the
 * recursive forbidden-scan over the translated properties) — the translator must
 * never emit a meta key.
 *
 * Regenerate (from repo root):
 *   node_modules/.bin/tsx tests/fixtures/translate/generate.ts > tests/fixtures/translate/cases.json
 */

import {
  translateFromLegacy,
  translateToLegacy,
  deepEqual,
} from '../../../packages/validator-js/src/legacy/translate/index';
import { scanForbiddenKeys } from '../../../packages/validator-js/src/forbidden-scan';

interface CaseSpec {
  name: string;
  note: string;
  legacy: Record<string, unknown>;
  /** Expected reversibility (asserted against the real translator). */
  reversible: boolean;
}

// ---------------------------------------------------------------------------
// Cases — one per analysis fixture_ideas entry (single truth).
// ---------------------------------------------------------------------------

const SPECS: CaseSpec[] = [
  // 1. display_target simple, sibling items map (reversible 1:1 target).
  {
    name: 'display-target-simple',
    note: "b.display_target_condition_style → b.design.show {'.a==1':true, true:false}; sibling items map preserved; round-trips 1:1.",
    legacy: {
      type: 'group',
      properties: {
        a: { type: 'choice', items: { 0: '아니오', 1: '예' } },
        b: {
          type: 'text',
          display_target: '.a',
          display_target_condition_style: { 1: 'display:block', 0: 'display:none' },
        },
      },
    },
    reversible: true,
  },

  // 1b. display_target ISOLATED on a leaf (reversible, no sibling items noise).
  {
    name: 'display-target-condition-style-leaf',
    note: "Single field: display_target + condition_style → design.show boolean condition map; legacy→schema→legacy lossless.",
    legacy: {
      type: 'text',
      display_target: '.is_season_price',
      display_target_condition_style: { 1: 'display:block', 0: 'display:none' },
    },
    reversible: true,
  },

  // 2. display_switch annihilation (irreversible).
  {
    name: 'display-switch-annihilation',
    note: 'is_company.display_switch distributes to company_name/individual_name design.show; switch/onchange/ready annihilated (irreversible).',
    legacy: {
      type: 'group',
      properties: {
        is_company: {
          type: 'choice',
          display_switch: { 1: ['company_name'], 0: ['individual_name'] },
          onchange: 'recalc()',
        },
        company_name: { type: 'text' },
        individual_name: { type: 'text' },
      },
    },
    reversible: false,
  },

  // 3. appearance node map (reversible).
  {
    name: 'design-node-map',
    note: 'class/label_class/group_class/wrapper_class/prepend_class → design node map; round-trips.',
    legacy: {
      type: 'text',
      class: 'form-control',
      label_class: 'fw-bold',
      group_class: 'row',
      wrapper_class: 'w',
      prepend_class: 'p',
    },
    reversible: true,
  },

  // 4. validate reversible (named + index rules).
  {
    name: 'validate-mixed-rules',
    note: 'rules{required,minlength,maxlength,match,email} → validate; named + index rules round-trip.',
    legacy: {
      type: 'text',
      rules: { required: true, minlength: 2, maxlength: 10, match: '/^[0-9]+$/', email: true },
    },
    reversible: true,
  },

  // 5. conditional required (expression passthrough, reversible).
  {
    name: 'conditional-required-expression',
    note: "rules.required expression → validate.required identical string (G1 passthrough); round-trips.",
    legacy: {
      type: 'text',
      rules: { required: 'rooms.*.peoples.*.is_season_price && .choice_yoil_price == 1' },
    },
    reversible: true,
  },

  // 6. behavior opaque passthrough (reversible). Scripts are opaque strings —
  //    the CRUDUI BehaviorAction is string | {label,script}, never a bare boolean.
  {
    name: 'behavior-opaque',
    note: 'onchange/onclick/onload → behavior; opaque script strings round-trip (BehaviorAction = string|{label,script}).',
    legacy: {
      type: 'text',
      onchange: 'console.log(1)',
      onclick: 'f()',
      onload: 'init()',
    },
    reversible: true,
  },

  // 7. lang dimension (reversible).
  {
    name: 'lang-dimension',
    note: 'lang:append + langs + lang_name + remove_lang_title + lang_group_class → lang bucket; round-trips.',
    legacy: {
      type: 'text',
      lang: 'append',
      langs: ['ko', 'en'],
      lang_name: '언어팩',
      remove_lang_title: true,
      lang_group_class: 'g',
    },
    reversible: true,
  },

  // 8. multiple dimension (reversible canonical keys).
  {
    name: 'multiple-dimension',
    note: 'multiple/multiple_max/sortable/add_buttons/multiple_button_onclick → multiple bucket; round-trips.',
    legacy: {
      type: 'text',
      multiple: true,
      multiple_max: 5,
      sortable: true,
      add_buttons: true,
      multiple_button_onclick: 'g()',
    },
    reversible: true,
  },

  // 9. composition $merge/$remove → $patch (irreversible).
  {
    name: 'compose-patch-absorption',
    note: 'properties.$ref reversible; $change/$remove absorbed into $patch (op identity lost, irreversible).',
    legacy: {
      type: 'group',
      properties: {
        $ref: 'Base.yml',
        $change: { 'price.rules.required': '.x == 1' },
        $remove: ['old'],
      },
    },
    reversible: false,
  },

  // 10. options type-dependent (reversible).
  {
    name: 'options-type-dependent',
    note: 'image type keys (width/height/ratio/cover/fileserver) → options; core uninvolved; round-trips.',
    legacy: {
      type: 'image',
      width: 300,
      height: 200,
      ratio: '1:1',
      cover: true,
      fileserver: 's3',
    },
    reversible: true,
  },

  // 11. x{key} strip (irreversible, zero x* in canonical).
  {
    name: 'xkey-strip',
    note: 'xclass/xstyle/xonchange stripped; design.class kept; canonical has zero x* (irreversible).',
    legacy: {
      type: 'text',
      class: 'a',
      xclass: 'old',
      xstyle: 'q',
      xonchange: 'z',
    },
    reversible: false,
  },

  // 12. items polymorphic — static map (reversible).
  {
    name: 'items-static',
    note: 'static items value→label map preserved; round-trips.',
    legacy: {
      type: 'choice',
      items: { 0: '개인', 1: '기업' },
    },
    reversible: true,
  },

  // 12b. items dynamic source (reversible).
  {
    name: 'items-dynamic-source',
    note: 'scattered model/method/table dynamic-source keys reclaimed under items; round-trips.',
    legacy: {
      type: 'select',
      model: 'Foo',
      method: 'bar',
      table: 't',
    },
    reversible: true,
  },

  // 13. messages gap (irreversible — out of scope, no CRUDUI slot).
  {
    name: 'messages-gap',
    note: 'rules.required converts; messages has NO schema slot — reported as a gap (no new decision, irreversible).',
    legacy: {
      type: 'text',
      rules: { required: true },
      messages: { ko: { required: '* 필수' } },
    },
    reversible: false,
  },

  // 14. multiple:only fold (irreversible).
  {
    name: 'multiple-only-fold',
    note: 'multiple:only folded into multiple:true (mode lost, irreversible).',
    legacy: {
      type: 'text',
      multiple: 'only',
    },
    reversible: false,
  },

  // 15. SPEC-unenumerated node class (irreversible — node not named).
  {
    name: 'node-not-enumerated',
    note: 'fieldset_class targets a node the SPEC map does not enumerate (out of scope, irreversible).',
    legacy: {
      type: 'group',
      fieldset_class: 'border',
      properties: { a: { type: 'text' } },
    },
    reversible: false,
  },

  // 16. PeopleUnitPrice-flavored verbose case (irreversible by display_switch + $change).
  {
    name: 'verbose-people-unit-price',
    note: 'Mixed display_switch fan + $change deep paths — verbose stays verbose (SPEC §7: schema does not magic-simplify); irreversible.',
    legacy: {
      type: 'group',
      properties: {
        choice_yoil_price: {
          type: 'choice',
          display_switch: { 1: ['mon_price', 'tue_price'], 0: [] },
        },
        mon_price: { type: 'number' },
        tue_price: { type: 'number' },
        $change: { 'mon_price.rules.required': '.choice_yoil_price == 1' },
      },
    },
    reversible: false,
  },

  // 17. fully-reversible passthrough (the bit-identity baseline).
  {
    name: 'passthrough-first-class',
    note: 'label/description/placeholder/name/type/default passthrough unchanged; round-trips.',
    legacy: {
      type: 'text',
      name: 'email',
      label: { ko: '이메일', en: 'Email' },
      description: '설명',
      placeholder: 'you@example.com',
      default: '',
    },
    reversible: true,
  },

  // 18. BUG 1 — property-bearing node without type → inject type:group
  //     (Field.required=[type]). Root and nested group both gain type:group.
  {
    name: 'bug1-type-group-injected',
    note: 'BUG1: root + nested group carry properties but no type → type:group injected so Field.required=[type] holds (adds a key absent in legacy → out of gate).',
    legacy: {
      properties: {
        addr: {
          properties: {
            zip: { type: 'text' },
          },
        },
        name: { type: 'text' },
      },
    },
    reversible: false,
  },

  // 19. BUG 2 — display_target_condition_class:null must NOT clobber the
  //     original design.class (class/input_class survives).
  {
    name: 'bug2-condition-class-null-preserves-class',
    note: 'BUG2: display_target_condition_class:null → no condition map built; original class is preserved in design.class (not clobbered to {}).',
    legacy: {
      type: 'text',
      class: 'form-control',
      display_target: '.a',
      display_target_condition_class: null,
    },
    reversible: false,
  },

  // 20. BUG 3 — x{key} FIELD NAME (xbanners[]) in a properties map is stripped
  //     like an x-comment value key.
  {
    name: 'bug3-xkey-field-name-strip',
    note: 'BUG3: x-prefixed field names (xbanners[], xnote) stripped from properties; real siblings survive (irreversible).',
    legacy: {
      type: 'group',
      properties: {
        'xbanners[]': { type: 'text' },
        xnote: { type: 'text' },
        banners: { type: 'text' },
      },
    },
    reversible: false,
  },

  // 21. BUG 4 — nested legacy field spec inside $patch/$change is recursively
  //     translated; no legacy/forbidden key (display_target) leaks verbatim.
  {
    name: 'bug4-patch-nested-recursive-translate',
    note: 'BUG4: $change payload carries a nested legacy field spec (display_target/class) → recursively translated to design.show/design.class; no forbidden key leaks.',
    legacy: {
      type: 'group',
      properties: {
        $change: {
          'rooms.0': {
            type: 'text',
            class: 'c',
            display_target: '.a',
            display_target_condition_style: { 1: 'display:block', 0: 'display:none' },
          },
        },
      },
    },
    reversible: false,
  },

  // 22. BUG 5 — boolean behavior flag (onload:true) is NOT a CRUDUI BehaviorAction
  //     (string|{label,script}); the flag is dropped, real scripts survive.
  {
    name: 'bug5-behavior-boolean-flag-normalize',
    note: 'BUG5: onload:true boolean flag dropped (BehaviorAction is string|{label,script}); onchange script string survives in behavior.',
    legacy: {
      type: 'text',
      onload: true,
      onchange: 'recalc()',
    },
    reversible: false,
  },

  // 23. BUG 6 — a lone form/field-level method (HTTP verb) is NOT an items
  //     dynamic source; it lands in options. With a model anchor it IS a source.
  {
    name: 'bug6-method-http-verb-not-items-source',
    note: 'BUG6: lone method (no model/table/relations/items sibling) is a form/field HTTP verb → options.method, NOT items.method.',
    legacy: {
      type: 'text',
      method: 'post',
    },
    reversible: true,
  },
  {
    name: 'bug6-method-with-model-is-items-source',
    note: 'BUG6: method alongside a model anchor IS an items dynamic source → items.{model,method}.',
    legacy: {
      type: 'select',
      model: 'Foo',
      method: 'bar',
    },
    reversible: true,
  },

  // 24. BUG 7 — empty Content (description:null) is dropped (= absent key); no
  //     empty content node is emitted.
  {
    name: 'bug7-content-null-drop',
    note: 'BUG7: description:null / help:null dropped (empty content = no key); real label survives.',
    legacy: {
      type: 'text',
      label: '이름',
      description: null,
      help: null,
    },
    reversible: false,
  },
];

// ---------------------------------------------------------------------------
// Run the JS reference translator for real; emit cases + assert invariants.
// ---------------------------------------------------------------------------

interface OutCase {
  name: string;
  note: string;
  legacy: Record<string, unknown>;
  schema: Record<string, unknown>;
  notes: { path: string; legacyKey: string; reason: string; detail: string }[];
  roundtrip: { reversible: boolean; lossless?: boolean; back?: Record<string, unknown> };
}

const out: OutCase[] = SPECS.map((c) => {
  const { schema, notes } = translateFromLegacy(c.legacy);

  // INVARIANT 1: the translated output carries ZERO forbidden meta keys at any
  // depth. The translator must never emit a meta key (the whole point of CRUDUI).
  scanForbiddenKeys(schema, [c.name]);

  const reversible = notes.length === 0;

  // INVARIANT 2: the declared reversibility matches the real note log.
  if (reversible !== c.reversible) {
    throw new Error(
      `${c.name}: declared reversible=${c.reversible} but translator logged ${notes.length} note(s) (reversible=${reversible}). Notes: ${JSON.stringify(notes)}`
    );
  }

  const oc: OutCase = {
    name: c.name,
    note: c.note,
    legacy: c.legacy,
    schema,
    notes,
    roundtrip: { reversible },
  };

  if (reversible) {
    // INVARIANT 3 (the SPEC §6 gate): legacy→CRUDUI→legacy = original bit-for-bit.
    const back = translateToLegacy(schema);
    const lossless = deepEqual(c.legacy, back);
    if (!lossless) {
      throw new Error(
        `${c.name}: reversible case is NOT lossless. back=${JSON.stringify(back)} vs legacy=${JSON.stringify(c.legacy)}`
      );
    }
    oc.roundtrip.lossless = true;
    oc.roundtrip.back = back;
  }

  return oc;
});

const losslessCount = out.filter((c) => c.roundtrip.reversible).length;
const transcendCount = out.length - losslessCount;
process.stderr.write(
  `translate fixtures: ${out.length} cases — ${losslessCount} reversible (lossless round-trip), ${transcendCount} R7-transcend (out of gate)\n`
);

process.stdout.write(JSON.stringify(out, null, 2) + '\n');

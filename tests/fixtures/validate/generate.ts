/**
 * Shared-fixture generator for the 4-language CRUDUI validator (SPEC §2 pipeline).
 *
 * Runs the JS reference CRUDUI validator for real and dumps, per case, the
 * validation result (`expected = { valid, errors }`) or the load-error code
 * (`expectLoadError = { code }`) when composition cannot be resolved. The other
 * three engines (PHP / Go / Rust) load the SAME `cases.json` and must reproduce
 * it bit-for-bit (SPEC G-B 4-language idempotence: identical `valid`+errors).
 *
 * Each case is authored against the analysis (single truth) and VALIDATION-
 * RULES.md (the 1074 idempotence baseline). The JS engine GENERATES the
 * expected output; the adjacent conformance test RE-VERIFIES the JS engine
 * still reproduces it (a guard against silent drift), and the sibling engines
 * prove cross-language equality.
 *
 * Fixture format (per the task contract):
 *   { name, spec, data, expected: { valid, errors } }      — validation result
 *   { name, spec, data, expectLoadError: { code } }        — compose load error
 *
 * `spec`   : a CRUDUI root spec. Inline `{ type:'group', properties:{…} }`, or a
 *            composition entry (`files` + `$ref`/`$patch`).
 * `files`  : optional virtual file set `$ref` resolves against (`{ key: doc }`).
 * `data`   : the form data validated against the (composed) spec.
 * `expected`: `{ valid, errors[] }` — first-error-per-field, declaration order.
 * `expectLoadError`: `{ code }` — the ComposeLoadError.code thrown by compose.
 *
 * Regenerate (from repo root):
 *   node_modules/.bin/tsx tests/fixtures/validate/generate.ts > tests/fixtures/validate/cases.json
 */

import {
  validate,
  ComposeLoadError,
} from '../../../packages/validator-ts/src/validate/index';

interface CaseSpec {
  name: string;
  note: string;
  spec: Record<string, unknown>;
  files?: Record<string, Record<string, unknown>>;
  data: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Cases — one per fixture_ideas entry in the analysis (single truth).
// ---------------------------------------------------------------------------

const SPECS: CaseSpec[] = [
  ...[false, true].flatMap(enabled => [5, 8].map(value => ({
    name: `ternary-field-limit-${enabled}-${value}`,
    note: 'The selected ternary branch resolves a field value as the validation limit.',
    spec: { type: 'group', properties: {
      value: { type: 'text', validate: { min: '.enabled ? .limit : 0' } },
    } },
    data: { enabled, limit: 7, value: String(value) },
  }))),
  ...[false, true].map(selected => ({
    name: `ternary-nested-true-limit-${selected}`,
    note: 'The nested true branch resolves a field value through the expression AST.',
    spec: { type: 'group', properties: {
      value: { type: 'text', validate: { min: '.enabled ? .selected ? .limit : 0 : 0' } },
    } },
    data: { enabled: true, selected, limit: 7, value: '5' },
  })),

{
  "name": "items-langmap-4lang-membership-valid",
  "note": "G3 — in: value→label map with 4-language labels {ko,en,ja,zh}; value '1' is a key, valid (a 4-lang label is display-only, never a member)",
  "spec": {
    "type": "group",
    "properties": {
      "toggle": {
        "type": "select",
        "validate": {
          "in": {
            "0": {
              "ko": "미사용",
              "en": "Off",
              "ja": "オフ",
              "zh": "关闭"
            },
            "1": {
              "ko": "사용",
              "en": "On",
              "ja": "オン",
              "zh": "开启"
            }
          }
        }
      }
    }
  },
  "data": {
    "toggle": "1"
  }
},
{
  "name": "items-langmap-4lang-membership-invalid",
  "note": "G3 — in: 4-language value→label map; value 'オン' (a ja label, not a key) fails — the label is never a member in any of the 4 languages",
  "spec": {
    "type": "group",
    "properties": {
      "toggle": {
        "type": "select",
        "validate": {
          "in": {
            "0": {
              "ko": "미사용",
              "en": "Off",
              "ja": "オフ",
              "zh": "关闭"
            },
            "1": {
              "ko": "사용",
              "en": "On",
              "ja": "オン",
              "zh": "开启"
            }
          }
        }
      }
    }
  },
  "data": {
    "toggle": "オン"
  }
},
{
  "name": "items-4lang-null-label-slot-membership",
  "note": "G3 — in: 4-language map where key '2' has a partial-null label slot ({ko,en,ja:null,zh}) and key '4' has a fully null label; both keys stay valid members (a null label slot has no membership effect)",
  "spec": {
    "type": "group",
    "properties": {
      "opt": {
        "type": "select",
        "validate": {
          "in": {
            "1": {
              "ko": "하나",
              "en": "One",
              "ja": "一",
              "zh": "一"
            },
            "2": {
              "ko": "둘",
              "en": "Two",
              "ja": null,
              "zh": "二"
            },
            "3": {
              "ko": "셋",
              "en": "Three",
              "ja": "三",
              "zh": "三"
            },
            "4": null
          }
        }
      }
    }
  },
  "data": {
    "opt": "2"
  }
},
{
  "name": "items-4lang-fully-null-label-membership",
  "note": "G3 — the fully null label key '4' of the same 4-language map is still a valid member (null content == absent, no validate effect)",
  "spec": {
    "type": "group",
    "properties": {
      "opt": {
        "type": "select",
        "validate": {
          "in": {
            "1": {
              "ko": "하나",
              "en": "One",
              "ja": "一",
              "zh": "一"
            },
            "2": {
              "ko": "둘",
              "en": "Two",
              "ja": null,
              "zh": "二"
            },
            "3": {
              "ko": "셋",
              "en": "Three",
              "ja": "三",
              "zh": "三"
            },
            "4": null
          }
        }
      }
    }
  },
  "data": {
    "opt": "4"
  }
},
{
  "name": "null-content-4lang-no-validate-effect",
  "note": "G3 — label:null plus a 4-language content map with a null slot ({ko,en,ja:null,zh}) have no validate effect; required still fires on an empty value",
  "spec": {
    "type": "group",
    "properties": {
      "nickname": {
        "type": "text",
        "label": null,
        "description": {
          "ko": "별명",
          "en": "Nickname",
          "ja": null,
          "zh": "昵称"
        },
        "validate": {
          "required": true
        }
      }
    }
  },
  "data": {
    "nickname": ""
  }
},

  {
    name: 'keyed-scalar-email-errors',
    note: 'Repeated scalar errors preserve sorted row keys.',
    spec: { type: 'group', properties: { emails: { type: 'email', multiple: true, validate: { email: true } } } },
    data: { emails: { __0000000000002__: 'invalid-b', __0000000000001__: 'invalid-a' } },
  },
  {
    name: 'keyed-scalar-unique',
    note: 'Collection uniqueness checks keyed scalar values.',
    spec: { type: 'group', properties: { tags: { type: 'text', multiple: true, validate: { unique: true } } } },
    data: { tags: { __0000000000002__: 'same', __0000000000001__: 'same' } },
  },
  {
    name: 'keyed-scalar-mincount',
    note: 'Collection size uses keyed row count.',
    spec: { type: 'group', properties: { tags: { type: 'text', multiple: true, validate: { mincount: 2 } } } },
    data: { tags: { __0000000000001__: 'one' } },
  },
  {
    name: 'keyed-group-unique-filter',
    note: 'Unique filters evaluate the original key path for each row.',
    spec: { type: 'group', properties: { rows: {
      type: 'group', multiple: true, validate: { unique: '.enabled == 1' },
      properties: { name: { type: 'text' }, enabled: { type: 'number' } },
    } } },
    data: { rows: { second: { name: 'same', enabled: 1 }, first: { name: 'same', enabled: 1 }, ignored: { name: 'same', enabled: 0 } } },
  },
  {
    name: 'nested-company-store-key-errors',
    note: 'Company and store can share a key; errors retain the complete nested path.',
    spec: { type: 'group', properties: { companies: { type: 'group', multiple: true, properties: {
      stores: { type: 'group', multiple: true, properties: { name: { type: 'text', validate: { required: true } } } },
    } } } },
    data: { companies: { __0000000000001__: { stores: { __0000000000001__: { name: '' }, __0000000000002__: { name: 'ok' } } } } },
  },
  // 1. Conditional required — true branch (subscribe truthy → required fires).
  {
    name: 'conditional-required-true',
    note: "required:'.subscribe' fires when subscribe is truthy and value empty",
    spec: {
      type: 'group',
      properties: {
        subscribe: { type: 'checkbox' },
        email: { type: 'email', validate: { required: '.subscribe' } },
      },
    },
    data: { subscribe: true, email: '' },
  },
  // 2. Conditional required — false branch (condition falsy → rule disabled).
  {
    name: 'conditional-required-false',
    note: "required:'.subscribe' is disabled when subscribe is falsy",
    spec: {
      type: 'group',
      properties: {
        subscribe: { type: 'checkbox' },
        email: { type: 'email', validate: { required: '.subscribe' } },
      },
    },
    data: { subscribe: false, email: '' },
  },
  // 3. Condition map rule value — VIP branch (min:10) fails.
  {
    name: 'condition-map-min-vip',
    note: "min:{'.vip':10, true:1} → first-truthy key picks 10 for a VIP",
    spec: {
      type: 'group',
      properties: {
        vip: { type: 'checkbox' },
        qty: { type: 'number', validate: { min: { '.vip': 10, true: 1 } } },
      },
    },
    data: { vip: true, qty: 5 },
  },
  // 4. Condition map rule value — default branch (min:1) passes.
  {
    name: 'condition-map-min-default',
    note: "min:{'.vip':10, true:1} → default key picks 1 for a non-VIP",
    spec: {
      type: 'group',
      properties: {
        vip: { type: 'checkbox' },
        qty: { type: 'number', validate: { min: { '.vip': 10, true: 1 } } },
      },
    },
    data: { vip: false, qty: 5 },
  },
  // 5. Ternary value-return — premium branch (min:10) fails.
  {
    name: 'ternary-min-premium',
    note: "min:'.is_premium == 1 ? 10 : 1' evaluates the branch to 10",
    spec: {
      type: 'group',
      properties: {
        is_premium: { type: 'number' },
        quantity: {
          type: 'number',
          validate: { min: '.is_premium == 1 ? 10 : 1' },
        },
      },
    },
    data: { is_premium: 1, quantity: 5 },
  },
  // 6. Ternary value-return — non-premium branch (min:1) passes.
  {
    name: 'ternary-min-nonpremium',
    note: "min ternary evaluates to 1 when is_premium != 1",
    spec: {
      type: 'group',
      properties: {
        is_premium: { type: 'number' },
        quantity: {
          type: 'number',
          validate: { min: '.is_premium == 1 ? 10 : 1' },
        },
      },
    },
    data: { is_premium: 0, quantity: 5 },
  },
  // 7. Composed spec — $ref base + $patch adds an email rule; data fails it.
  {
    name: 'compose-ref-patch-email',
    note: '$ref base (required) + $patch adds email rule; "bad" fails email',
    files: {
      'Base.yml': {
        properties: {
          email: { type: 'email', validate: { required: true } },
        },
      },
    },
    spec: { $ref: 'Base.yml', $patch: { 'email.validate.email': true } },
    data: { email: 'bad' },
  },
  // 8. Unresolved $ref — compose LOAD ERROR (never valid:true).
  {
    name: 'compose-unresolved-ref-load-error',
    note: 'missing $ref file is a ComposeLoadError, not valid:true (873 lock)',
    spec: { $ref: 'Missing.yml' },
    data: {},
  },
  // 9. Nested group — empty zip → required (first), then digits on the next data.
  {
    name: 'nested-group-required',
    note: 'addr.zip required fires for empty nested value',
    spec: {
      type: 'group',
      properties: {
        addr: {
          type: 'group',
          properties: {
            zip: { validate: { required: true, digits: true } },
          },
        },
      },
    },
    data: { addr: { zip: '' } },
  },
  // 10. Nested group — non-empty non-digit zip → digits fires (required passes).
  {
    name: 'nested-group-digits',
    note: 'addr.zip passes required, then digits fires for "abc"',
    spec: {
      type: 'group',
      properties: {
        addr: {
          type: 'group',
          properties: {
            zip: { validate: { required: true, digits: true } },
          },
        },
      },
    },
    data: { addr: { zip: 'abc' } },
  },
  // 11. Multiple non-group — array-level unique fires for a duplicate.
  {
    name: 'multiple-array-level-unique',
    note: 'two equal tags meet mincount:2, then array-level unique fires',
    spec: {
      type: 'group',
      properties: {
        tags: {
          type: 'text',
          multiple: true,
          validate: { mincount: 2, unique: true },
        },
      },
    },
    data: { tags: ['a', 'a'] },
  },
  // 12. Multiple non-group — mincount fires for too-few elements.
  {
    name: 'multiple-array-level-mincount',
    note: 'tags has one element → mincount:2 fires',
    spec: {
      type: 'group',
      properties: {
        tags: {
          type: 'text',
          multiple: true,
          validate: { mincount: 2, unique: true },
        },
      },
    },
    data: { tags: ['a'] },
  },
  // 13. Multiple group — index path items.1.code on the second item.
  {
    name: 'multiple-group-index-path',
    note: 'second item empty code → error path items.1.code',
    spec: {
      type: 'group',
      properties: {
        items: {
          type: 'group',
          multiple: true,
          properties: { code: { validate: { required: true } } },
        },
      },
    },
    data: { items: [{ code: 'x' }, { code: '' }] },
  },
  // 14. Object-key multiple — sorted-key traversal, path rows.__a__.v first.
  {
    name: 'object-key-multiple-sorted-path',
    note: 'object keys sorted → first error rows.__a__.v before rows.__b__.v',
    spec: {
      type: 'group',
      properties: {
        rows: {
          type: 'group',
          multiple: true,
          properties: { v: { validate: { required: true } } },
        },
      },
    },
    data: { rows: { __b__: { v: '' }, __a__: { v: '' } } },
  },
  // 15. type:number implicit check — "Infinity" → rule:number before min.
  {
    name: 'type-number-implicit',
    note: 'type:number runs implicit number first → "Infinity" is rule:number',
    spec: {
      type: 'group',
      properties: { age: { type: 'number', validate: { min: 0 } } },
    },
    data: { age: 'Infinity' },
  },
  // 16. unique filter (condition param) — only active==1 items checked; a
  //     duplicate among inactive items passes.
  {
    name: 'unique-filter-condition-pass',
    note: "unique:'.active == 1' filters; duplicate among inactive items passes",
    spec: {
      type: 'group',
      properties: {
        rows: {
          type: 'group',
          multiple: true,
          properties: {
            active: { type: 'number' },
            code: { validate: { unique: '.active == 1' } },
          },
        },
      },
    },
    data: {
      rows: [
        { active: 0, code: 'dup' },
        { active: 0, code: 'dup' },
      ],
    },
  },
  // 17. unique filter — duplicate among active==1 items fires (item-level).
  {
    name: 'unique-filter-condition-fail',
    note: "unique:'.active == 1' fires for a duplicate among active items",
    spec: {
      type: 'group',
      properties: {
        rows: {
          type: 'group',
          multiple: true,
          properties: {
            active: { type: 'number' },
            code: { validate: { unique: '.active == 1' } },
          },
        },
      },
    },
    data: {
      rows: [
        { active: 1, code: 'dup' },
        { active: 1, code: 'dup' },
      ],
    },
  },
  // 18. Verbatim regex param — match is not evaluated as a condition.
  {
    name: 'match-regex-verbatim',
    note: 'match regex preserved verbatim; "ftp://x" fails ^https?://.+',
    spec: {
      type: 'group',
      properties: {
        url: { type: 'text', validate: { match: '^https?://.+' } },
      },
    },
    data: { url: 'ftp://x' },
  },
  // 19. Verbatim literal param — accept ".jpg" not misread as a field ref.
  {
    name: 'accept-literal-verbatim',
    note: 'accept ".jpg,.png" literal param; a .gif file fails',
    spec: {
      type: 'group',
      properties: {
        photo: { type: 'file', validate: { accept: '.jpg,.png' } },
      },
    },
    data: { photo: 'snapshot.gif' },
  },
  // 20. design.show does NOT skip validation (SPEC R1 show/validate split).
  {
    name: 'design-show-does-not-skip',
    note: 'design.show hidden field still validates (R1 — visibility != validation)',
    spec: {
      type: 'group',
      properties: {
        x: { type: 'text', design: { show: '.flag' }, validate: { required: true } },
      },
    },
    data: { flag: false, x: '' },
  },
  // 21. First-error-per-field — required fires; email never evaluated.
  {
    name: 'first-error-per-field',
    note: 'required+email; empty value → only required (email not reached)',
    spec: {
      type: 'group',
      properties: {
        email: { type: 'email', validate: { required: true, email: true } },
      },
    },
    data: { email: '' },
  },
  // 22. Empty value skips email (no required) → valid:true.
  {
    name: 'empty-skips-email',
    note: 'email rule only (no required); empty value passes (blank skip)',
    spec: {
      type: 'group',
      properties: { email: { type: 'email', validate: { email: true } } },
    },
    data: { email: '' },
  },
  // 23. Message override — custom required message wins.
  {
    name: 'message-override-required',
    note: 'field messages.required overrides the default message',
    spec: {
      type: 'group',
      properties: {
        name: {
          type: 'text',
          validate: { required: true },
          messages: { required: 'Name please' },
        },
      },
    },
    data: { name: '' },
  },
  // 24. Unregistered rule is skipped (no error) — VALIDATION-RULES common §4.
  {
    name: 'unregistered-rule-skipped',
    note: 'an unknown rule name produces no error; the field is valid',
    spec: {
      type: 'group',
      properties: {
        x: { type: 'text', validate: { no_such_rule: true } },
      },
    },
    data: { x: 'anything' },
  },
  // 25. Slot off (validate:false) — no rules run.
  {
    name: 'validate-slot-off',
    note: 'validate:false turns the slot off; empty value still valid',
    spec: {
      type: 'group',
      properties: { x: { type: 'text', validate: false } },
    },
    data: { x: '' },
  },
  // 26. equalTo path reference — mismatch fires (verbatim field ref param).
  {
    name: 'equalto-mismatch',
    note: "equalTo:'.password' compares to sibling; mismatch fires",
    spec: {
      type: 'group',
      properties: {
        password: { type: 'text' },
        confirm: { type: 'text', validate: { equalTo: '.password' } },
      },
    },
    data: { password: 'secret', confirm: 'other' },
  },
  // 27. equalTo path reference — match passes.
  {
    name: 'equalto-match',
    note: "equalTo:'.password' passes when the values match",
    spec: {
      type: 'group',
      properties: {
        password: { type: 'text' },
        confirm: { type: 'text', validate: { equalTo: '.password' } },
      },
    },
    data: { password: 'secret', confirm: 'secret' },
  },
  // 28. Conditional `in` membership — required-style gating via in expression.
  {
    name: 'conditional-required-in-list',
    note: "required:'.is_display in 2,3' fires only for matching is_display",
    spec: {
      type: 'group',
      properties: {
        is_display: { type: 'number' },
        memo: { type: 'text', validate: { required: '.is_display in 2,3' } },
      },
    },
    data: { is_display: 2, memo: '' },
  },
  // 29. G3 static value→label map (LangMap labels) — membership uses the KEYS;
  // a value equal to a key passes (the multilingual label is display-only).
  {
    name: 'items-langmap-in-membership-valid',
    note: "in: value→label map with {ko,en} labels — value '1' is a key, valid (label not a member)",
    spec: {
      type: 'group',
      properties: {
        toggle: {
          type: 'select',
          validate: {
            in: {
              '0': { ko: '미사용', en: 'Off' },
              '1': { ko: '사용', en: 'On' },
            },
          },
        },
      },
    },
    data: { toggle: '1' },
  },
  // 30. G3 static value→label map (LangMap labels) — a value that is NOT a key
  // fails `in`; the multilingual label text is never an allowed value.
  {
    name: 'items-langmap-in-membership-invalid',
    note: "in: value→label map with {ko,en} labels — value '미사용' (a label, not a key) fails",
    spec: {
      type: 'group',
      properties: {
        toggle: {
          type: 'select',
          validate: {
            in: {
              '0': { ko: '미사용', en: 'Off' },
              '1': { ko: '사용', en: 'On' },
            },
          },
        },
      },
    },
    data: { toggle: '미사용' },
  },
  // 31. G3 static value→label map (string labels) — membership still uses KEYS;
  // value '2' is a key (its display label is plain string, not a member).
  {
    name: 'items-string-label-in-membership-valid',
    note: "in: value→label map with string labels — value '2' is a key, valid",
    spec: {
      type: 'group',
      properties: {
        grade: {
          type: 'select',
          validate: {
            in: { '1': 'Bronze', '2': 'Silver', '3': 'Gold' },
          },
        },
      },
    },
    data: { grade: '2' },
  },
  // 32. G3 static value→label map with a NULL label slot — the empty label has
  // no membership effect; its key '2' is still a valid member.
  {
    name: 'items-langmap-null-label-membership',
    note: "in: value→label map where key '2' has a null label — '2' is still a valid member (null label no effect)",
    spec: {
      type: 'group',
      properties: {
        opt: {
          type: 'select',
          validate: {
            in: {
              '1': { ko: '하나', en: 'One' },
              '2': null,
              '3': { ko: '셋', en: 'Three' },
            },
          },
        },
      },
    },
    data: { opt: '2' },
  },
  // 33. G3 null content — a field whose label is null (and a null LangMap slot
  // on another field) validates exactly as if the content were absent.
  {
    name: 'null-content-no-validate-effect',
    note: 'label:null and a null LangMap slot have no effect — required still fires on empty value',
    spec: {
      type: 'group',
      properties: {
        nickname: {
          type: 'text',
          label: null,
          description: { ko: '별명', en: null },
          validate: { required: true },
        },
      },
    },
    data: { nickname: '' },
  },
];

// ---------------------------------------------------------------------------
// Run the JS reference engine and emit the fixture.
// ---------------------------------------------------------------------------

function build(c: CaseSpec): Record<string, unknown> {
  const base: Record<string, unknown> = {
    name: c.name,
    note: c.note,
    spec: c.spec,
  };
  if (c.files) {
    base.files = c.files;
  }
  base.data = c.data;

  try {
    const result = validate(c.spec, c.data, c.files ? { files: c.files } : {});
    base.expected = result;
  } catch (e) {
    if (e instanceof ComposeLoadError) {
      base.expectLoadError = { code: e.code };
    } else {
      throw e;
    }
  }
  return base;
}

const out = SPECS.map(build);
process.stdout.write(JSON.stringify(out, null, 2) + '\n');

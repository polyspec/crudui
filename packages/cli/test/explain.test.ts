/**
 * `crudui explain` — spec → natural-language back-check (SKILL §1g loop exit).
 *
 * explain reverses a composed spec into prose so the author can diff it against
 * the source 기획서. It invents no interpretation rules: every sentence is built
 * from the describe catalog (type→widget meaning, validate rule→"필수"/"이메일
 * 형식", expression `required`→"~일 때 필수", lang→"다국어(ko/en)", multiple→
 * "반복", items→"동적/정적 선택지"). These tests pin that EVERY first-class field,
 * condition, and multilingual dimension of the input surfaces in the prose —
 * otherwise the back-check can miss a planning-doc gap (the whole point of §1g).
 *
 * Representative spec (the task's exemplar): email required + conditional
 * required ".subscribe == '1'" + lang.only:[ko,en] title + multiple.
 */

import { describe as descTest, it, expect } from 'vitest';

import { explainSpec } from '../src/explain.ts';

// The exemplar spec, in the parsed (object) form explain receives.
const SPEC = {
  type: 'group',
  properties: {
    subscribe: {
      type: 'checkbox',
      label: { ko: '뉴스레터 구독', en: 'Subscribe' },
    },
    email: {
      type: 'email',
      label: { ko: '이메일', en: 'Email' },
      validate: {
        required: ".subscribe == '1'",
        email: true,
      },
    },
    title: {
      type: 'text',
      label: { ko: '제목', en: 'Title' },
      lang: { only: ['ko', 'en'] },
      validate: { required: true },
    },
    members: {
      type: 'group',
      label: { ko: '구성원', en: 'Members' },
      multiple: { max: 5, sortable: true },
      properties: {
        name: {
          type: 'text',
          label: { ko: '이름', en: 'Name' },
          validate: { required: true },
        },
      },
    },
  },
};

descTest('explain — spec → natural-language back-check (역검증)', () => {
  const out = explainSpec(SPEC, { lang: 'ko' });

  it('every first-class field name surfaces (no field dropped)', () => {
    for (const name of ['subscribe', 'email', 'title', 'members', 'name']) {
      expect(out).toContain(name);
    }
  });

  it('every field label (current lang) surfaces', () => {
    for (const label of ['뉴스레터 구독', '이메일', '제목', '구성원', '이름']) {
      expect(out).toContain(label);
    }
  });

  it('type→widget meaning is rendered (email/checkbox/text/group), not the raw type alone', () => {
    // The describe catalog gives each type a layout/meaning; explain must use it.
    expect(out).toContain('이메일'); // email widget meaning
    expect(out).toMatch(/그룹|반복|구성/); // group meaning
  });

  it('unconditional required → "필수"', () => {
    // title and name are unconditionally required.
    expect(out).toContain('필수');
  });

  it('email rule → "이메일 형식"', () => {
    expect(out).toContain('이메일 형식');
  });

  it('expression required → "~일 때 필수" with the condition surfaced verbatim', () => {
    // The conditional gate must be readable AND the raw expression preserved so
    // the author can confirm the trigger against the 기획서.
    expect(out).toContain("일 때 필수");
    expect(out).toContain(".subscribe == '1'");
  });

  it('lang → "다국어" with the allowed languages (ko/en)', () => {
    expect(out).toContain('다국어');
    expect(out).toContain('ko');
    expect(out).toContain('en');
  });

  it('multiple → "반복" with max and sortable surfaced', () => {
    expect(out).toContain('반복');
    expect(out).toContain('5'); // multiple.max
    expect(out).toMatch(/정렬/); // sortable
  });

  it('nested group children are explained recursively (members.name)', () => {
    // 'name' lives under members.properties — recursion must reach it.
    const nameIdx = out.indexOf('이름');
    const membersIdx = out.indexOf('구성원');
    expect(membersIdx).toBeGreaterThanOrEqual(0);
    expect(nameIdx).toBeGreaterThan(membersIdx);
  });
});

descTest('explain — invented-interpretation 0: meaning comes from the describe catalog', () => {
  it('an unknown type is reported as unknown, not silently described', () => {
    const out = explainSpec(
      { type: 'group', properties: { x: { type: 'nonesuch', label: 'X' } } },
      { lang: 'ko' }
    );
    expect(out).toContain('x');
    // explain must not pretend to know a type that describe does not list.
    expect(out).toMatch(/알 수 없는|미등록|unknown/i);
  });
});

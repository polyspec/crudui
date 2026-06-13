/**
 * Legacy inline-JS / conditional-presentation markup tests.
 *
 * Single source of truth = tests/fixtures/reference-html (ProductNft.html).
 * These pin the legacy-raw branches added for reference parity:
 *   - DummyField  : Generator\Fields\Dummy::write() one-div markup
 *   - SelectField : spec-authored onchange (minify_js + ';') raw branch
 *   - ButtonField : Generator\Fields\Button::write() script/hidden/button
 *   - dynamic_onchange row buttons (Fields::addElement onclick attribute)
 *     on multiple group rows AND multiple leaf rows, with click delegation
 *     keeping add/remove interactive.
 *
 * Do NOT weaken these toward idiomatic React markup — the reference fixtures
 * pin the legacy shapes.
 */

import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { FormBuilder } from '../components/FormBuilder';
import type { Spec } from '@form-spec/validator';

describe('DummyField legacy markup', () => {
  it('renders the single legacy div with element_class/element_style and the default value', () => {
    const spec: Spec = {
      type: 'group',
      properties: {
        name: {
          type: 'dummy',
          default: '옵션명',
          class: 'col-12 col-md-3',
          style: 'font-weight: 500',
          element_class: 'text-center',
        },
      },
    } as unknown as Spec;

    const { container } = render(<FormBuilder spec={spec} language="ko" />);

    const wrapper = container.querySelector('[name="name-layer"]') as HTMLElement;
    expect(wrapper).toBeInTheDocument();
    // spec.style goes on the wrapper, element_class/element_style on the div
    expect(wrapper.getAttribute('style')).toContain('font-weight');
    const dummy = wrapper.querySelector('.input-group-wrapper > div') as HTMLElement;
    expect(dummy).toBeInTheDocument();
    expect(dummy.className).toBe('text-center');
    expect(dummy.textContent).toBe('옵션명');
    // legacy renders exactly one div — no form-dummy chrome
    expect(container.querySelector('.form-dummy')).toBeNull();
  });

  it('applies items lookup and nl2br on the value', () => {
    const spec: Spec = {
      type: 'group',
      properties: {
        d1: { type: 'dummy', default: 'a', items: { a: 'Alpha' } },
        d2: { type: 'dummy', default: 'line1\nline2' },
      },
    } as unknown as Spec;

    const { container } = render(<FormBuilder spec={spec} language="ko" />);

    const d1 = container.querySelector('[name="d1-layer"] .input-group-wrapper > div')!;
    expect(d1.textContent).toBe('Alpha');
    const d2 = container.querySelector('[name="d2-layer"] .input-group-wrapper > div')!;
    expect(d2.innerHTML).toContain('<br>'); // nl2br
  });
});

describe('SelectField inline onchange (legacy-raw branch)', () => {
  it('emits onchange="minified;" on the select (PHP: minify_js($onchange) . \';\')', () => {
    const spec: Spec = {
      type: 'group',
      properties: {
        choice: {
          type: 'select',
          label: 'Choice',
          items: { '': '선택하세요.', a: 'A' },
          onchange:
            "$(this).closest('form').data('validator').checkByElements(\n  $(this).closest('.form-element-wrapper').find('.valid-target')\n);\n",
        },
      },
    } as unknown as Spec;

    const { container } = render(<FormBuilder spec={spec} language="ko" />);

    const select = container.querySelector('select[name="choice"]') as HTMLSelectElement;
    expect(select).toBeInTheDocument();
    expect(select.getAttribute('onchange')).toBe(
      "$(this).closest('form').data('validator').checkByElements($(this).closest('.form-element-wrapper').find('.valid-target'));;"
    );
    expect(select.className).toBe('valid-target form-select');
    expect(select.getAttribute('data-rule-name')).toBe('choice');
    // default-selected option (effective value '')
    const selected = select.querySelector('option[selected]');
    expect(selected?.getAttribute('value')).toBe('');
  });

  it('keeps the React-controlled path when no inline onchange exists', () => {
    const spec: Spec = {
      type: 'group',
      properties: {
        plain: { type: 'select', items: { '': 'pick', a: 'A' } },
      },
    } as unknown as Spec;

    const { container } = render(<FormBuilder spec={spec} language="ko" />);
    const select = container.querySelector('select[name="plain"]')!;
    expect(select.getAttribute('onchange')).toBeNull();
  });
});

describe('ButtonField legacy markup', () => {
  const spec: Spec = {
    type: 'group',
    properties: {
      option: {
        type: 'group',
        properties: {
          button: {
            type: 'button',
            text: '조합',
            button_class: 'btn-submit',
            init_script: "$(document).on('change', '[name^=opt]', function() {});\n",
            onclick: "doCombine();\n",
          },
        },
      },
    },
  } as unknown as Spec;

  it('renders script + hidden valid-target input + button input (no .input-group wrapper)', () => {
    const { container } = render(<FormBuilder spec={spec} language="ko" />);

    const wrapper = container.querySelector(
      '[name="option.button-layer"] .input-group-wrapper'
    ) as HTMLElement;
    expect(wrapper).toBeInTheDocument();
    expect(wrapper.querySelector('.input-group')).toBeNull();

    const script = wrapper.querySelector('script') as HTMLScriptElement;
    expect(script).toBeInTheDocument();
    expect(script.getAttribute('nonce')).toBe('');
    expect(script.textContent).toContain("$(document).on('change', '[name^=opt]'");
    expect(script.textContent).toContain('$("#btnoption_button").on(\'click\', function() {');
    expect(script.textContent).toContain('doCombine();');

    const hidden = wrapper.querySelector('input[type="hidden"]') as HTMLInputElement;
    expect(hidden).toBeInTheDocument();
    expect(hidden.className).toBe('valid-target form-control');
    expect(hidden).toHaveAttribute('readonly');
    expect(hidden.getAttribute('name')).toBe('option[button]');
    expect(hidden.getAttribute('data-name')).toBe('button');
    expect(hidden.getAttribute('data-rule-name')).toBe('option[button]');
    expect(hidden.getAttribute('data-default')).toBe('');

    const btn = wrapper.querySelector('input[type="button"]') as HTMLInputElement;
    expect(btn).toBeInTheDocument();
    expect(btn.className).toBe('btn btn-submit');
    expect(btn.getAttribute('name')).toBe('btnoption[button]');
    expect(btn.getAttribute('id')).toBe('btnoption_button');
    expect(btn.getAttribute('value')).toBe('조합');
    expect(btn.hasAttribute('readonly')).toBe(false);
  });
});

describe('dynamic_onchange row buttons (legacy onclick attribute)', () => {
  // Harmless inline JS — jsdom executes onclick attributes on click, so the
  // fixture JS must run cleanly. The reference value shape (raw spec string
  // with trailing newline, jQuery selector escapes intact) is pinned by the
  // parity suite (ProductNft option groups).
  const DYN_JS = 'window.__dynPing = (window.__dynPing || 0) + 1;\n';

  const groupSpec: Spec = {
    type: 'group',
    properties: {
      'groups[]': {
        type: 'group',
        label: 'Groups',
        multiple: true,
        sortable: true,
        dynamic_onchange: DYN_JS,
        properties: {
          name: { type: 'text', label: 'Name' },
        },
      },
    },
  } as unknown as Spec;

  it('group rows: every button carries the raw onclick attribute', () => {
    const { container } = render(<FormBuilder spec={groupSpec} language="ko" />);

    const span = container.querySelector('.btn-group.input-group-btn') as HTMLElement;
    expect(span).toBeInTheDocument();
    const buttons = span.querySelectorAll('button');
    // sortable: move-up, move-down, plus, minus
    expect(buttons.length).toBe(4);
    for (const b of Array.from(buttons)) {
      expect(b.getAttribute('onclick')).toBe(DYN_JS);
      expect(b.getAttribute('type')).toBe('button');
    }
    expect(buttons[0]!.className).toBe('btn btn-move-up');
    expect(buttons[1]!.className).toBe('btn btn-move-down');
    expect(buttons[2]!.className).toBe('btn btn-plus');
    expect(buttons[3]!.className).toBe('btn btn-minus');
  });

  it('group rows: delegated clicks keep add/remove interactive', () => {
    const { container } = render(<FormBuilder spec={groupSpec} language="ko" />);

    // one btn-group span per row
    expect(container.querySelectorAll('span.btn-group.input-group-btn').length).toBe(1);
    fireEvent.click(container.querySelector('button.btn-plus')!);
    expect(container.querySelectorAll('span.btn-group.input-group-btn').length).toBe(2);
    fireEvent.click(container.querySelector('button.btn-minus')!);
    expect(container.querySelectorAll('span.btn-group.input-group-btn').length).toBe(1);
  });

  it('leaf rows: input-group renders raw with input + onclick buttons inside', () => {
    const leafSpec: Spec = {
      type: 'group',
      properties: {
        'items[]': {
          type: 'text',
          label: 'Items',
          multiple: true,
          sortable: true,
          element_class: 'option-value',
          dynamic_onchange: DYN_JS,
        },
      },
    } as unknown as Spec;

    const { container } = render(<FormBuilder spec={leafSpec} language="ko" />);

    const group = container.querySelector('.input-group') as HTMLElement;
    expect(group).toBeInTheDocument();
    const input = group.querySelector('input[type="text"]') as HTMLInputElement;
    expect(input).toBeInTheDocument();
    expect(input.className).toBe('valid-target form-control option-value');
    expect(input.getAttribute('data-name')).toBe('items[]');
    expect(input.getAttribute('data-rule-name')).toBe('items[]');
    // buttons are DIRECT children of .input-group (legacy <!--btn--> slot)
    const buttons = group.querySelectorAll(':scope > button');
    expect(buttons.length).toBe(4);
    for (const b of Array.from(buttons)) {
      expect(b.getAttribute('onclick')).toBe(DYN_JS);
    }
    // delegation still adds rows
    fireEvent.click(group.querySelector('button.btn-plus')!);
    expect(container.querySelectorAll('.input-group-wrapper[data-uniqid]').length).toBe(2);
  });
});

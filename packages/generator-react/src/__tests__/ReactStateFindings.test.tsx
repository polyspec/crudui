/**
 * React state-management finding regressions (adversarial-verification F2).
 *
 * Pins three findings the adversary reproduced in FormContext/dataAttributes:
 *
 *   F1 (high)   FormContext kept a ref-guarded Validator that never tracked a
 *               spec swap — after the spec prop changed, validation kept using
 *               the FIRST spec. Now a useMemo([spec]) recreates it (same fix as
 *               useForm.ts). These tests fail on the pre-fix guard.
 *   F2 (medium) The display_switch identifying class token came from
 *               Math.random(), so SSR and CSR drew different tokens (hydration
 *               mismatch) and parity was non-deterministic. The token is now
 *               derived from the controlling field's dot path
 *               (displayTokenForSeed) — stable across renders/processes, format
 *               preserved (5 chars of [a-hj-km-np-z2-9]).
 *   F3 (high, DOCUMENTED-ONLY) The select controller of a MAP-form
 *               display_switch is inert in pure React: the transform writes a
 *               jQuery onchange onto the controller, which routes SelectField
 *               into its dangerouslySetInnerHTML branch with NO React onChange,
 *               so context data never updates and the sibling style never
 *               re-evaluates. The fix is out of scope for F2 — this test PINS
 *               the reproduction (not a desired behavior) so the regression is
 *               observable; see failures notes for the required design.
 */

import React, { useState } from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { FormContextProvider, useFormContext } from '../context/FormContext';
import { I18nContextProvider } from '../context/I18nContext';
import { FormBuilder } from '../components/FormBuilder';
import {
  applyDisplaySwitchTransform,
  displayTokenForSeed,
} from '../hooks/legacyDisplay';
import type { Spec } from '@form-spec/validator';

// ============================================================================
// F1 — validator recreated on spec swap
// ============================================================================

const specRequiresA: Spec = {
  type: 'group',
  name: 'f1',
  properties: {
    a: { type: 'text', label: 'A', rules: { required: true } },
  },
};

const specRequiresB: Spec = {
  type: 'group',
  name: 'f1',
  properties: {
    b: { type: 'text', label: 'B', rules: { required: true } },
  },
};

/** Runs validateForm() on demand and exposes the resulting error paths. */
function ValidateProbe() {
  const { validateForm } = useFormContext();
  const [paths, setPaths] = useState<string>('(none)');
  return (
    <div>
      <button
        type="button"
        onClick={() => setPaths(Object.keys(validateForm()).sort().join(',') || '(none)')}
      >
        validate
      </button>
      <div data-testid="error-paths">{paths}</div>
    </div>
  );
}

describe('F1: FormContext validator tracks the spec prop', () => {
  it('validates against the SWAPPED spec, not the first one', () => {
    function Harness() {
      const [spec, setSpec] = useState<Spec>(specRequiresA);
      return (
        <I18nContextProvider language="en">
          <FormContextProvider spec={spec} initialData={{}}>
            <ValidateProbe />
            <button type="button" onClick={() => setSpec(specRequiresB)}>
              swap
            </button>
          </FormContextProvider>
        </I18nContextProvider>
      );
    }

    render(<Harness />);

    // Before swap: spec A makes `a` required.
    fireEvent.click(screen.getByText('validate'));
    expect(screen.getByTestId('error-paths').textContent).toBe('a');

    // Swap to spec B (only `b` required) and re-validate.
    fireEvent.click(screen.getByText('swap'));
    fireEvent.click(screen.getByText('validate'));

    // Pre-fix (ref-guarded validator) keeps reporting `a`. Fixed: reports `b`.
    expect(screen.getByTestId('error-paths').textContent).toBe('b');
  });

  it('validateField on the new spec sees the new required field', () => {
    function FieldProbe() {
      const { validateField } = useFormContext();
      const [msg, setMsg] = useState<string>('(unset)');
      return (
        <div>
          <button type="button" onClick={() => setMsg(String(validateField('b')))}>
            check-b
          </button>
          <div data-testid="b-result">{msg}</div>
        </div>
      );
    }

    function Harness() {
      const [spec, setSpec] = useState<Spec>(specRequiresA);
      return (
        <I18nContextProvider language="en">
          <FormContextProvider spec={spec} initialData={{}}>
            <FieldProbe />
            <button type="button" onClick={() => setSpec(specRequiresB)}>
              swap
            </button>
          </FormContextProvider>
        </I18nContextProvider>
      );
    }

    render(<Harness />);

    // Spec A has no `b` rule -> validateField('b') is null.
    fireEvent.click(screen.getByText('check-b'));
    expect(screen.getByTestId('b-result').textContent).toBe('null');

    // After swap, `b` is required -> validateField('b') returns the message.
    fireEvent.click(screen.getByText('swap'));
    fireEvent.click(screen.getByText('check-b'));
    expect(screen.getByTestId('b-result').textContent).toBe('This field is required.');
  });
});

// ============================================================================
// F2 — deterministic display_switch token
// ============================================================================

const switchSpec: Spec = {
  type: 'group',
  name: 'f2',
  properties: {
    payment_type: {
      type: 'select',
      label: 'Payment',
      default: 'credit',
      items: { credit: 'Credit', bank: 'Bank' },
      display_switch: { credit: ['card_number'], bank: ['bank_account'] },
    },
    card_number: { type: 'text', label: 'Card' },
    bank_account: { type: 'text', label: 'Bank Account' },
  },
} as unknown as Spec;

describe('F2: display_switch token is deterministic', () => {
  it('displayTokenForSeed keeps the 5-char charset format (parity mask)', () => {
    for (const seed of ['payment_type', 'a', 'common.deep.field', '', 'x'.repeat(64)]) {
      const token = displayTokenForSeed(seed);
      expect(token).toMatch(/^[a-hj-km-np-z2-9]{5}$/);
    }
  });

  it('same seed -> same token; different seeds -> generally different', () => {
    expect(displayTokenForSeed('payment_type')).toBe(displayTokenForSeed('payment_type'));
    expect(displayTokenForSeed('foo')).not.toBe(displayTokenForSeed('payment_type'));
  });

  it('transform tokens are identical across repeated calls of the same spec', () => {
    const a = applyDisplaySwitchTransform(switchSpec) as unknown as {
      properties: Record<string, { class?: string }>;
    };
    const b = applyDisplaySwitchTransform(switchSpec) as unknown as {
      properties: Record<string, { class?: string }>;
    };
    expect(a.properties.card_number.class).toBe(b.properties.card_number.class);
    expect(a.properties.bank_account.class).toBe(b.properties.bank_account.class);
    // token is seeded by the CONTROLLING field path, not the sibling
    expect(a.properties.card_number.class).toContain(displayTokenForSeed('payment_type'));
  });

  it('SSR markup and CSR hydration markup carry the SAME token (no mismatch)', () => {
    const tree = (
      <I18nContextProvider language="ko">
        <FormBuilder spec={switchSpec} language="ko" />
      </I18nContextProvider>
    );

    const ssrHtml = renderToString(tree);
    const { container } = render(tree);
    const csrHtml = container.innerHTML;

    const tokenRe = /card_number_([a-hj-km-np-z2-9]{5})/;
    const ssrToken = ssrHtml.match(tokenRe)?.[1];
    const csrToken = csrHtml.match(tokenRe)?.[1];

    expect(ssrToken).toBeDefined();
    expect(csrToken).toBeDefined();
    // The whole point: Math.random() would diverge here.
    expect(csrToken).toBe(ssrToken);
    expect(ssrToken).toBe(displayTokenForSeed('payment_type'));
  });
});

// ============================================================================
// F3 — DOCUMENTED reproduction: select controller is inert in pure React
// ============================================================================

describe('F3 (documented): map-form display_switch controller is inert in pure React', () => {
  it('select with display_switch renders the raw jQuery-onchange branch (no React onChange)', () => {
    cleanup();
    const { container } = render(<FormBuilder spec={switchSpec} language="ko" />);

    // The transform put a jQuery onchange on the controller; SelectField then
    // emits the raw select via dangerouslySetInnerHTML.
    const select = container.querySelector('select[name="payment_type"]') as HTMLSelectElement;
    expect(select).toBeInTheDocument();
    const onchange = select.getAttribute('onchange');
    expect(onchange).toBeTruthy();
    expect(onchange).toContain('.show()'); // jQuery body, not React
  });

  it('changing the controller does NOT toggle the sibling style (pure React, no jQuery)', () => {
    cleanup();
    const { container } = render(<FormBuilder spec={switchSpec} language="ko" />);

    const cardWrapper = container.querySelector('[name="card_number-layer"]') as HTMLElement;
    const bankWrapper = container.querySelector('[name="bank_account-layer"]') as HTMLElement;
    expect(cardWrapper).toBeInTheDocument();
    expect(bankWrapper).toBeInTheDocument();

    // default credit -> card visible (display: block), bank hidden (display: none)
    expect(cardWrapper.getAttribute('style') ?? '').not.toContain('display: none');
    expect(bankWrapper.getAttribute('style') ?? '').toContain('display: none');

    // Strip the inline jQuery onchange before firing: it would throw
    // ReferenceError($) in jsdom (it needs the real jQuery + real DOM). React
    // attaches synthetic handlers independently of the HTML onchange attribute,
    // so removing the attribute cannot remove a React handler — if one existed,
    // the change below would still reach FormContext. None exists.
    const select = container.querySelector('select[name="payment_type"]') as HTMLSelectElement;
    select.removeAttribute('onchange');
    select.value = 'bank';
    fireEvent.change(select);

    // REPRODUCTION (not desired): the sibling styles are unchanged because the
    // controller change never reached FormContext data — no React onChange,
    // no re-render, no resolveDisplayTargetParts re-evaluation. The bank
    // wrapper stays hidden; the card wrapper stays visible.
    expect(bankWrapper.getAttribute('style') ?? '').toContain('display: none');
    expect(cardWrapper.getAttribute('style') ?? '').not.toContain('display: none');
  });
});

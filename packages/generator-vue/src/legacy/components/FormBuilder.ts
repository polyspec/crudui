/**
 * FormBuilder — top-level Vue component. Mirrors generator-react FormBuilder:
 * parses the spec (YAML string or object), builds the render context, and
 * renders the legacy Generator::write() content shell:
 *
 *   [<label class="form-label">title</label>]
 *   [<div class="form-description">desc</div>]
 *   [<hr/> when title or description]
 *   <div class="form-group">…fields…</div>
 *   <hr/> <div class="clearfix">…footer buttons…</div>
 *
 * The host page owns the <form> element; for parity the capture harness
 * strips a wrapping <form> if present, so FormBuilder also renders a
 * <form class="form-builder" novalidate> wrapper (stripped by the harness,
 * matching the React contract).
 */

import { defineComponent, h, provide, type PropType, type VNode } from 'vue';
import yaml from 'yaml';
import type { Spec } from '@form-spec/validator/legacy';
import type { FormData } from '../types';
import { RENDER_CONTEXT_KEY, createRenderContext } from '../context';
import { resetUniqid } from '../utils/dataAttributes';
import { resetChoiceTokens } from '../legacyParity';
import { renderFormField } from './formTree';
import { renderButtonGroup } from './buttons';

export const FormBuilder = defineComponent({
  name: 'FormBuilder',
  props: {
    /** Form spec — a YAML string or an already-parsed, order-preserving object. */
    spec: {
      /** Accepted prop runtime types: YAML `String` or parsed spec `Object`. */
      type: [String, Object] as PropType<string | Spec>,
      /** Spec is mandatory; there is nothing to render without it. */
      required: true,
    },
    /** Initial form data bound to the fields (reference renders use empty data). */
    data: {
      /** Plain object data bag. */
      type: Object as PropType<FormData>,
      /** Default to an empty data bag. */
      default: () => ({}),
    },
    /** UI language code for label/message resolution. */
    language: {
      /** Language code string. */
      type: String,
      /** Default language is Korean (`ko`). */
      default: 'ko',
    },
    /** Extra CSS class appended to the `form-builder` wrapper. */
    className: {
      /** Class-name string. */
      type: String,
      /** Default to no extra class. */
      default: '',
    },
    /** Render every field disabled. */
    disabled: {
      /** Boolean flag. */
      type: Boolean,
      /** Default enabled. */
      default: false,
    },
    /** Render every field read-only. */
    readonly: {
      /** Boolean flag. */
      type: Boolean,
      /** Default editable. */
      default: false,
    },
  },
  setup(props) {
    // Parse spec (YAML string parsing is delegated to the host; the parity
    // harness passes an already-parsed, order-preserving object).
    const spec: Spec =
      typeof props.spec === 'string'
        ? (yaml.parse(props.spec) as Spec)
        : props.spec;

    const keyPrefix = (spec as { key?: string }).key ?? '';

    // Deterministic id/token sequences, reset per FormBuilder instance so an
    // SSR render is reproducible (PHP uniqid()/genRandomString() analogue).
    resetUniqid();
    resetChoiceTokens();

    const ctx = createRenderContext({
      spec,
      data: props.data as FormData,
      disabled: props.disabled,
      readonly: props.readonly,
      keyPrefix,
      language: props.language,
    });
    provide(RENDER_CONTEXT_KEY, ctx);

    return () => {
      const renderSpec = ctx.spec;
      const content: VNode[] = [];

      if (renderSpec.label) {
        content.push(h('label', { class: 'form-label' }, ctx.t(renderSpec.label)));
      }
      if ((renderSpec as { description?: string }).description) {
        content.push(
          h('div', { class: 'form-description' }, ctx.t((renderSpec as { description?: string }).description))
        );
      }
      if (renderSpec.label || (renderSpec as { description?: string }).description) {
        content.push(h('hr'));
      }

      const fields: VNode[] = [];
      if (renderSpec.properties) {
        for (const [name, fieldSpec] of Object.entries(renderSpec.properties)) {
          fields.push(renderFormField({ name, spec: fieldSpec as any, path: name, ctx }));
        }
      }
      content.push(h('div', { class: 'form-group' }, fields));

      content.push(...renderButtonGroup(renderSpec as any, ctx));

      const formClass = props.className ? `form-builder ${props.className}` : 'form-builder';
      return h('form', { class: formClass, novalidate: true }, content);
    };
  },
});

export default FormBuilder;

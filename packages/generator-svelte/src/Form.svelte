<!--
  CRUDUI form component (Svelte 5 SSR).

  Drives the four mandated stages (SPEC §2 / G5):
    (1) CRUDUI spec → (2) CRUDUI compose (validator-js CRUDUI compose: expand $ref/$patch
    into a single composition-free spec; an unresolved $ref is a ComposeLoadError,
    NOT a render) → (3) design-slot + condition-map render (shared expr engine) →
    (4) SSR HTML.

  The compose engine and the expr engine are REUSED from validator-js (no
  duplicate implementation). This component never touches legacy generator code
  (R7 parallel run) and never calls `eval`. The computed field HTML is the
  verified Limepie envelope (render.ts); it is emitted via {@html} so the output,
  after the shared normalizer, is identical to the React/Vue CRUDUI references
  (3-framework parity, tests/fixtures/form-render).

  Svelte 5 runes mode: props via $props(); the body is a single $derived string.
-->
<script lang="ts" module>
  import {
    composeProperties,
    MemoryLoader,
    type FileLoader,
  } from '@form-spec/validator';
  import { makeTranslate, type Language } from './content';
  import { renderField, type RenderState } from './render';
  import { resetUniqid } from './util';

  /** Props for the CRUDUI form component. */
  export interface FormProps {
    /** Root CRUDUI spec (a group with `properties`). */
    spec: Record<string, unknown>;
    /** Form data (expr engine formData + value source). */
    data?: Record<string, unknown>;
    /** Active content language (default 'ko'). */
    language?: Language;
    /** Name/id prefix. */
    keyPrefix?: string;
    /** $ref file set for composition (virtual in-memory loader). */
    files?: Record<string, Record<string, unknown>>;
    /** A custom loader (overrides `files`). */
    loader?: FileLoader;
    /** Basepath for relative $ref. */
    basepath?: string;
  }

  /**
   * Build the form-content HTML (no `<form>` wrapper). Throws ComposeLoadError on
   * an unresolved `$ref`. Shared by the component body and the convenience
   * string renderer (index.ts) so both produce the identical envelope.
   */
  export function buildFormHtml(props: FormProps): string {
    const data = props.data ?? {};
    const t = makeTranslate(props.language ?? 'ko');
    const loader = props.loader ?? new MemoryLoader(props.files ?? {});
    const opts = props.basepath ? { basepath: props.basepath } : {};

    resetUniqid();

    // Stage 2: compose the root properties (recurses into nested $ref/$patch).
    const rawProps = (props.spec.properties as Record<string, unknown>) ?? {};
    const composed = composeProperties(rawProps, loader, opts);

    const state: RenderState = { data, keyPrefix: props.keyPrefix, t };

    // Stages 3–4: render each composed top-level field.
    let fieldsHtml = '';
    for (const [name, fieldSpec] of Object.entries(composed)) {
      if (fieldSpec && typeof fieldSpec === 'object' && !Array.isArray(fieldSpec)) {
        fieldsHtml += renderField(name, fieldSpec as Record<string, unknown>, name, state);
      }
    }
    return `<div class="form-group">${fieldsHtml}</div>`;
  }
</script>

<script lang="ts">
  const props: FormProps = $props();
  // Compose + render once per props change. ComposeLoadError propagates out of
  // SSR render() (an unresolved $ref is a load error, never a silent render).
  const html = $derived(buildFormHtml(props));
</script>

{@html html}

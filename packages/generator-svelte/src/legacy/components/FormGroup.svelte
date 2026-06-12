<script lang="ts">
  import { renderGroup, type RenderState } from '../render';
  import { makeTranslate, type Language } from '../i18n';
  import type { SpecNode } from './fields/legacyParity';

  /** Group spec key (property name). */
  export let name: string;
  /** Group specification (type: group). */
  export let spec: SpecNode;
  /** Full dot path of this group in the form data. */
  export let path: string = name;
  /** Parent group dot path ('' / undefined for top-level groups). */
  export let parentPath: string | undefined = undefined;
  /** Root (render) spec — supplies keyPrefix and display_target lookups. */
  export let rootSpec: SpecNode | undefined = undefined;
  /** Current form data. */
  export let data: Record<string, unknown> = {};
  export let language: Language = 'ko';

  $: state = {
    rootSpec: rootSpec ?? spec,
    data,
    keyPrefix:
      rootSpec && typeof rootSpec.key === 'string' ? rootSpec.key : '',
    language,
    t: makeTranslate(language),
  } satisfies RenderState;
  $: html = renderGroup(name, spec, path, parentPath, state);
</script>

{@html html}

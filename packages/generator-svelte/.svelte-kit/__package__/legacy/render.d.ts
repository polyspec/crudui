/**
 * render — pure HTML renderer for the form CONTENT (the legacy Limepie
 * Generator::write() output: form-group + footer; the host owns the <form>).
 *
 * This reproduces the generator-react component tree (FormBuilder -> FormField
 * -> FormGroup -> field components) at SSR time with the EXACT same structure.
 * The Svelte components (FormBuilder.svelte) delegate to renderFormContent;
 * field inner markup comes from ./fieldHtml (the verified parity emitters),
 * exactly as the React fields used dangerouslySetInnerHTML / JSX.
 */
import { type SpecNode } from './components/fields/limepieParity';
import type { Language, MultiLangText } from './i18n';
/** Per-render context threaded through the recursive content renderer. */
export interface RenderState {
    /** The root form spec being rendered. */
    rootSpec: SpecNode;
    /** The current form data values, keyed by field name. */
    data: Record<string, unknown>;
    /** Name prefix applied to field `name`/`id` attributes. */
    keyPrefix: string;
    /** Active language for label/message translation. */
    language: Language;
    /** Translator resolving a multi-language text to a string. */
    t: (text: MultiLangText | undefined | null, fallback?: string) => string;
}
/** Render one property (FormField dispatcher). `name` is the spec key. */
export declare function renderField(name: string, spec: SpecNode, rawPath: string, parentPath: string | undefined, state: RenderState): string;
/** Render a group field (FormGroup): the nested property list, plus multiple/array wrapping. */
export declare function renderGroup(name: string, spec: SpecNode, path: string, parentPath: string | undefined, state: RenderState): string;
/**
 * Render the full form CONTENT (no <form> wrapper): optional top
 * label/description + hr, the .form-group field list, then the footer.
 */
export declare function renderFormContent(spec: SpecNode, state: RenderState): string;
//# sourceMappingURL=render.d.ts.map
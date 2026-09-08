import { type SpecNode } from './fields/limepieParity';
import { type Language } from '../i18n';
/**
 * Build the form CONTENT HTML (no <form> wrapper) for a parsed spec.
 * Applies the legacy render-spec transforms (lang: append, then
 * display_switch) in parser order, exactly like generator-react's
 * FormContext renderSpec, then renders the field tree.
 */
export declare function buildFormContent(rawSpec: SpecNode | string, data: Record<string, unknown>, language: Language): string;
interface $$__sveltets_2_IsomorphicComponent<Props extends Record<string, any> = any, Events extends Record<string, any> = any, Slots extends Record<string, any> = any, Exports = {}, Bindings = string> {
    new (options: import('svelte').ComponentConstructorOptions<Props>): import('svelte').SvelteComponent<Props, Events, Slots> & {
        $$bindings?: Bindings;
    } & Exports;
    (internal: unknown, props: Props & {
        $$events?: Events;
        $$slots?: Slots;
    }): Exports & {
        $set?: any;
        $on?: any;
    };
    z_$$bindings?: Bindings;
}
declare const FormBuilder: $$__sveltets_2_IsomorphicComponent<{
    /** Form specification (parsed object or YAML string). */ spec: SpecNode | string;
    /** Initial form data. */ data?: Record<string, unknown>;
    /** UI language (label localization). */ language?: Language;
    /** Optional extra class on the <form> element. */ className?: string | undefined;
}, {
    [evt: string]: CustomEvent<any>;
}, {}, {}, string>;
type FormBuilder = InstanceType<typeof FormBuilder>;
export default FormBuilder;
//# sourceMappingURL=FormBuilder.svelte.d.ts.map
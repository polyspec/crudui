import { type Language } from '../i18n';
import type { SpecNode } from './fields/limepieParity';
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
declare const FormField: $$__sveltets_2_IsomorphicComponent<{
    /** Field spec key (property name). */ name: string;
    /** Field specification. */ spec: SpecNode;
    /** Full dot path of this field in the form data. */ path?: string;
    /** Parent group dot path ('' / undefined for top-level fields). */ parentPath?: string | undefined;
    /** Root (render) spec — supplies keyPrefix and display_target lookups. */ rootSpec?: SpecNode | undefined;
    /** Current form data. */ data?: Record<string, unknown>;
    language?: Language;
}, {
    [evt: string]: CustomEvent<any>;
}, {}, {}, string>;
type FormField = InstanceType<typeof FormField>;
export default FormField;
//# sourceMappingURL=FormField.svelte.d.ts.map
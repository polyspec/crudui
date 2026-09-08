import { type Language } from "../../i18n";
import type { SpecNode } from "./limepieParity";
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
declare const SelectField: $$__sveltets_2_IsomorphicComponent<{
    spec: SpecNode;
    value?: unknown;
    path: string;
    keyPrefix?: string;
    language?: Language;
    readonly?: boolean;
    disabled?: boolean;
    buttonsHtml?: string | undefined;
    buttonsJsx?: string | undefined;
}, {
    [evt: string]: CustomEvent<any>;
}, {}, {}, string>;
type SelectField = InstanceType<typeof SelectField>;
export default SelectField;
//# sourceMappingURL=SelectField.svelte.d.ts.map
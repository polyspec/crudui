import { type Language } from '../../i18n';
import type { SpecNode } from './limepieParity';
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
declare const CheckboxField: $$__sveltets_2_IsomorphicComponent<{
    spec: SpecNode;
    value?: unknown;
    path: string;
    keyPrefix?: string;
    language?: Language;
    readonly?: boolean;
    disabled?: boolean;
}, {
    [evt: string]: CustomEvent<any>;
}, {}, {}, string>;
type CheckboxField = InstanceType<typeof CheckboxField>;
export default CheckboxField;
//# sourceMappingURL=CheckboxField.svelte.d.ts.map
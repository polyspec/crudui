import type { FormTemplate, Language } from '@polyspec/crudui-generator-core';
import type { FormViews, RecordData } from '../form-views.ts';

/** The entry points of an adapter: mountView builds the form from data, hydrateView adopts the server-rendered form. */
export interface ViewEntries<Driver> {
  mountView: (views: FormViews, template: FormTemplate, language: Language, data?: RecordData) => Driver;
  hydrateView: (views: FormViews, template: FormTemplate, language: Language, data: RecordData) => Driver;
}

/** The entry points of an adapter over its start function, which builds the driver with the hydration flag it is given. */
export function viewEntries<Driver>(
  start: (views: FormViews, template: FormTemplate, language: Language, data: RecordData, hydrate: boolean) => Driver,
): ViewEntries<Driver> {
  return {
    mountView: (views, template, language, data = {}) => start(views, template, language, data, false),
    hydrateView: (views, template, language, data) => start(views, template, language, data, true),
  };
}

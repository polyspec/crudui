/** Build the read-only detail model from the shared list display engine. */

import { FormInputError } from '@crudui/validator';
import { buildDisplay, type BuildListOptions, type CellVM } from './list';
import type { ResolvedDesign } from './design';

export interface DetailFieldVM extends CellVM {
  /** Stable field key from the detail declaration. */
  key: string;
  /** Translated field label. */
  label: string;
}

/** Complete evaluated, markup-free detail model. */
export interface DetailViewModel {
  /** Ordered read-only fields. */
  fields: DetailFieldVM[];
  /** Resolved detail-container design. */
  design: ResolvedDesign;
}

/** Options for building a detail view model: the list options without the list-only `page` and `total`. */
export type BuildDetailOptions = Omit<BuildListOptions, 'page' | 'total'>;

/**
 * Compose a detail specification, evaluate one supplied record and return
 * display cells. Detail delegates field composition, conditions, localization
 * and cell formatting to the list engine; it does not query application data.
 */
export function buildDetail(
  detailSpec: Record<string, unknown>,
  record: Record<string, unknown> = {},
  options: BuildDetailOptions = {},
): DetailViewModel {
  if (detailSpec === null || typeof detailSpec !== 'object' || Array.isArray(detailSpec)) {
    throw new FormInputError('Detail specification must be an object');
  }
  // Argument shapes in argument order, then the declaration, then options.
  if (record === null || typeof record !== 'object' || Array.isArray(record)) {
    throw new FormInputError('Detail record must be an object');
  }
  if (!Object.prototype.hasOwnProperty.call(detailSpec, 'fields')) {
    throw new FormInputError('Detail specification must declare fields');
  }
  const context = options.data;
  if (context !== undefined && context !== null && (typeof context !== 'object' || Array.isArray(context))) {
    throw new FormInputError('Detail context must be an object');
  }
  const fields = detailSpec.fields;
  // Page and total are list-only options: a detail neither checks nor uses them.
  const vm = buildDisplay(
    { columns: fields, ...(Object.prototype.hasOwnProperty.call(detailSpec, 'design') ? { design: detailSpec.design } : {}) },
    [record],
    { ...options, page: null, total: null },
    { own: 'detail', members: 'fields' },
  );
  const row = vm.rows[0];
  return {
    fields: vm.columns.map((column, index) => ({
      key: column.key,
      label: column.label,
      ...(row?.cells[index] as CellVM),
    })),
    design: vm.design,
  };
}

/** Build the read-only detail model from the shared list display engine. */

import { buildList, type BuildListOptions, type CellVM } from './list';
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

/** Options for building a detail view model. */
export type BuildDetailOptions = BuildListOptions;

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
  const fields = detailSpec.fields;
  const vm = buildList({ columns: fields, design: detailSpec.design }, [record], options);
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

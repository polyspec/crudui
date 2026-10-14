/** Typed reads of the rendered DOM for the component tests: a missing or other element fails with the selector. */

/** The first element under `root` that `selector` matches, an instance of `type`; throws an Error that names `selector` otherwise. */
export function element<T extends Element>(root: ParentNode, selector: string, type: new () => T): T {
  const found = root.querySelector(selector);
  if (!(found instanceof type)) throw new Error(`no ${type.name} matches ${selector}`);
  return found;
}

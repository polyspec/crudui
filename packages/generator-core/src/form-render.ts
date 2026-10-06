/**
 * Render options of a complete form (form-runtime.md, "Complete form"): the form element,
 * the hidden fields, form errors and node errors. Every renderer reads the
 * model this module builds, so each one checks the options and places errors the same way.
 */

import { FormInputError } from '@polyspec/crudui-validator';
import type { NodeVM } from './viewmodel';

/** The submission target of the form element; each member overrides the template's `action`. */
export interface FormRenderAction {
  /** Form method. */
  method?: string;
  /** Form action URL. */
  url?: string;
  /** Form encoding type. */
  enctype?: string;
}

/** One error of a node: a validation result error is accepted unchanged. */
export interface FormRenderError {
  /** Data path of the node; a row's path is its collection path, `.` and its key. */
  path: string;
  /** Message text shown under the node. */
  message: string;
}

/** Options of `renderForm` and of the framework `Form` components. */
export interface FormRenderOptions {
  /** Writes a `form` element with this target. */
  action?: FormRenderAction;
  /** Hidden inputs written inside the form element, in member order; requires `action`. */
  hidden?: Record<string, string>;
  /** Errors of the whole form, written before the form body. */
  formErrors?: string[];
  /** Errors of nodes, written in the errors slot of the node of each path. */
  errors?: FormRenderError[];
}

/** The attributes of the form element, in the order React writes them. */
export interface FormElementAttributes {
  action?: string;
  encType?: string;
  method?: string;
}

/** Checked render options as the renderers use them. */
export interface FormRenderModel {
  /** Form element attributes; absent without `action`. */
  form?: FormElementAttributes;
  /** Hidden inputs as name and value pairs. */
  hidden: Array<[string, string]>;
  /** Form error texts. */
  formErrors: string[];
  /** Error texts of each node that has errors. */
  nodeErrors: Map<NodeVM, string[]>;
}

const MEMBERS = new Set(['action', 'hidden', 'formErrors', 'errors']);
const ACTION_MEMBERS = new Set(['method', 'url', 'enctype']);

// The reference renderer blocks a script URL with this expression, and the control characters
// it skips are the point: a URL may hide them between the letters of the scheme.
// eslint-disable-next-line no-control-regex
const javascriptProtocol = /^[\u0000-\u001F ]*j[\r\n\t]*a[\r\n\t]*v[\r\n\t]*a[\r\n\t]*s[\r\n\t]*c[\r\n\t]*r[\r\n\t]*i[\r\n\t]*p[\r\n\t]*t[\r\n\t]*:/i;
const BLOCKED_URL = "javascript:throw new Error('React has blocked a javascript: URL as a security precaution.')";

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Every node with a data path, by that path: a row's path is its collection path, `.` and its key. */
function nodesByPath(nodes: readonly NodeVM[], parent: string | undefined, out: Map<string, NodeVM>): Map<string, NodeVM> {
  for (const node of nodes) {
    const path = node.kind === 'row' ? `${parent}.${node.key}` : node.kind === 'lang-item' ? undefined : node.path;
    if (path !== undefined) out.set(path, node);
    nodesByPath(node.children ?? [], path, out);
  }
  return out;
}

/**
 * Check render options and build the model the renderers write.
 *
 * @throws {FormInputError} for the first option outside the contract, in the documented order.
 */
export function formRenderModel(
  fields: readonly NodeVM[],
  templateAction: Readonly<Record<string, unknown>> | undefined,
  options: unknown = {},
): FormRenderModel {
  if (!isObject(options)) throw new FormInputError('Render options must be an object');
  for (const name of Object.keys(options)) {
    if (!MEMBERS.has(name)) throw new FormInputError(`Unknown render option: ${name}`);
  }
  const { action, hidden, formErrors, errors } = options;
  if (action !== undefined && (!isObject(action)
    || Object.entries(action).some(([key, value]) => !ACTION_MEMBERS.has(key) || typeof value !== 'string'))) {
    throw new FormInputError('action must be an object with string method, url and enctype');
  }
  if (hidden !== undefined && (!isObject(hidden) || Object.values(hidden).some((value) => typeof value !== 'string'))) {
    throw new FormInputError('hidden must be an object of strings');
  }
  if (hidden !== undefined && action === undefined) throw new FormInputError('hidden requires action');
  if (formErrors !== undefined && (!Array.isArray(formErrors) || formErrors.some((text) => typeof text !== 'string'))) {
    throw new FormInputError('formErrors must be a list of strings');
  }
  if (errors !== undefined && (!Array.isArray(errors)
    || errors.some((error) => !isObject(error) || typeof error.path !== 'string' || typeof error.message !== 'string'))) {
    throw new FormInputError('errors must be a list of objects with string path and message');
  }
  const nodeErrors = new Map<NodeVM, string[]>();
  if (errors !== undefined && errors.length) {
    const byPath = nodesByPath(fields, undefined, new Map());
    for (const { path, message } of errors as FormRenderError[]) {
      const node = byPath.get(path);
      if (!node) throw new FormInputError(`Unknown error path: ${path}`);
      nodeErrors.set(node, [...(nodeErrors.get(node) ?? []), message]);
    }
  }
  let form: FormElementAttributes | undefined;
  if (action !== undefined) {
    const own = action as FormRenderAction;
    const declared = (key: keyof FormRenderAction): string | undefined => {
      const value = own[key] ?? templateAction?.[key];
      return typeof value === 'string' ? value : undefined;
    };
    const url = declared('url');
    const encType = declared('enctype');
    const method = declared('method');
    form = {
      ...(url !== undefined ? { action: javascriptProtocol.test(url) ? BLOCKED_URL : url } : {}),
      ...(encType !== undefined ? { encType } : {}),
      ...(method !== undefined ? { method } : {}),
    };
  }
  return {
    ...(form ? { form } : {}),
    hidden: hidden === undefined ? [] : Object.entries(hidden as Record<string, string>),
    formErrors: (formErrors as string[] | undefined) ?? [],
    nodeErrors,
  };
}

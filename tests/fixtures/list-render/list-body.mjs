/**
 * The list body of a string renderer's list HTML. React's server rendering and the HTML renderer
 * write image preload links before the list; the layout expectations cover the list body only, so
 * the preload links are removed before normalization. The native generator suite compares the
 * complete original HTML, preload links included.
 */
export function listBody(html) {
  return html.replace(/<link [^>]*rel="preload"[^>]*>/g, '');
}

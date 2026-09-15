/**
 * The frame document contract.
 *
 * The CSR frame document is the built frame page: an html start tag without attributes, empty
 * form, structure map and data views, and the frame module. The SSR frame document is the same
 * page with exactly three insertions by the selected server: the language on the html start
 * tag, the rendered form inside the form view, and the JSON payload script immediately before
 * the body end tag. Reading an SSR document removes the insertions and returns the page, so
 * every document is compared with the built page byte for byte.
 */

const nodesOf = node => [node, ...(node.childNodes ?? []).flatMap(nodesOf)];
const attribute = (node, name) => node.attrs?.find(item => item.name === name)?.value;

function one(nodes, predicate, message) {
  const found = nodes.filter(predicate);
  if (found.length !== 1) throw new Error(message);
  return found[0];
}

/**
 * Check one frame document with a parse5 `parse` function and return its parts: `frame` is the
 * built page; an SSR document also returns `language`, the raw `form` HTML and the raw `payload`.
 */
export function readFrameDocument(parse, markup, initialization) {
  if (!['ssr', 'csr'].includes(initialization)) throw new TypeError('Unknown initialization path');
  const nodes = nodesOf(parse(markup, { sourceCodeLocationInfo: true }));
  const byId = id => one(nodes, node => attribute(node, 'id') === id,
    `The frame document must contain one ${id}`);
  const html = one(nodes, node => node.tagName === 'html', 'The frame document must contain one html element');
  const body = one(nodes, node => node.tagName === 'body', 'The frame document must contain one body element');
  const htmlTag = html.sourceCodeLocation?.startTag;
  if (!htmlTag) throw new Error('The frame document must write the html start tag');
  const view = byId('form-view');
  for (const id of ['outline-view', 'data-view']) {
    if (byId(id).childNodes.length !== 0) throw new Error(`The ${id} must be empty`);
  }
  if (!nodes.some(node => node.tagName === 'script' && attribute(node, 'type') === 'module')) {
    throw new Error('The frame document must load the frame module');
  }
  const payloads = nodes.filter(node => node.tagName === 'script' && attribute(node, 'id') === 'crudui-ssr');

  if (initialization === 'csr') {
    // The servers insert the language into this exact start tag.
    if (markup.slice(htmlTag.startOffset, htmlTag.endOffset) !== '<html>') {
      throw new Error('The CSR html start tag must be written as <html>');
    }
    if (view.childNodes.length !== 0) throw new Error('The CSR form view must be empty');
    if (payloads.length !== 0) throw new Error('The CSR frame document must not contain an SSR payload');
    return { frame: markup };
  }

  const language = attribute(html, 'lang');
  if (!['ko', 'en'].includes(language)
      || markup.slice(htmlTag.startOffset, htmlTag.endOffset) !== `<html lang="${language}">`) {
    throw new Error('The SSR html start tag must declare only the language');
  }
  const viewLocation = view.sourceCodeLocation;
  if (markup.slice(viewLocation.startTag.startOffset, viewLocation.startTag.endOffset) !== '<div id="form-view">') {
    throw new Error('The SSR form view start tag must be unchanged');
  }
  if (payloads.length !== 1) throw new Error('The SSR frame document must contain one payload');
  const script = payloads[0].sourceCodeLocation;
  if (markup.slice(script.startTag.startOffset, script.startTag.endOffset)
      !== '<script type="application/json" id="crudui-ssr">') {
    throw new Error('The SSR payload must be one JSON script');
  }
  if (script.endTag?.endOffset !== body.sourceCodeLocation?.endTag?.startOffset) {
    throw new Error('The SSR payload must end immediately before the body end tag');
  }
  const payload = markup.slice(script.startTag.endOffset, script.endTag.startOffset);
  if (/[<>&]/.test(payload)) throw new Error('The SSR payload must escape <, > and &');
  return {
    frame: markup.slice(0, htmlTag.startOffset) + '<html>'
      + markup.slice(htmlTag.endOffset, viewLocation.startTag.endOffset)
      + markup.slice(viewLocation.endTag.startOffset, script.startTag.startOffset)
      + markup.slice(script.endTag.endOffset),
    language,
    form: markup.slice(viewLocation.startTag.endOffset, viewLocation.endTag.startOffset),
    payload,
  };
}

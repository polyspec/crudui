import assert from 'node:assert/strict';
import test from 'node:test';
import { parse } from 'parse5';

import { readFrameDocument } from './frame-document.mjs';

const frame = `<!doctype html>
<html>
<head><meta charset="utf-8"><title>CRUDUI form</title></head>
<body class="frame">
  <form id="form" novalidate><div id="view"><div id="form-view"></div><div id="outline-view"></div><div id="data-view"></div></div></form>
  <script type="module" src="/frames/createForm-react/assets/frame.js"></script>
</body>
</html>
`;
const slash = String.fromCharCode(92);
const form = '<div class="crudui-form"><div class="crudui-form__body">Store &amp; Co</div></div>';
const payload = `{"data":{"name":"${slash}u003cb${slash}u003e"},"generator":{"runtime":"go"}}`;

function ssr(options = {}) {
  const value = { language: 'ko', form, payload, ...options };
  return frame
    .replace('<html>', `<html lang="${value.language}">`)
    .replace('<div id="form-view"></div>', `<div id="form-view">${value.form}</div>`)
    .replace('</body>', `<script type="application/json" id="crudui-ssr">${value.payload}</script></body>`);
}

test('a CSR document is the built frame page', () => {
  assert.deepEqual(readFrameDocument(parse, frame, 'csr'), { frame });
});

test('an SSR document is the built frame page with three insertions', () => {
  assert.deepEqual(readFrameDocument(parse, ssr({ language: 'en' }), 'ssr'), {
    frame, language: 'en', form, payload,
  });
});

test('rejects CSR documents with rendered or server content', () => {
  for (const [markup, message] of [
    [frame.replace('<html>', '<html lang="ko">'), /CSR html start tag/],
    [frame.replace('<html>', '<html >'), /CSR html start tag/],
    [frame.replace('<div id="form-view"></div>', `<div id="form-view">${form}</div>`), /CSR form view must be empty/],
    [frame.replace('</body>', `<script type="application/json" id="crudui-ssr">${payload}</script></body>`), /must not contain an SSR payload/],
    [frame.replace('<div id="outline-view"></div>', ''), /one outline-view/],
    [frame.replace('<div id="data-view"></div>', '<div id="data-view">x</div>'), /data-view must be empty/],
    [frame.replace(/<script type="module"[^>]*><\/script>/, ''), /frame module/],
  ]) assert.throws(() => readFrameDocument(parse, markup, 'csr'), message);
});

test('rejects SSR documents that differ from the three insertions', () => {
  for (const [markup, message] of [
    [ssr().replace('<html lang="ko">', '<html>'), /declare only the language/],
    [ssr().replace('<html lang="ko">', '<html lang="ko" dir="ltr">'), /declare only the language/],
    [ssr({ language: 'de' }), /declare only the language/],
    [ssr().replace('<div id="form-view">', '<div id="form-view" class="x">'), /form view start tag/],
    [ssr({ payload: '{"data":{"name":"&"}}' }), /must escape/],
    [ssr().replace('<script type="application/json" id="crudui-ssr">', '<script id="crudui-ssr" type="application/json">'), /one JSON script/],
    [ssr().replace(/(<script type="application\/json"[^<]*<\/script>)(<\/body>)/, '$1\n$2'), /immediately before the body end tag/],
    [frame.replace('<html>', '<html lang="ko">').replace('<div id="form-view"></div>', `<div id="form-view">${form}</div>`), /one payload/],
    [ssr().replace('<div id="outline-view"></div>', '<div id="outline-view"><p></p></div>'), /outline-view must be empty/],
  ]) assert.throws(() => readFrameDocument(parse, markup, 'ssr'), message);
});

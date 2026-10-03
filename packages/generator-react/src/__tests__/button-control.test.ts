/**
 * Button fields (docs/spec/form-markup.md, Button fields): React's server rendering writes a
 * `button` element with the content, the design class and style, the behavior attributes and the
 * declared attributes, with the bytes of the HTML renderer.
 */
import { describe, expect, test } from 'vitest';
import { compileForm, createForm } from '@crudui/generator-core';
import { renderForm as htmlForm } from '@crudui/generator-html';
import { renderForm } from '../server';

const form = (field: Record<string, unknown>) =>
  createForm(compileForm({ type: 'group', properties: { run: field } }), {}, { language: 'en' });

describe('button output of React', () => {
  test('a button without behavior attributes writes the bytes of the HTML renderer', () => {
    const run = form({ type: 'button', content: 'Run <now>', design: { class: 'primary', style: 'margin: 0', attributes: { 'data-command': 'sync.run' } } });
    expect(renderForm(run)).toContain(
      '<div class="crudui-node__body"><button type="button" class="crudui-action crudui-action--text primary" id="crudui:run" data-command="sync.run" style="margin:0">Run &lt;now&gt;</button></div>');
    expect(renderForm(run)).toBe(htmlForm(run));
  });

  test('a button with a behavior attribute writes the bytes of the HTML renderer', () => {
    const run = form({ type: 'action', label: 'Sync', content: 'Run & go', behavior: { onclick: 'run() && go("x")' } });
    expect(renderForm(run)).toContain(
      '<button type="button" class="crudui-action crudui-action--text" id="crudui:run" onclick="run() &amp;&amp; go(&quot;x&quot;)">Run &amp; go</button>');
    expect(renderForm(run)).toBe(htmlForm(run));
  });
});

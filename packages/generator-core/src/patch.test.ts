// @vitest-environment jsdom
import { describe, expect, test } from 'vitest';
import { patchContent } from './patch';

function root(html: string) {
  const element = document.createElement('div');
  element.innerHTML = html;
  return element;
}

describe('patchContent keeps the nodes the new markup still contains', () => {
  test('controls, their live values and focus survive a render', () => {
    const element = root('<label for="a">A</label><input id="a" name="form[a]" value="1">');
    document.body.append(element);
    const input = element.querySelector('input')!;
    input.value = 'typed';
    input.focus();
    patchContent(element, '<label for="a">Name</label><input id="a" name="form[a]" value="2" class="changed">');
    expect(element.querySelector('input')).toBe(input);
    expect(document.activeElement).toBe(input);
    expect(input.value).toBe('typed');
    expect(input.getAttribute('value')).toBe('2');
    expect(input.className).toBe('changed');
    expect(element.querySelector('label')!.textContent).toBe('Name');
    element.remove();
  });

  test('keyed rows move, disappear and appear by their key', () => {
    const row = (key: string, text: string) => `<div data-crudui-row-key="${key}"><input name="form[rows][${key}][v]" value="${text}"></div>`;
    const element = root(row('a', 'A') + row('b', 'B') + row('c', 'C'));
    const [a, b, c] = Array.from(element.children);
    patchContent(element, row('c', 'C') + row('a', 'A') + row('d', 'D'));
    const rows = Array.from(element.children);
    expect(rows.map(node => node.getAttribute('data-crudui-row-key'))).toEqual(['c', 'a', 'd']);
    expect(rows[0]).toBe(c);
    expect(rows[1]).toBe(a);
    expect(rows).not.toContain(b);
    expect(element.innerHTML).toBe(row('c', 'C') + row('a', 'A') + row('d', 'D'));
  });

  test('checkboxes and radio buttons of one name are matched by value', () => {
    const choices = (values: string[]) => values.map(value => `<input type="checkbox" name="form[tags][]" value="${value}">`).join('');
    const element = root(choices(['x', 'y']));
    const [x, y] = Array.from(element.querySelectorAll('input'));
    patchContent(element, choices(['y', 'x']));
    expect(Array.from(element.querySelectorAll('input'))).toEqual([y, x]);
  });

  test('removed attributes, changed text and a different element are applied', () => {
    const element = root('<p class="old" hidden>Before</p><span>kept</span>');
    const paragraph = element.firstElementChild!;
    patchContent(element, '<p>After</p><strong>kept</strong>');
    expect(element.firstElementChild).toBe(paragraph);
    expect(element.innerHTML).toBe('<p>After</p><strong>kept</strong>');
  });

  test('the result is the new markup', () => {
    const element = root('<ul><li>1</li><li>2</li><li>3</li></ul><p id="x">x</p>');
    const next = '<p id="x" data-a="1">y</p><ul><li>2</li></ul>';
    patchContent(element, next);
    expect(element.innerHTML).toBe(next);
  });
});

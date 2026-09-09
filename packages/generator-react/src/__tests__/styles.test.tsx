import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { act, render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { buildList, compileForm, createForm } from '@crudui/generator-core';
import { Form } from '../components/Form';
import { List } from '../components/List';
import { inputProps, plainProps, resolvedStyleProps, styleObject } from '../components/attrs';

describe('resolved CSS', () => {
  const css = '--caption: "one;two:three"; color: red !important; background-image: url("data:image/svg+xml;utf8,<svg></svg>")';

  it('preserves complete values in the React style object and SSR', () => {
    expect(styleObject(css)).toEqual({ '--caption': '"one;two:three"', color: 'red !important', backgroundImage: 'url("data:image/svg+xml;utf8,<svg></svg>")' });
    const html = renderToStaticMarkup(<div {...plainProps({style: css})} />);
    expect(html).toContain('one;two:three');
    expect(html).toContain('red !important');
    expect(html).toContain('data:image/svg+xml;utf8,');
  });

  it('applies priority, clears removed styles and restores identical DOM HTML', () => {
    const view = render(<div {...resolvedStyleProps(styleObject(css))} />);
    const element = view.container.firstElementChild as HTMLElement;
    const original = element.outerHTML;
    expect(element.style.getPropertyValue('--caption')).toBe('"one;two:three"');
    expect(element.style.getPropertyValue('color')).toBe('red');
    expect(element.style.getPropertyPriority('color')).toBe('important');
    view.rerender(<div {...resolvedStyleProps(styleObject('color: blue'))} />);
    expect(element.style.getPropertyPriority('color')).toBe('');
    view.rerender(<div {...resolvedStyleProps(undefined)} />);
    expect(element.hasAttribute('style')).toBe(false);
    view.rerender(<div {...resolvedStyleProps(styleObject(css))} />);
    expect(element.outerHTML).toBe(original);
    view.unmount();
  });

  it('applies the same CSS behavior to input attribute conversion', () => {
    const view = render(<input {...inputProps({ style: css })} />);
    const input = view.container.querySelector('input')!;
    expect(input.style.getPropertyPriority('color')).toBe('important');
    view.rerender(<input {...inputProps({})} />);
    expect(input.hasAttribute('style')).toBe(false);
    view.unmount();
  });

  it('records React property replacement separately from the model declaration string', () => {
    expect(styleObject('color:red!important; color:blue; --x:one; --x:two')).toEqual({ color: 'blue', '--x': 'two' });
    expect(renderToStaticMarkup(<div {...plainProps({style: 'color:red!important; color:blue; --x:one; --x:two'})} />)).toContain('color:blue;--x:two');
  });

  it('renders identical form HTML after initial data, injection and style restoration', () => {
    const template = compileForm({ type: 'group', properties: {
      active: { type: 'checkbox' },
      name: { type: 'text', design: { style: { '.active': css, true: '' }, wrapper: { style: { '.active': 'border-color: red !important', true: '' } } } },
    } });
    const data = { active: true, name: 'Ada' };
    const initial = createForm(template, data);
    const deferred = createForm(template, {});
    const first = render(<Form form={initial} />);
    const second = render(<Form form={deferred} />);
    try {
      const original = first.container.innerHTML;
      act(() => deferred.setData(data));
      expect(second.container.innerHTML).toBe(original);
      const input = second.container.querySelector('input[name="name"]')! as HTMLInputElement;
      expect(input.style.getPropertyPriority('color')).toBe('important');
      act(() => deferred.setData({ active: false, name: '' }));
      expect(input.hasAttribute('style')).toBe(false);
      act(() => deferred.setData(data));
      expect(second.container.innerHTML).toBe(original);
      act(() => deferred.setData(data));
      expect(second.container.innerHTML).toBe(original);
    } finally {
      first.unmount();
      second.unmount();
    }
  });

  it('applies complete CSS and priority to list wrappers, headings and cells', () => {
    const vm = buildList({
      columns: { name: { field: '.name', design: { style: css } } },
      design: { wrapper: { style: 'border-color: red !important' } },
    }, [{ name: 'Ada' }]);
    const view = render(<List vm={vm} />);
    try {
      const wrapper = view.container.querySelector('.list-view')! as HTMLElement;
      expect(wrapper.style.getPropertyPriority('border-color')).toBe('important');
      for (const element of view.container.querySelectorAll<HTMLElement>('th, td')) {
        expect(element.style.getPropertyValue('--caption')).toBe('"one;two:three"');
        expect(element.style.getPropertyPriority('color')).toBe('important');
      }
      expect(view.container.querySelectorAll('th, td')).toHaveLength(2);
    } finally { view.unmount(); }
  });
});

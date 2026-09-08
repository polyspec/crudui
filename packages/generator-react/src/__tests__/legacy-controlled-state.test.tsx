import React, { StrictMode, useState } from 'react';
import { fireEvent, render, screen, cleanup } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { FormContextProvider, useFormContext } from '../legacy/context/FormContext';
import type { FormData } from '../legacy/types';

afterEach(cleanup);

it('notifies a controlled parent once per change and preserves batched field updates', () => {
  const changed = vi.fn();
  const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
  function Fields() {
    const { setValue } = useFormContext();
    return <button onClick={() => {
      setValue('first', 'A');
      setValue('second', 'B');
    }}>Update</button>;
  }
  function Parent() {
    const [data, setData] = useState<FormData>({});
    return <>
      <FormContextProvider spec={{ type: 'group', properties: {} }} initialData={data}
        onChange={(path, value, next) => { changed(path, value, next); setData(next); }}>
        <Fields />
      </FormContextProvider>
      <output>{JSON.stringify(data)}</output>
    </>;
  }
  try {
    render(<StrictMode><Parent /></StrictMode>);
    fireEvent.click(screen.getByText('Update'));
    expect(changed).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('status').textContent).toBe('{"first":"A","second":"B"}');
    expect(errors).not.toHaveBeenCalled();
  } finally {
    errors.mockRestore();
  }
});

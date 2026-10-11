import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderComponent, resetUnknownWarnings } from './registry';

afterEach(() => {
  vi.restoreAllMocks();
  resetUnknownWarnings();
});

describe('renderComponent', () => {
  it('renders nothing for an unknown type and warns once per type', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(renderComponent({ type: 'Mystery' }, 'a')).toBeNull();
    expect(renderComponent({ type: 'Mystery' }, 'b')).toBeNull();
    expect(renderComponent({ type: 'Other' }, 'c')).toBeNull();
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it('does not resolve prototype keys as components', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(renderComponent({ type: 'constructor' }, 'a')).toBeNull();
  });

  it('registers the input components', () => {
    const types = [
      'TextInput',
      'TextArea',
      'CheckboxGroup',
      'RadioButtonsGroup',
      'Dropdown',
      'OptIn',
      'DatePicker',
      'CalendarPicker',
    ];
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    for (const type of types) expect(renderComponent({ type }, type)).not.toBeNull();
    expect(warn).not.toHaveBeenCalled();
  });
});

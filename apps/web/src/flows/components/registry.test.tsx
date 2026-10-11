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
});

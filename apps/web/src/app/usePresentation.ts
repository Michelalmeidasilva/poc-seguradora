import { useEffect, useLayoutEffect, useState } from 'react';

export type Device = 'iphone' | 'android' | 'desktop';
export type Theme = 'light' | 'dark' | 'system';

function initialDevice(): Device {
  if (/Android/i.test(navigator.userAgent)) return 'android';
  return 'iphone';
}

function initialTheme(): Theme {
  const value = new URLSearchParams(window.location.search).get('theme');
  return value === 'light' || value === 'dark' ? value : 'system';
}

export function usePresentation() {
  const [device, setDevice] = useState<Device>(initialDevice);
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const [narrow, setNarrow] = useState(() => window.matchMedia('(max-width: 600px)').matches);
  const [darkSystem, setDarkSystem] = useState(
    () => window.matchMedia('(prefers-color-scheme: dark)').matches,
  );
  const mobileOS =
    /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  useEffect(() => {
    const width = window.matchMedia('(max-width: 600px)');
    const color = window.matchMedia('(prefers-color-scheme: dark)');
    const resized = (event: MediaQueryListEvent) => setNarrow(event.matches);
    const changed = (event: MediaQueryListEvent) => setDarkSystem(event.matches);
    width.addEventListener('change', resized);
    color.addEventListener('change', changed);
    return () => {
      width.removeEventListener('change', resized);
      color.removeEventListener('change', changed);
    };
  }, []);

  useLayoutEffect(() => {
    document.documentElement.dataset.theme =
      theme === 'system' ? (darkSystem ? 'dark' : 'light') : theme;
  }, [theme, darkSystem]);

  return {
    device,
    theme,
    setDevice,
    setTheme,
    native: device !== 'desktop' && (mobileOS || narrow),
  };
}

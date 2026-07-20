import { useEffect, useState } from 'react';

export type Theme = 'dark' | 'light';

const THEME_KEY = 'investai_theme';

function readStoredTheme(): Theme {
  try {
    return localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

// Flips the `light` class on <html> (index.html applies it pre-paint from the
// same key, so there's no flash on load). Defaults to dark when unset.
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(readStoredTheme);

  useEffect(() => {
    document.documentElement.classList.toggle('light', theme === 'light');
    try { localStorage.setItem(THEME_KEY, theme); } catch {}
  }, [theme]);

  return {
    theme,
    toggleTheme: () => setTheme(t => (t === 'dark' ? 'light' : 'dark')),
  };
}

/**
 * The page themes. Light and dark as before, and warm paper: the white of the page becomes a warm
 * paper tone, and the code editor goes dark. The theme is set on <html> as data-theme, and the
 * colours for each live in styles.css.
 */
export type Theme = 'light' | 'paper' | 'dark';

export const THEME_NAMES: Record<Theme, string> = {
  light: 'Light',
  paper: 'Warm paper',
  dark: 'Dark',
};

const ORDER: Theme[] = ['light', 'paper', 'dark'];

/** The theme the header button moves to next: light, then warm paper, then dark, then light. */
export const nextTheme = (t: Theme): Theme => ORDER[(ORDER.indexOf(t) + 1) % ORDER.length];

/** The code editor has only light and dark; warm paper pairs the paper page with a dark editor. */
export const editorThemeFor = (t: Theme): 'light' | 'dark' => (t === 'light' ? 'light' : 'dark');

export const isTheme = (v: unknown): v is Theme => v === 'light' || v === 'paper' || v === 'dark';

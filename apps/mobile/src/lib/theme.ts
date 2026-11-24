/**
 * Jetons de design partagés avec le Web (mêmes couleurs, mêmes intentions).
 * Aucune dépendance externe : les styles sont calculés à partir de ces valeurs.
 */
export const colors = {
  memo50: '#eef4ff',
  memo100: '#dbe7ff',
  memo500: '#3763f6',
  memo600: '#2145ea',
  memo700: '#1c35d4',
  progress: '#10b981',
  warn: '#f59e0b',
  danger: '#ef4444',
  light: {
    surface: '#ffffff',
    surfaceMuted: '#f6f8fc',
    border: '#e3e9f4',
    text: '#0f172a',
    textMuted: '#5a6b8c',
  },
  dark: {
    surface: '#0b1220',
    surfaceMuted: '#121b2e',
    border: '#24314d',
    text: '#f1f5fd',
    textMuted: '#a4b3cc',
  },
} as const;

export type ThemeMode = 'light' | 'dark';

export function palette(mode: ThemeMode) {
  return mode === 'dark' ? colors.dark : colors.light;
}

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 8, md: 12, lg: 16, pill: 999 } as const;

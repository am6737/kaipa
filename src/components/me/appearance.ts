import type { Theme } from '../../theme/theme';

// Scoped to the profile overview and settings; other pages keep the app theme.
export function makeMeTheme(theme: Theme): Theme {
  return {
    ...theme,
    ...(theme.dark
      ? {
          groupedBg: '#181819',
          surfaceTop: '#242426',
          controlSurface: '#2C2C2E',
          text: '#EEEEEF',
          text2: '#B0B0B4',
          text3: '#929297',
        }
      : {
          groupedBg: '#F6F6F6',
          surfaceTop: '#FEFEFE',
          controlSurface: '#FEFEFE',
          text: '#333333',
          text2: '#707070',
          text3: '#858585',
        }),
  };
}

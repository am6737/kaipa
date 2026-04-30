const ACCENTS = {
  moss:     '#4A7C59',
  forest:   '#2E5C3E',
  hunter:   '#1F4030',
  pine:     '#3A5F4A',
  juniper:  '#5C7A65',
  ember:    '#A84228',
  ochre:    '#A8762B',
  lake:     '#2C5D7E',
  midnight: '#26334D',
  ink:      '#1F2A2D',
};

function _hexToRgb(hex) {
  const h = hex.replace('#', '');
  const n = h.length === 3
    ? h.split('').map(c => parseInt(c + c, 16))
    : [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)];
  return { r: n[0], g: n[1], b: n[2] };
}
function _rgba(hex, a) {
  const { r, g, b } = _hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}
function _mix(hex, mixHex, t) {
  const a = _hexToRgb(hex), b = _hexToRgb(mixHex);
  const r = Math.round(a.r + (b.r - a.r) * t);
  const g = Math.round(a.g + (b.g - a.g) * t);
  const bl = Math.round(a.b + (b.b - a.b) * t);
  return `rgb(${r},${g},${bl})`;
}

function buildTokens({ mode = 'light', accent = '#5C8A4A' } = {}) {
  const dark = mode === 'dark';
  return {
    mode,
    color: dark ? {
      bg:        '#0E1110',
      surface:   '#181C1B',
      surfaceHi: '#212624',
      line:      'rgba(255,253,245,0.10)',
      lineSoft:  'rgba(255,253,245,0.05)',

      ink:       '#F2EFE6',
      inkMuted:  '#A8A498',
      inkDim:    '#6E6B62',

      flare:     accent,
      flareSoft: _rgba(accent, 0.18),
      flareDeep: _mix(accent, '#000000', 0.25),

      moss:      '#8FB078',
      mossSoft:  'rgba(143,176,120,0.16)',
      mossDeep:  '#A8C492',

      sky:       '#7FAFD3',
      skySoft:   'rgba(127,175,211,0.16)',

      sand:      '#C9B894',

      diff: {
        easy: '#8FB078', mod: '#D9B05B',
        hard: accent, expert: _mix(accent,'#000000',0.3), extreme: '#7A2E2E',
      },

      terrain: {
        base: '#1A1F1D', lowland: '#222826', mid: '#2A312D',
        ridge: '#363D38', peak: '#444B45', water: '#1E3140', waterDeep: '#15252F',
        contour: 'rgba(255,253,245,0.07)', contourMajor: 'rgba(255,253,245,0.14)',
        forest: '#243028', snow: '#3F4541',
      },

      glass:     'rgba(24,28,27,0.70)',
      glassDark: 'rgba(14,17,16,0.78)',
    } : {
      bg:        '#F4F1EB',
      surface:   '#FFFFFF',
      surfaceHi: '#FAF8F3',
      line:      'rgba(60,52,42,0.10)',
      lineSoft:  'rgba(60,52,42,0.06)',

      ink:       '#1A1814',
      inkMuted:  '#6B6356',
      inkDim:    '#9A9285',

      flare:     accent,
      flareSoft: _rgba(accent, 0.12),
      flareDeep: _mix(accent, '#000000', 0.20),

      moss:      '#7A9A6E',
      mossSoft:  'rgba(122,154,110,0.14)',
      mossDeep:  '#5A7A52',

      sky:       '#5A8FB5',
      skySoft:   'rgba(90,143,181,0.12)',

      sand:      '#D4B896',

      diff: {
        easy: '#7A9A6E', mod: '#D4A155',
        hard: accent, expert: _mix(accent,'#000000',0.25), extreme: '#7A2E2E',
      },

      terrain: {
        base: '#EDE6D6', lowland: '#E5DCC4', mid: '#D9CBA8',
        ridge: '#C8B488', peak: '#B89F70', water: '#AEC9D9', waterDeep: '#8DAEC4',
        contour: 'rgba(120,100,70,0.18)', contourMajor: 'rgba(120,100,70,0.30)',
        forest: '#9FB58A', snow: '#F2EEE5',
      },

      glass:     'rgba(255,253,248,0.72)',
      glassDark: 'rgba(30,28,24,0.72)',
    },

    font: {
      sans: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Inter", system-ui, sans-serif',
      mono: '"SF Mono", "JetBrains Mono", ui-monospace, Menlo, monospace',
    },
    radius: { sm: 8, md: 12, lg: 18, xl: 24, pill: 9999 },
    space:  [0, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64],
  };
}

window.KAIPA_ACCENTS = ACCENTS;
window.KAIPA_BUILD_TOKENS = buildTokens;
window.KAIPA_TOKENS = buildTokens({ mode: 'light', accent: ACCENTS.moss });

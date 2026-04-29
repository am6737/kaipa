// Kaipa icons — flat 1.6 stroke, currentColor. Outdoor-flavored set.
// Usage: <Icon name="mountain" size={20} />

const KAIPA_ICONS = {
  // Nav / actions
  search: 'M11 4a7 7 0 1 0 4.2 12.6l3.6 3.6 1.4-1.4-3.6-3.6A7 7 0 0 0 11 4Zm0 2a5 5 0 1 1 0 10 5 5 0 0 1 0-10Z',
  layers: 'M12 2 2 7l10 5 10-5-10-5Zm-7 9-3 1.5L12 18l10-5.5-3-1.5-7 4-7-4Z',
  plus:   'M12 5v14M5 12h14',
  close:  'M6 6l12 12M18 6 6 18',
  back:   'M15 18l-6-6 6-6',
  forward:'M9 6l6 6-6 6',
  ellipsis:'M5 12h.01M12 12h.01M19 12h.01',
  filter: 'M4 6h16M7 12h10M10 18h4',
  share:  'M16 6l-4-4-4 4M12 2v13M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7',
  heart:  'M12 21s-7-4.5-9.5-9A5.5 5.5 0 0 1 12 6a5.5 5.5 0 0 1 9.5 6c-2.5 4.5-9.5 9-9.5 9Z',
  heartFill: 'M12 21s-7-4.5-9.5-9A5.5 5.5 0 0 1 12 6a5.5 5.5 0 0 1 9.5 6c-2.5 4.5-9.5 9-9.5 9Z',
  bookmark: 'M6 4h12v17l-6-4-6 4V4Z',
  check:  'M5 12l4.5 4.5L19 7',
  star:   'M12 3l2.7 5.7 6.3.9-4.6 4.4 1.1 6.3L12 17.3 6.5 20.3l1.1-6.3L3 9.6l6.3-.9L12 3Z',

  // Outdoor
  mountain: 'M2 20l5.5-9 4 6 3-4 7.5 7H2Z M16 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z',
  trail:   'M4 20c2-3 1-5 4-5s3 2 5-1 0-6 3-7 4 1 4 1',
  compass: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Zm0 0V2 M16 8l-2 6-6 2 2-6 6-2Z',
  flag:    'M4 21V4M4 4h13l-2 4 2 4H4',
  pin:     'M12 22s7-7.5 7-13a7 7 0 1 0-14 0c0 5.5 7 13 7 13Zm0-10a3 3 0 1 1 0-6 3 3 0 0 1 0 6Z',
  flame:   'M12 22a6 6 0 0 0 6-6c0-3-2-5-3-7-1-2 0-4-3-7 0 4-3 5-4 7s-2 4-2 7a6 6 0 0 0 6 6Z',
  drop:    'M12 22a7 7 0 0 0 7-7c0-5-7-12-7-12S5 10 5 15a7 7 0 0 0 7 7Z',
  camera:  'M3 7h4l2-3h6l2 3h4v12H3V7Z M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z',
  binoc:   'M3 17a3 3 0 0 0 6 0v-7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v7Zm12 0a3 3 0 0 0 6 0v-7a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v7ZM9 8h6',
  tree:    'M12 2c-3 4-5 5-5 8a5 5 0 0 0 4 4.9V22h2v-7.1A5 5 0 0 0 17 10c0-3-2-4-5-8Z',
  weather: 'M7 17a4 4 0 0 1 0-8 5 5 0 0 1 9.6-1A4.5 4.5 0 0 1 17 17H7Z',
  sun:     'M12 5V2M12 22v-3M5 12H2M22 12h-3M6 6l-2-2M20 20l-2-2M6 18l-2 2M20 4l-2 2 M12 7a5 5 0 1 1 0 10 5 5 0 0 1 0-10Z',
  moon:    'M21 13A9 9 0 0 1 11 3a8 8 0 1 0 10 10Z',
  clock:   'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Zm0-15v5l3 2',
  ruler:   'M3 17 17 3l4 4L7 21l-4-4Z M7 13l2 2M11 9l2 2M15 5l2 2',
  altitude:'M3 21h18M5 21V13l4-3 4 5 4-3 4 6v3',

  // Gear
  backpack:'M7 8V5a3 3 0 0 1 3-3h4a3 3 0 0 1 3 3v3M5 8h14a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Zm4 5h6',
  boot:    'M4 14c0-3 1-7 1-9h5l1 4c2 0 3 1 4 3l5 2v6H4v-6Z',
  jacket:  'M8 4h8l4 3-2 4-2-1v12H6V10L4 11l-2-4 4-3h2Zm4 0v6',
  tent:    'M3 20 12 4l9 16H3Z M12 4v16',
  bottle:  'M9 2h6v3l1 2v13a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2V7l1-2V2Z',
  battery: 'M3 8h15a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H3V8Zm-1 8V8M22 11v2',
  light:   'M9 2h6l-1 6h2l-7 14 2-9H8l1-11Z',
  knife:   'M3 17 17 3l4 4-2 2-12 12H3v-4Z',
  socks:   'M9 2v9l-4 5a4 4 0 1 0 6 5l8-8V2H9Z',
  shield:  'M12 2l8 4v6c0 5.5-3.8 9.7-8 11-4.2-1.3-8-5.5-8-11V6l8-4Z',

  // UI bits
  layers2: 'M12 2 2 7l10 5 10-5-10-5Z',
  toggle3d:'M3 12 12 7l9 5-9 5-9-5Z M3 17 12 22l9-5',
  toggle2d:'M3 5h18v14H3z M3 12h18M12 5v14',
  user:    'M12 13a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z M4 21c1-4 4-6 8-6s7 2 8 6',
  users:   'M9 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z M2 21c1-4 3-6 7-6s6 2 7 6 M16 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z M22 21c-.5-3-2-5-5-5',
  chat:    'M21 12a8 8 0 0 1-12 7l-5 1 1-5a8 8 0 1 1 16-3Z',
  bell:    'M6 16V11a6 6 0 1 1 12 0v5l2 3H4l2-3Zm4 3a2 2 0 0 0 4 0',
  play:    'M8 5v14l11-7-11-7Z',
  pause:   'M7 5h3v14H7zM14 5h3v14h-3z',
  stop:    'M7 7h10v10H7z',
  download:'M12 4v12m0 0-4-4m4 4 4-4M4 19h16',
  upload:  'M12 20V8m0 0-4 4m4-4 4 4M4 5h16',
  cloud:   'M7 18a4 4 0 0 1 0-8 5 5 0 0 1 9.6-1A4.5 4.5 0 0 1 17 18H7Z',
  sparkle: 'M12 3l1.8 4.6L18 9l-4.2 1.4L12 15l-1.8-4.6L6 9l4.2-1.4L12 3Z M19 14l1 2.4 2.4 1-2.4 1L19 21l-1-2.6-2.4-1 2.4-1L19 14Z',
  phone:   'M5 3h4l2 5-3 2a11 11 0 0 0 6 6l2-3 5 2v4a2 2 0 0 1-2 2A18 18 0 0 1 3 5a2 2 0 0 1 2-2Z',
  arrowUp: 'M12 19V5M5 12l7-7 7 7',
  chevronLeft: 'M15 18l-6-6 6-6',
  chevronRight:'M9 6l6 6-6 6',
  more:    'M5 12h.01M12 12h.01M19 12h.01',
  image:   'M3 5h18v14H3z M3 16l5-5 4 4 3-3 6 6',
  grid:    'M3 3h8v8H3z M13 3h8v8h-8z M3 13h8v8H3z M13 13h8v8h-8z',
  list:    'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  route:   'M6 4a2 2 0 1 1 0 4 2 2 0 0 1 0-4Zm12 12a2 2 0 1 1 0 4 2 2 0 0 1 0-4ZM6 8c0 6 12 4 12 8',
  lock:    'M6 11V8a6 6 0 1 1 12 0v3M5 11h14v10H5z',
  alert:   'M12 3 1 21h22L12 3Zm0 6v6m0 3v.01',
  globe:   'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM2 12h20M12 2a14 14 0 0 1 0 20M12 2a14 14 0 0 0 0 20',
  navigate:'M3 11 21 3l-8 18-2-8-8-2Z',
  hiker:   'M14 4a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm-1 2-3 4 3 3v7h2v-6l-2-2 2-3 2 4h3v-2h-2l-2-4-3-1Zm-7 7-2 4 1 1 3-3 1 4 2-1-2-5h-3Zm12 2 2 5-2 1-1-4-2 2-1-1 2-3h2Z',
  mic:     'M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Zm6-3a6 6 0 0 1-12 0M12 17v4M8 21h8',
};

function Icon({ name, size = 20, color = 'currentColor', strokeWidth = 1.6, fill = 'none', style = {} }) {
  const d = KAIPA_ICONS[name];
  if (!d) return null;
  const filled = name.endsWith('Fill') || name === 'play' || name === 'pause' || name === 'stop' || name === 'navigate' || name === 'star';
  return (
    <svg width={size} height={size} viewBox="0 0 24 24"
         fill={filled ? color : fill}
         stroke={filled ? 'none' : color}
         strokeWidth={strokeWidth}
         strokeLinecap="round" strokeLinejoin="round"
         style={{ flexShrink: 0, ...style }}>
      <path d={d} />
    </svg>
  );
}

window.Icon = Icon;
window.KAIPA_ICONS = KAIPA_ICONS;

// Kaipa map v2 — Apple Maps-inspired warm topo, with zoom levels
// Renders different "altitudes" of view:
//   zoom='trail'  → close-up of one route (hero detail map)
//   zoom='region' → city-scale, multiple routes as pins
//   zoom='globe'  → 3D earth with curved horizon and route arcs

const T2 = new Proxy({}, { get: (_, p) => window.KAIPA_TOKENS.color.terrain[p] });
const C2 = new Proxy({}, { get: (_, p) => window.KAIPA_TOKENS.color[p] });

// ── Generated noise blobs ─────────────────────────────────────
function blob(cx, cy, r, seed) {
  const points = 12;
  const path = [];
  for (let i = 0; i < points; i++) {
    const ang = (i / points) * Math.PI * 2;
    const noise = 0.7 + ((seed * 13 + i * 7) % 30) / 100;
    const x = cx + Math.cos(ang) * r * noise;
    const y = cy + Math.sin(ang) * r * noise;
    path.push((i === 0 ? 'M' : 'L') + x.toFixed(1) + ',' + y.toFixed(1));
  }
  return path.join(' ') + ' Z';
}

function smoothContour({ y, a, p, ph }, w = 800) {
  const steps = 50;
  let d = '';
  for (let i = 0; i <= steps; i++) {
    const x = (w / steps) * i;
    const yy = y + Math.sin((x / p) * Math.PI * 2 + (ph * Math.PI / 180)) * a
                 + Math.sin((x / (p * 0.35)) * Math.PI * 2 + ph * 0.7) * (a * 0.3);
    d += (i === 0 ? 'M' : 'L') + x.toFixed(1) + ' ' + yy.toFixed(1) + ' ';
  }
  return d;
}

// ── Zoom: Trail (close-up route) ────────────────────────────
function MapTrail({ width = 800, height = 900, animateRoute = false, showLabels = true }) {
  const contours = Array.from({ length: 18 }, (_, i) => ({
    y: 80 + i * 45,
    a: 30 - i * 0.6,
    p: 200 - i * 4,
    ph: i * 25,
    major: i % 3 === 0,
  }));

  const route = 'M120,700 C200,650 240,580 290,520 S380,400 420,340 S520,220 580,200 S680,250 720,260';

  const pois = [
    { x: 120, y: 700, type: 'start', label: '西栅子村',    sub: '730m · 起点' },
    { x: 290, y: 520, type: 'photo', label: '北京结',      sub: '1280m' },
    { x: 420, y: 340, type: 'peak',  label: '鹰飞倒仰',    sub: '1410m' },
    { x: 580, y: 200, type: 'photo', label: '天梯',        sub: '1390m' },
    { x: 720, y: 260, type: 'end',   label: '九眼楼',      sub: '1180m · 终点' },
  ];

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" height="100%"
         preserveAspectRatio="xMidYMid slice"
         style={{ display: 'block', background: T2.base }}>
      <defs>
        <linearGradient id="trail-bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={T2.peak} />
          <stop offset="40%" stopColor={T2.ridge} />
          <stop offset="80%" stopColor={T2.lowland} />
          <stop offset="100%" stopColor={T2.base} />
        </linearGradient>
        <filter id="soft-shadow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur in="SourceAlpha" stdDeviation="3" />
          <feOffset dx="0" dy="2" result="offsetblur" />
          <feComponentTransfer><feFuncA type="linear" slope="0.3"/></feComponentTransfer>
          <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>

      <rect width={width} height={height} fill="url(#trail-bg)" />

      {/* Soft hill shading */}
      <path d={blob(220, 180, 130, 1)} fill={T2.peak} opacity="0.65" />
      <path d={blob(500, 120, 140, 2)} fill={T2.peak} opacity="0.7" />
      <path d={blob(680, 220, 100, 3)} fill={T2.ridge} opacity="0.5" />

      {/* Forest blobs */}
      <path d={blob(150, 600, 90, 4)} fill={T2.forest} opacity="0.35" />
      <path d={blob(620, 750, 110, 5)} fill={T2.forest} opacity="0.4" />

      {/* Contour lines */}
      {contours.map((c, i) => (
        <path key={i} d={smoothContour(c, width)} fill="none"
              stroke={c.major ? T2.contourMajor : T2.contour}
              strokeWidth={c.major ? 0.8 : 0.5} />
      ))}

      {/* Route — soft white halo + coral line */}
      <path d={route} fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="8" strokeLinecap="round" />
      <path d={route} fill="none" stroke={C2.flare} strokeWidth="3.5" strokeLinecap="round"
            strokeDasharray={animateRoute ? '1100' : undefined}
            strokeDashoffset={animateRoute ? '1100' : undefined}>
        {animateRoute && <animate attributeName="stroke-dashoffset" from="1100" to="0" dur="2.5s" fill="freeze" />}
      </path>

      {/* POIs */}
      {pois.map((p, i) => <PoiPin key={i} poi={p} showLabel={showLabels} />)}
    </svg>
  );
}

function PoiPin({ poi, showLabel }) {
  const cfg = {
    start: { color: C2.moss,  glyph: '●' },
    end:   { color: C2.flare, glyph: '◆' },
    peak:  { color: C2.flare, glyph: '▲' },
    photo: { color: C2.sky,   glyph: '◉' },
  }[poi.type] || { color: C2.flare, glyph: '●' };

  return (
    <g transform={`translate(${poi.x}, ${poi.y})`}>
      {/* Drop shadow */}
      <ellipse cx="0" cy="3" rx="11" ry="3" fill="rgba(0,0,0,0.15)" />
      {/* Pin body */}
      <circle r="9" fill="#fff" />
      <circle r="6" fill={cfg.color} />
      {showLabel && (
        <g transform="translate(16, -5)">
          <text fontSize="13" fontWeight="600"
                fill={C2.ink} fontFamily={window.KAIPA_TOKENS.font.sans}
                style={{ paintOrder: 'stroke', stroke: 'rgba(255,253,248,0.92)', strokeWidth: 4, strokeLinejoin: 'round' }}>
            {poi.label}
          </text>
          <text y="14" fontSize="10"
                fill={C2.inkMuted} fontFamily={window.KAIPA_TOKENS.font.mono}
                style={{ paintOrder: 'stroke', stroke: 'rgba(255,253,248,0.92)', strokeWidth: 3, strokeLinejoin: 'round' }}>
            {poi.sub}
          </text>
        </g>
      )}
    </g>
  );
}

// ── Zoom: Region (city-scale discover view) ─────────────────
function MapRegion({ width = 800, height = 900, showLabels = true, onPinClick, activeId }) {
  const routes = [
    { id: 'xiang',   x: 180, y: 240, name: '香山·南北穿越', diff: 'easy', d: '6.2km', pop: 0.95, rating: 4.7,
      path: 'M120,180 Q160,210 200,250 T240,290' },
    { id: 'jiankou', x: 380, y: 200, name: '箭扣长城',     diff: 'hard', d: '11.4km', pop: 0.88, rating: 4.9,
      path: 'M310,150 Q360,180 400,210 T460,250' },
    { id: 'haituo',  x: 580, y: 280, name: '海坨山',       diff: 'hard', d: '18.1km', pop: 0.55, rating: 4.6,
      path: 'M520,230 Q560,260 600,290 T660,330' },
    { id: 'lingshan',x: 280, y: 460, name: '灵山',         diff: 'mod',  d: '9.7km', pop: 0.65, rating: 4.5,
      path: 'M220,420 Q260,450 300,470 T350,490' },
    { id: 'yunmeng', x: 520, y: 480, name: '云蒙山',       diff: 'mod',  d: '7.3km', pop: 0.72, rating: 4.4,
      path: 'M460,440 Q500,470 540,490 T590,510' },
    { id: 'wuling',  x: 680, y: 580, name: '雾灵山',       diff: 'hard', d: '14.8km', pop: 0.40, rating: 4.7,
      path: 'M620,540 Q670,570 700,600 T740,640' },
    { id: 'shangfang',x:150, y: 560, name: '上方山',       diff: 'easy', d: '5.1km', pop: 0.30, rating: 4.2,
      path: 'M100,530 Q140,550 170,570 T210,590' },
    { id: 'shisanling',x:420, y: 700, name: '十三陵环线',   diff: 'easy', d: '14.2km', pop: 0.50, rating: 4.3,
      path: 'M360,670 Q410,690 440,710 T490,720' },
  ];

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" height="100%"
         preserveAspectRatio="xMidYMid slice"
         style={{ display: 'block', background: T2.lowland }}>
      <defs>
        <radialGradient id="region-bg" cx="0.5" cy="0.4" r="0.7">
          <stop offset="0%" stopColor={T2.lowland} />
          <stop offset="100%" stopColor={T2.base} />
        </radialGradient>
        <filter id="route-glow">
          <feGaussianBlur stdDeviation="3" />
        </filter>
      </defs>
      <rect width={width} height={height} fill="url(#region-bg)" />

      {/* Mountain ranges as soft blobs */}
      {[
        { x: 180, y: 200, r: 70, c: T2.ridge },
        { x: 400, y: 170, r: 90, c: T2.peak },
        { x: 600, y: 230, r: 100, c: T2.peak },
        { x: 280, y: 440, r: 80, c: T2.ridge },
        { x: 540, y: 460, r: 75, c: T2.ridge },
        { x: 680, y: 550, r: 95, c: T2.ridge },
      ].map((m, i) => (
        <path key={i} d={blob(m.x, m.y, m.r, i + 7)} fill={m.c} opacity="0.6" />
      ))}

      {/* Forest blobs */}
      {[[100, 380, 60], [350, 600, 90], [620, 380, 70]].map(([x, y, r], i) => (
        <path key={i} d={blob(x, y, r, i + 20)} fill={T2.forest} opacity="0.35" />
      ))}

      {/* Water — Beijing reservoirs (stylized) */}
      <path d={blob(450, 750, 50, 30)} fill={T2.water} opacity="0.85" />
      <path d={blob(720, 350, 30, 31)} fill={T2.water} opacity="0.85" />

      {/* Roads — subtle white lines */}
      <path d="M0,400 Q200,420 400,380 T800,420" fill="none" stroke="#fff" strokeWidth="2" opacity="0.6" />
      <path d="M400,0 Q420,300 380,500 T420,900" fill="none" stroke="#fff" strokeWidth="2" opacity="0.6" />

      {/* City label */}
      <text x="400" y="100" textAnchor="middle"
            fontSize="14" fontWeight="600" fill={C2.inkMuted}
            fontFamily={window.KAIPA_TOKENS.font.sans} letterSpacing="3">
        BEIJING · 北京
      </text>

      {/* Route trails — popularity → opacity & width (heatmap effect) */}
      {routes.map((r, i) => {
        const color = C2.diff[r.diff];
        // popularity 0..1 → width 1.4..4.6, opacity 0.3..0.95
        const w = 1.4 + r.pop * 3.2;
        const op = 0.30 + r.pop * 0.65;
        const isActive = activeId === r.id;
        return (
          <g key={i}>
            {/* Outer glow for popular routes */}
            {r.pop > 0.6 && (
              <path d={r.path} fill="none" stroke={color}
                    strokeWidth={w * 2.5} opacity={r.pop * 0.18}
                    filter="url(#route-glow)" strokeLinecap="round" />
            )}
            {/* Halo */}
            <path d={r.path} fill="none" stroke="rgba(255,255,255,0.85)"
                  strokeWidth={w + 2.5} strokeLinecap="round" />
            {/* Main line */}
            <path d={r.path} fill="none" stroke={color}
                  strokeWidth={w} opacity={op} strokeLinecap="round" />
            {/* Active highlight */}
            {isActive && (
              <path d={r.path} fill="none" stroke={C2.flare}
                    strokeWidth={w + 1} strokeLinecap="round">
                <animate attributeName="opacity" values="0.4;1;0.4" dur="1.6s" repeatCount="indefinite" />
              </path>
            )}
          </g>
        );
      })}

      {/* Route pins */}
      {routes.map((r, i) => (
        <RoutePin key={i} route={r} showLabel={showLabels}
                  active={activeId === r.id}
                  onClick={() => onPinClick && onPinClick(r)} />
      ))}
    </svg>
  );
}

// Stylized "photo" of a place — rendered as SVG inside a clipped circle.
// Each route gets a unique scene seeded by its id.
function PlacePhoto({ id, size = 38 }) {
  const scenes = {
    // 香山 — autumn red leaves over hills
    xiang: { sky1: '#FFD9A8', sky2: '#FF9E6E', mtn: '#A84228', mtn2: '#7A2C1A', accent: '#FFE4A0', tree: '#C9472E' },
    // 箭扣长城 — dramatic ridge with wall
    jiankou: { sky1: '#D4C8B0', sky2: '#8E7E68', mtn: '#5C4D3E', mtn2: '#3A2E25', accent: '#E8DDC2', tree: '#736455', wall: true },
    // 海坨山 — high alpine, snow
    haituo: { sky1: '#CDDAE4', sky2: '#7E96A8', mtn: '#56688A', mtn2: '#34465E', accent: '#FFFFFF', tree: '#4A5C76', snow: true },
    // 灵山 — green meadows
    lingshan: { sky1: '#D5E2C8', sky2: '#9BB389', mtn: '#5C7A4E', mtn2: '#3D5634', accent: '#F0E4A8', tree: '#496B3E' },
    // 云蒙山 — misty cloud ridges
    yunmeng: { sky1: '#E5DEEA', sky2: '#A89BB6', mtn: '#6B5E78', mtn2: '#473C56', accent: '#F0E8F3', tree: '#5A4D68', mist: true },
    // 雾灵山 — pine forest deep
    wuling: { sky1: '#C2D1B8', sky2: '#7A8E6E', mtn: '#3D5634', mtn2: '#1F2E1A', accent: '#A8C09A', tree: '#2D4226' },
    // 上方山 — soft golden hills
    shangfang: { sky1: '#F4E4BC', sky2: '#D2B07A', mtn: '#9E7A4A', mtn2: '#6E5230', accent: '#FFF4D4', tree: '#7E6238' },
    // 十三陵 — ancient cypress
    shisanling: { sky1: '#E0D8C8', sky2: '#B0A28A', mtn: '#7E6E54', mtn2: '#534632', accent: '#D8C8A4', tree: '#3E4E36' },
  };
  const s = scenes[id] || scenes.lingshan;
  const r = size / 2;
  const clipId = `pp-clip-${id}`;
  const skyId = `pp-sky-${id}`;
  return (
    <>
      <defs>
        <clipPath id={clipId}>
          <circle cx="0" cy="0" r={r - 1} />
        </clipPath>
        <linearGradient id={skyId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={s.sky1} />
          <stop offset="100%" stopColor={s.sky2} />
        </linearGradient>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        {/* Sky */}
        <rect x={-r} y={-r} width={size} height={size} fill={`url(#${skyId})`} />
        {/* Sun/moon */}
        <circle cx={r * 0.35} cy={-r * 0.45} r={r * 0.18} fill={s.accent} opacity="0.8" />
        {/* Distant ridge */}
        <path d={`M${-r},${r * 0.1} L${-r * 0.5},${-r * 0.2} L${0},${r * 0.05} L${r * 0.5},${-r * 0.3} L${r},${r * 0.1} L${r},${r} L${-r},${r} Z`}
              fill={s.mtn} opacity="0.85" />
        {/* Foreground ridge */}
        <path d={`M${-r},${r * 0.5} L${-r * 0.3},${r * 0.15} L${r * 0.1},${r * 0.35} L${r * 0.5},${r * 0.05} L${r},${r * 0.4} L${r},${r} L${-r},${r} Z`}
              fill={s.mtn2} />
        {/* Special: snow cap */}
        {s.snow && (
          <path d={`M${-r * 0.3},${-r * 0.18} L${0},${r * 0.06} L${r * 0.5},${-r * 0.3} L${r * 0.3},${-r * 0.4} L${r * 0.1},${-r * 0.22} L${-r * 0.1},${-r * 0.32} Z`}
                fill="#FAFAFA" />
        )}
        {/* Special: wall (great wall stylized) */}
        {s.wall && (
          <g stroke="#2A2118" strokeWidth="1" fill="#7A6A55">
            <path d={`M${-r},${r * 0.1} L${-r * 0.5},${-r * 0.2} L${0},${r * 0.05} L${r * 0.5},${-r * 0.3} L${r},${r * 0.1}`}
                  strokeWidth="1.5" fill="none" stroke="#3A2E25" />
          </g>
        )}
        {/* Special: mist */}
        {s.mist && (
          <ellipse cx="0" cy={r * 0.1} rx={r * 0.9} ry={r * 0.12} fill="#FFFFFF" opacity="0.55" />
        )}
        {/* Trees in foreground */}
        <g fill={s.tree}>
          <circle cx={-r * 0.55} cy={r * 0.55} r={r * 0.15} />
          <circle cx={-r * 0.3} cy={r * 0.7} r={r * 0.18} />
          <circle cx={r * 0.4} cy={r * 0.6} r={r * 0.14} />
        </g>
      </g>
      {/* Inner highlight */}
      <circle cx="0" cy="0" r={r - 1.5} fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="0.5" />
    </>
  );
}

function RoutePin({ route, showLabel, active, onClick }) {
  const color = C2.diff[route.diff];
  const scale = active ? 1.18 : 1;
  const size = 38;
  const r = size / 2;
  return (
    <g transform={`translate(${route.x}, ${route.y}) scale(${scale})`}
       onClick={onClick}
       style={{ cursor: 'pointer', transition: 'transform .22s cubic-bezier(0.34, 1.56, 0.64, 1)' }}>
      {/* Drop shadow */}
      <ellipse cx="0" cy={r + 4} rx={r * 0.7} ry="2.5" fill="rgba(0,0,0,0.22)" />
      {/* White ring (border) */}
      <circle cx="0" cy="0" r={r} fill="#fff" />
      {/* Photo */}
      <PlacePhoto id={route.id} size={size} />
      {/* Difficulty dot — bottom-right indicator */}
      <circle cx={r * 0.7} cy={r * 0.7} r="4.5" fill="#fff" />
      <circle cx={r * 0.7} cy={r * 0.7} r="3" fill={color} />
      {/* Active ring — pulse */}
      {active && (
        <>
          <circle cx="0" cy="0" r={r + 2} fill="none" stroke={C2.flare} strokeWidth="2" />
          <circle cx="0" cy="0" r={r + 2} fill="none" stroke={C2.flare} strokeWidth="2" opacity="0.55">
            <animate attributeName="r" values={`${r + 2};${r + 12};${r + 2}`} dur="1.8s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.6;0;0.6" dur="1.8s" repeatCount="indefinite" />
          </circle>
        </>
      )}
      {/* Hit area */}
      <circle cx="0" cy="0" r={r + 4} fill="transparent" />
      {showLabel && !active && (
        <g transform={`translate(${r + 6}, 4)`}>
          <text fontSize="12" fontWeight="600"
                fill={C2.ink} fontFamily={window.KAIPA_TOKENS.font.sans}
                style={{ paintOrder: 'stroke', stroke: 'rgba(255,253,248,0.92)', strokeWidth: 3.5 }}>
            {route.name}
          </text>
          <text y="13" fontSize="10"
                fill={C2.inkMuted} fontFamily={window.KAIPA_TOKENS.font.mono}
                style={{ paintOrder: 'stroke', stroke: 'rgba(255,253,248,0.92)', strokeWidth: 3 }}>
            {route.d}
          </text>
        </g>
      )}
    </g>
  );
}

// ── Zoom: Globe (3D earth, world view) ──────────────────────
function MapGlobe({ width = 800, height = 900 }) {
  const cx = width / 2;
  const cy = height / 2 + 40;
  const r = Math.min(width, height) * 0.46;

  // Continent blobs (very stylized — not geographically accurate)
  const continents = [
    // Asia
    'M 510,420 C 540,360 620,340 680,360 C 720,380 740,420 720,470 C 700,510 660,520 620,510 C 580,510 530,490 510,460 Z',
    // Europe
    'M 440,380 C 460,360 490,360 510,380 C 510,410 480,420 460,410 Z',
    // Africa
    'M 470,490 C 500,480 540,500 540,560 C 540,620 510,640 480,620 C 450,600 450,520 470,490 Z',
    // Americas
    'M 270,420 C 250,400 240,440 260,490 C 270,540 290,580 310,560 C 320,500 290,440 270,420 Z',
    'M 320,380 C 340,370 360,390 360,410 C 350,430 320,420 320,380 Z',
    // Australia
    'M 700,580 C 730,570 770,580 770,610 C 760,630 720,630 700,610 Z',
  ];

  // Featured route arcs on globe
  const arcs = [
    { from: [560, 460], to: [620, 480], label: '富士山', color: C2.flare },
    { from: [610, 470], to: [650, 460], label: '箭扣长城', color: C2.flare },
    { from: [290, 460], to: [310, 480], label: '优胜美地', color: C2.flare },
    { from: [460, 400], to: [490, 410], label: '白朗峰', color: C2.flare },
  ];

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" height="100%"
         preserveAspectRatio="xMidYMid slice"
         style={{ display: 'block', background: '#0E1B2E' }}>
      <defs>
        <radialGradient id="space-bg" cx="0.5" cy="0.45" r="0.6">
          <stop offset="0%" stopColor="#1A2D4A" />
          <stop offset="100%" stopColor="#06101F" />
        </radialGradient>
        <radialGradient id="globe-ocean" cx="0.42" cy="0.38" r="0.7">
          <stop offset="0%" stopColor="#7BAED2" />
          <stop offset="50%" stopColor="#3D7AA8" />
          <stop offset="90%" stopColor="#1E466E" />
          <stop offset="100%" stopColor="#0F2640" />
        </radialGradient>
        <radialGradient id="atmosphere" cx="0.5" cy="0.5" r="0.6">
          <stop offset="78%" stopColor="transparent" />
          <stop offset="92%" stopColor="rgba(140,200,255,0.4)" />
          <stop offset="100%" stopColor="transparent" />
        </radialGradient>
        <radialGradient id="terminator" cx="0.75" cy="0.35" r="0.85">
          <stop offset="0%" stopColor="rgba(255,220,180,0.0)" />
          <stop offset="60%" stopColor="rgba(0,0,0,0.0)" />
          <stop offset="100%" stopColor="rgba(0,0,0,0.55)" />
        </radialGradient>
      </defs>

      <rect width={width} height={height} fill="url(#space-bg)" />

      {/* Distant stars */}
      {[[120, 200, 1.5], [250, 130, 1], [680, 180, 1.2], [750, 350, 1], [80, 480, 0.8], [710, 720, 1.3], [180, 750, 1]].map(([x, y, rr], i) => (
        <circle key={i} cx={x} cy={y} r={rr} fill="#fff" opacity={0.4 + (i % 3) * 0.2} />
      ))}

      {/* Atmosphere glow */}
      <circle cx={cx} cy={cy} r={r + 22} fill="url(#atmosphere)" />

      {/* Globe body */}
      <circle cx={cx} cy={cy} r={r} fill="url(#globe-ocean)" />

      {/* Latitude/longitude grid */}
      {[-60, -30, 0, 30, 60].map(lat => {
        const yy = cy + (lat / 90) * r * 0.95;
        const rx = r * Math.cos((lat / 90) * Math.PI / 2);
        return <ellipse key={lat} cx={cx} cy={yy} rx={rx} ry={rx * 0.04} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="0.6" />;
      })}
      {[0, 30, 60, 90, 120, 150].map(lon => {
        const ratio = lon / 180;
        const rx = r * Math.cos(ratio * Math.PI - Math.PI / 2);
        return <ellipse key={lon} cx={cx} cy={cy} rx={Math.abs(rx)} ry={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="0.5" />;
      })}

      {/* Continents */}
      <g>
        {continents.map((d, i) => (
          <path key={i} d={d} fill={T2.lowland} opacity="0.92" />
        ))}
        {/* Highlight shading on continents */}
        {continents.map((d, i) => (
          <path key={`s-${i}`} d={d} fill={T2.peak} opacity="0.18" />
        ))}
      </g>

      {/* Day/night terminator */}
      <circle cx={cx} cy={cy} r={r} fill="url(#terminator)" />

      {/* Specular highlight */}
      <ellipse cx={cx - r * 0.35} cy={cy - r * 0.35} rx={r * 0.25} ry={r * 0.15}
               fill="rgba(255,255,255,0.12)" />

      {/* Featured route pulses */}
      {arcs.map((a, i) => (
        <g key={i}>
          <circle cx={a.to[0]} cy={a.to[1]} r="4" fill={a.color} />
          <circle cx={a.to[0]} cy={a.to[1]} r="4" fill={a.color} opacity="0.5">
            <animate attributeName="r" values="4;14;4" dur="2.5s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.5;0;0.5" dur="2.5s" repeatCount="indefinite" />
          </circle>
        </g>
      ))}
    </svg>
  );
}

function KaipaMap({ zoom = 'trail', mode = '2d', scene, density = 'rich', showLabels = true, animateRoute = false, width = 800, height = 900, style = {}, onPinClick, activeId }) {
  // Back-compat: 'world' scene → region zoom
  const z = zoom || (scene === 'world' ? 'region' : 'trail');
  if (z === 'globe') return <MapGlobe width={width} height={height} />;
  if (z === 'region' || scene === 'world') return <MapRegion width={width} height={height} showLabels={showLabels} onPinClick={onPinClick} activeId={activeId} />;
  return <MapTrail width={width} height={height} showLabels={showLabels} animateRoute={animateRoute} />;
}

window.KaipaMap = KaipaMap;
window.MapTrail = MapTrail;
window.MapRegion = MapRegion;
window.MapGlobe = MapGlobe;

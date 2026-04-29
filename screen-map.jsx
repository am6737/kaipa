// Kaipa screens v2 — Apple-style, full-bleed map with floating glass chrome
// NOTE: K/C are getters so they always return current theme tokens.
const _K = () => window.KAIPA_TOKENS;
const _C = () => window.KAIPA_TOKENS.color;
const K = new Proxy({}, { get: (_, p) => _K()[p] });
const C = new Proxy({}, { get: (_, p) => _C()[p] });

// ── Liquid glass primitive (light) ────────────────────────────
function Glass({ children, dark = false, style = {}, radius = 18, ...rest }) {
  return (
    <div {...rest} style={{
      background: dark ? C.glassDark : C.glass,
      backdropFilter: 'blur(28px) saturate(180%)',
      WebkitBackdropFilter: 'blur(28px) saturate(180%)',
      border: dark ? '0.5px solid rgba(255,255,255,0.12)' : '0.5px solid rgba(255,255,255,0.6)',
      boxShadow: dark
        ? '0 1px 0 rgba(255,255,255,0.06) inset, 0 8px 30px rgba(0,0,0,0.25)'
        : '0 1px 0 rgba(255,255,255,0.7) inset, 0 6px 24px rgba(40,30,20,0.10), 0 1px 3px rgba(40,30,20,0.06)',
      borderRadius: radius,
      ...style,
    }}>{children}</div>
  );
}

function Pill({ children, active = false, style = {}, dark = false }) {
  return (
    <Glass dark={dark} radius={999} style={{
      padding: '7px 12px',
      display: 'inline-flex', alignItems: 'center', gap: 6,
      background: active ? C.flare : (dark ? C.glassDark : C.glass),
      color: active ? '#fff' : (dark ? '#fff' : C.ink),
      border: active ? `0.5px solid ${C.flare}` : undefined,
      fontSize: 12, fontWeight: 500, fontFamily: K.font.sans,
      whiteSpace: 'nowrap', letterSpacing: -0.1,
      ...style,
    }}>{children}</Glass>
  );
}

function Stat({ value, label, unit }) {
  return (
    <div>
      <div style={{
        fontFamily: K.font.sans, fontSize: 22, fontWeight: 600,
        color: C.ink, letterSpacing: -0.5, lineHeight: 1,
      }}>
        {value}
        {unit && <span style={{ fontSize: 12, color: C.inkDim, marginLeft: 2, fontWeight: 500 }}>{unit}</span>}
      </div>
      <div style={{
        fontSize: 11, fontFamily: K.font.sans, color: C.inkMuted,
        marginTop: 4, letterSpacing: -0.1,
      }}>{label}</div>
    </div>
  );
}

function DiffBadge({ level }) {
  const labels = { easy: '入门 T1', mod: '中等 T2', hard: '困难 T3', expert: '专家 T4' };
  const color = C.diff[level] || C.flare;
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '4px 9px', borderRadius: 999,
      background: color + '1A', color,
      fontSize: 11, fontFamily: K.font.sans, fontWeight: 600,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: 99, background: color }} />
      {labels[level] || level}
    </div>
  );
}

function CircleBtn({ icon, onClick, dark = false, color, size = 44, iconSize = 18 }) {
  return (
    <Glass dark={dark} radius={999} style={{
      width: size, height: size, display: 'flex',
      alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
    }}>
      <window.Icon name={icon} size={iconSize} color={color || (dark ? '#fff' : C.ink)} />
    </Glass>
  );
}

// ─────────────────────────────────────────────────────────────
// SCREEN 1: Map Home — full-bleed, with zoom levels
// ─────────────────────────────────────────────────────────────
function ScreenMap({ tweaks = {} }) {
  const [zoom, setZoom] = React.useState(tweaks.initialZoom || 'region');
  const [activeRoute, setActiveRoute] = React.useState(null);
  React.useEffect(() => {
    if (tweaks.initialZoom) setZoom(tweaks.initialZoom);
  }, [tweaks.initialZoom]);

  const isGlobe = zoom === 'globe';
  const immersive = !!tweaks.immersive;
  const isRegion = zoom === 'region';

  return (
    <div style={{
      position: 'relative', height: '100%', width: '100%',
      background: C.bg, overflow: 'hidden',
    }}>
      {/* Full-bleed map */}
      <div style={{ position: 'absolute', inset: 0 }}>
        <window.KaipaMap zoom={zoom}
                         showLabels={tweaks.showLabels !== false && !isGlobe}
                         onPinClick={(r) => setActiveRoute(r)}
                         activeId={activeRoute?.id} />
      </div>

      {immersive ? null : <>
      {/* Status bar (light or dark depending on map) */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 30 }}>
        <window.IOSStatusBar dark={isGlobe} />
      </div>

      {/* Top: search + profile */}
      <div style={{
        position: 'absolute', top: 56, left: 16, right: 16, zIndex: 20,
        display: 'flex', gap: 8, alignItems: 'center',
      }}>
        <Glass dark={isGlobe} radius={999} style={{
          flex: 1, height: 46, display: 'flex', alignItems: 'center',
          gap: 10, padding: '0 16px',
        }}>
          <window.Icon name="search" size={17} color={isGlobe ? 'rgba(255,255,255,0.7)' : C.inkMuted} />
          <span style={{
            color: isGlobe ? 'rgba(255,255,255,0.7)' : C.inkMuted,
            fontSize: 15, flex: 1, letterSpacing: -0.2,
          }}>
            {isGlobe ? '探索全世界路线' : '搜索路线、山峰、地点'}
          </span>
        </Glass>
        <CircleBtn icon="user" dark={isGlobe} size={46} />
      </div>

      {/* Globe-specific: featured destinations strip */}
      {isGlobe && (
        <div style={{
          position: 'absolute', top: 130, left: 16, right: 16, zIndex: 20,
        }}>
          <div style={{
            fontSize: 9, fontFamily: K.font.mono, color: 'rgba(255,255,255,0.5)',
            letterSpacing: 1.5, marginBottom: 8, paddingLeft: 4,
          }}>FEATURED · WORLD CLASSICS</div>
          <div style={{ display: 'flex', gap: 8, overflowX: 'auto' }}>
            {['🇯🇵 富士山', '🇨🇳 四姑娘山', '🇺🇸 优胜美地', '🇫🇷 白朗峰', '🇨🇭 阿尔卑斯'].map((s, i) => (
              <Pill key={i} dark={true}>{s}</Pill>
            ))}
          </div>
        </div>
      )}

      {/* Filter chips (region only) */}
      {!isGlobe && (
        <div style={{
          position: 'absolute', top: 116, left: 16, right: 16, zIndex: 20,
          display: 'flex', gap: 6, overflowX: 'auto',
        }}>
          <Pill active>附近 12km</Pill>
          <Pill>T1—T2</Pill>
          <Pill>一日往返</Pill>
          <Pill>有水源</Pill>
          <Pill>看日出</Pill>
        </div>
      )}

      {/* Right side controls */}
      <div style={{
        position: 'absolute', right: 16, top: isGlobe ? 220 : 200, zIndex: 20,
        display: 'flex', flexDirection: 'column', gap: 10,
      }}>
        {/* Zoom levels (vertical control) */}
        <Glass dark={isGlobe} radius={14} style={{ padding: 4, width: 44 }}>
          {['globe', 'region', 'trail'].map((z, i) => (
            <div key={z} onClick={() => setZoom(z)} style={{
              height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center',
              borderRadius: 10, marginBottom: i < 2 ? 2 : 0,
              background: zoom === z ? C.flare : 'transparent',
              cursor: 'pointer',
            }}>
              <window.Icon
                name={z === 'globe' ? 'compass' : z === 'region' ? 'layers2' : 'mountain'}
                size={17}
                color={zoom === z ? '#fff' : (isGlobe ? '#fff' : C.ink)}
              />
            </div>
          ))}
        </Glass>
        <CircleBtn icon="layers" dark={isGlobe} />
        <CircleBtn icon="navigate" dark={isGlobe} color={C.flare} />
      </div>

      {/* GPX import FAB (region only) */}
      {isRegion && (
        <button style={{
          position: 'absolute', right: 16, bottom: 220, zIndex: 22,
          width: 56, height: 56, borderRadius: 999, border: 'none',
          background: C.flare, color: '#fff', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: `0 6px 18px ${C.flare}55, 0 2px 4px rgba(0,0,0,0.1)`,
        }}>
          <window.Icon name="upload" size={20} color="#fff" />
        </button>
      )}

      {/* Zoom level label (top-left, fades) */}
      <div style={{
        position: 'absolute', top: 200, left: 16, zIndex: 20,
        fontSize: 10, fontFamily: K.font.mono,
        color: isGlobe ? 'rgba(255,255,255,0.5)' : C.inkMuted,
        letterSpacing: 1.5,
      }}>
        {zoom === 'globe' ? '世界视图  ·  WORLD' : zoom === 'region' ? '北京周边  ·  REGION' : '路线视图  ·  TRAIL'}
      </div>

      {/* Active pin preview card */}
      {!isGlobe && activeRoute && (
        <div style={{
          position: 'absolute', left: 12, right: 12, bottom: 102, zIndex: 25,
        }}>
          <Glass radius={20} style={{ padding: 14 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              {/* Difficulty color stripe */}
              <div style={{
                width: 4, alignSelf: 'stretch', borderRadius: 4,
                background: C.diff[activeRoute.diff],
              }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  gap: 8, marginBottom: 4,
                }}>
                  <span style={{
                    fontSize: 17, fontWeight: 700, color: C.ink, letterSpacing: -0.4,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>{activeRoute.name}</span>
                  <button onClick={(e) => { e.stopPropagation(); setActiveRoute(null); }}
                          style={{
                            width: 26, height: 26, borderRadius: 999, border: 'none',
                            background: C.surfaceHi, color: C.inkMuted, cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            flexShrink: 0,
                          }}>
                    <window.Icon name="close" size={12} color={C.inkMuted} />
                  </button>
                </div>
                <div style={{
                  display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap',
                  marginBottom: 10,
                }}>
                  <DiffBadge level={activeRoute.diff} />
                  <span style={{ fontSize: 12, color: C.inkMuted, fontFamily: K.font.sans, letterSpacing: -0.1 }}>
                    {activeRoute.d}
                  </span>
                  <span style={{
                    display: 'flex', alignItems: 'center', gap: 3,
                    fontSize: 12, color: C.ink, fontWeight: 500, letterSpacing: -0.1,
                  }}>
                    <window.Icon name="star" size={12} color={C.flare} />
                    {activeRoute.rating}
                  </span>
                  <span style={{
                    display: 'flex', alignItems: 'center', gap: 3,
                    fontSize: 11, color: C.inkMuted, letterSpacing: -0.1,
                  }}>
                    <window.Icon name="users" size={11} color={C.inkMuted} />
                    {Math.round(activeRoute.pop * 1000) + 80}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button style={{
                    flex: 1, height: 38, borderRadius: 12, border: 'none',
                    background: C.flare, color: '#fff', cursor: 'pointer',
                    fontSize: 13, fontWeight: 600, letterSpacing: -0.2,
                  }}>查看路线 →</button>
                  <button style={{
                    width: 38, height: 38, borderRadius: 12, border: `0.5px solid ${C.line}`,
                    background: C.surface, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <window.Icon name="bookmark" size={15} color={C.flare} />
                  </button>
                </div>
              </div>
            </div>
          </Glass>
        </div>
      )}

      {/* Bottom: featured route card (region/trail) or destinations carousel (globe) */}
      {!isGlobe && !activeRoute && (
        <div style={{
          position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 25,
          paddingBottom: 90,
        }}>
          <Glass radius={24} style={{
            margin: '0 12px', padding: 18,
            display: 'flex', flexDirection: 'column', gap: 14,
          }}>
            <div style={{
              position: 'absolute', top: 6, left: '50%', transform: 'translateX(-50%)',
              width: 36, height: 4, borderRadius: 99, background: 'rgba(60,52,42,0.2)',
            }} />

            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
              paddingTop: 4,
            }}>
              <div style={{ flex: 1 }}>
                <div style={{
                  fontSize: 11, fontFamily: K.font.sans, color: C.inkMuted, marginBottom: 4,
                  letterSpacing: -0.1,
                }}>距离你 2.3 公里</div>
                <div style={{
                  fontSize: 26, fontWeight: 700, color: C.ink, letterSpacing: -0.7,
                  marginBottom: 8, lineHeight: 1.1,
                }}>箭扣长城</div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                  <DiffBadge level="hard" />
                  <span style={{ fontSize: 12, color: C.inkMuted, fontFamily: K.font.sans }}>
                    11.4 公里  ·  ↑ 680 米  ·  约 5 小时
                  </span>
                </div>
              </div>
              <Glass radius={12} style={{
                width: 44, height: 44,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: C.flareSoft, border: `0.5px solid ${C.flare}30`,
              }}>
                <window.Icon name="bookmark" size={18} color={C.flare} />
              </Glass>
            </div>

            {/* Mini elevation strip */}
            <div style={{
              height: 50, borderRadius: 10, overflow: 'hidden',
              background: C.surfaceHi, position: 'relative',
              border: `0.5px solid ${C.line}`,
            }}>
              <svg viewBox="0 0 280 50" width="100%" height="100%" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="elev-mini" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={C.flare} stopOpacity="0.3" />
                    <stop offset="100%" stopColor={C.flare} stopOpacity="0" />
                  </linearGradient>
                </defs>
                <path d="M0,42 L40,32 L80,18 L120,10 L160,20 L200,14 L240,28 L280,38 L280,50 L0,50 Z"
                      fill="url(#elev-mini)" />
                <path d="M0,42 L40,32 L80,18 L120,10 L160,20 L200,14 L240,28 L280,38"
                      fill="none" stroke={C.flare} strokeWidth="1.8" strokeLinejoin="round" />
                <circle cx="0" cy="42" r="3" fill={C.moss} />
                <circle cx="120" cy="10" r="3" fill={C.flare} />
                <circle cx="280" cy="38" r="3" fill={C.flare} />
              </svg>
            </div>

            <button style={{
              width: '100%', height: 50, borderRadius: 14,
              background: C.flare, color: '#fff', border: 'none',
              fontSize: 15, fontWeight: 600, fontFamily: K.font.sans,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              boxShadow: `0 4px 14px ${C.flare}40`, letterSpacing: -0.2,
              cursor: 'pointer',
            }}>
              <window.Icon name="navigate" size={15} /> 查看完整路线
            </button>
          </Glass>
        </div>
      )}

      {/* Globe bottom sheet */}
      {isGlobe && (
        <div style={{
          position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 25,
          paddingBottom: 90,
        }}>
          <Glass dark={true} radius={24} style={{
            margin: '0 12px', padding: 18,
          }}>
            <div style={{
              position: 'absolute', top: 6, left: '50%', transform: 'translateX(-50%)',
              width: 36, height: 4, borderRadius: 99, background: 'rgba(255,255,255,0.25)',
            }} />
            <div style={{
              fontSize: 11, fontFamily: K.font.sans, color: 'rgba(255,255,255,0.6)',
              letterSpacing: -0.1, marginBottom: 4, marginTop: 4,
            }}>本月热门  ·  TRENDING</div>
            <div style={{
              fontSize: 22, fontWeight: 700, color: '#fff', letterSpacing: -0.6,
              marginBottom: 14,
            }}>春季最佳目的地</div>
            <div style={{ display: 'flex', gap: 10, overflowX: 'auto' }}>
              {[
                { n: '富士吉田线', km: '14km', diff: 'hard', loc: '日本' },
                { n: 'Half Dome', km: '24km', diff: 'expert', loc: '美国' },
                { n: '麦理浩径', km: '15km', diff: 'mod', loc: '香港' },
              ].map((d, i) => (
                <div key={i} style={{
                  minWidth: 140, padding: 12, borderRadius: 14,
                  background: 'rgba(255,255,255,0.08)',
                  border: '0.5px solid rgba(255,255,255,0.12)',
                }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#fff', letterSpacing: -0.2 }}>{d.n}</div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', marginTop: 3, fontFamily: K.font.sans }}>
                    {d.loc}  ·  {d.km}
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <DiffBadge level={d.diff} />
                  </div>
                </div>
              ))}
            </div>
          </Glass>
        </div>
      )}

      <TabBar active="explore" dark={isGlobe} onCenter={() => {}} />
      <DepartureSheet open={!!tweaks.departureSheet} onClose={() => {}} />
      </>}
    </div>
  );
}

function TabBar({ active = 'explore', dark = false, onCenter }) {
  // 3-tab structure: gear · explore (center, morphs) · me
  // When user is on the explore tab, the center auto-promotes to the departure FAB.
  const side = [
    { id: 'gear', icon: 'backpack', label: '装备' },
    { id: 'me',   icon: 'user',     label: '我' },
  ];
  const isDeparture = active === 'explore';

  return (
    <>
      <Glass dark={dark} radius={999} style={{
        position: 'absolute', left: '50%', transform: 'translateX(-50%)', bottom: 32, zIndex: 40,
        width: 280, height: 60, display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', padding: '0 28px',
      }}>
        {/* Left: gear */}
        {(() => {
          const t = side[0]; const isActive = active === t.id;
          const fg = isActive ? C.flare : (dark ? 'rgba(255,255,255,0.6)' : C.inkMuted);
          return (
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
              padding: '8px 14px', borderRadius: 99,
              background: isActive ? C.flareSoft : 'transparent',
            }}>
              <window.Icon name={t.icon} size={20} color={fg} />
              <span style={{
                fontSize: 10, fontFamily: K.font.sans, fontWeight: 500,
                color: fg, letterSpacing: -0.1,
              }}>{t.label}</span>
            </div>
          );
        })()}

        {/* Center: explore — morphs to departure FAB when active */}
        <div style={{ width: 64, position: 'relative' }} />

        {/* Right: me */}
        {(() => {
          const t = side[1]; const isActive = active === t.id;
          const fg = isActive ? C.flare : (dark ? 'rgba(255,255,255,0.6)' : C.inkMuted);
          return (
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
              padding: '8px 14px', borderRadius: 99,
              background: isActive ? C.flareSoft : 'transparent',
            }}>
              <window.Icon name={t.icon} size={20} color={fg} />
              <span style={{
                fontSize: 10, fontFamily: K.font.sans, fontWeight: 500,
                color: fg, letterSpacing: -0.1,
              }}>{t.label}</span>
            </div>
          );
        })()}
      </Glass>

      {/* Center button — sits above the bar so it can grow when in 'departing' state */}
      <button onClick={onCenter}
        style={{
          position: 'absolute', left: '50%', bottom: isDeparture ? 46 : 36, zIndex: 41,
          transform: `translateX(-50%) scale(${isDeparture ? 1.1 : 1})`,
          width: isDeparture ? 54 : 50, height: isDeparture ? 54 : 50,
          borderRadius: 999, border: 'none', cursor: 'pointer',
          background: isDeparture ? C.flare : (active === 'explore' ? C.flareSoft : (dark ? 'rgba(255,255,255,0.18)' : '#fff')),
          color: isDeparture ? '#fff' : C.flare,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 1,
          boxShadow: isDeparture
            ? `0 6px 18px ${C.flare}66, 0 0 0 3px ${C.flare}20, 0 1px 3px rgba(0,0,0,0.12)`
            : `0 4px 14px rgba(40,30,20,0.16), 0 0 0 0.5px ${C.line}`,
          transition: 'all 0.45s cubic-bezier(0.34, 1.56, 0.64, 1)',
        }}>
        <window.Icon name={isDeparture ? 'hiker' : 'compass'}
                     size={isDeparture ? 22 : 22}
                     color={isDeparture ? '#fff' : C.flare} />
        <span style={{
          fontSize: 8.5, fontWeight: 700, letterSpacing: 0.3,
          color: isDeparture ? '#fff' : C.flare,
          marginTop: isDeparture ? -1 : -2,
        }}>{isDeparture ? '出发' : '探索'}</span>
      </button>
    </>
  );
}

// Departure sheet — AI input + today's recommendations
function DepartureSheet({ open, onClose }) {
  if (!open) return null;
  const recs = [
    { name: '香山 · 鬼笑石', km: '5.2 km', tag: '今天最佳', tagBg: '#FEF1E2', tagFg: C.flare },
    { name: '阳台山 · 妙峰山', km: '9.8 km', tag: '风景上佳', tagBg: '#E8F4EA', tagFg: C.moss },
    { name: '坡峰岭 · 红叶', km: '4.1 km', tag: '人少清净', tagBg: '#EAF0F5', tagFg: '#3D6A8C' },
  ];
  return (
    <div onClick={onClose} style={{
      position: 'absolute', inset: 0, zIndex: 50,
      background: 'rgba(20,16,12,0.35)',
      backdropFilter: 'blur(2px)',
      animation: 'kpFade 0.25s ease',
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        position: 'absolute', left: 0, right: 0, bottom: 0,
        background: C.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24,
        padding: '14px 18px 28px',
        boxShadow: '0 -8px 32px rgba(0,0,0,0.18)',
        animation: 'kpSlide 0.32s cubic-bezier(0.2,0.8,0.2,1)',
        maxHeight: '72%', overflowY: 'auto',
      }}>
        <div style={{
          width: 36, height: 4, borderRadius: 99, background: 'rgba(60,52,42,0.18)',
          margin: '0 auto 14px',
        }} />

        {/* AI input */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '14px 14px', background: C.surface,
          border: `0.5px solid ${C.line}`, borderRadius: 18,
          boxShadow: `0 0 0 4px ${C.flareSoft}`,
        }}>
          <window.Icon name="sparkle" size={16} color={C.flare} />
          <span style={{
            flex: 1, fontSize: 14, color: C.inkMuted, letterSpacing: -0.2,
          }}>想去哪？描述你的想法…</span>
          <button style={{
            width: 32, height: 32, borderRadius: 999, border: 'none',
            background: C.flareSoft, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <window.Icon name="mic" size={15} color={C.flare} />
          </button>
        </div>

        {/* Example chips */}
        <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
          {['3小时能来回的山', '适合新手的长城', '需要露营的路线'].map((s, i) => (
            <span key={i} style={{
              padding: '6px 11px', borderRadius: 999,
              background: C.surfaceHi, border: `0.5px solid ${C.line}`,
              fontSize: 11.5, color: C.ink, letterSpacing: -0.1,
            }}>{s}</span>
          ))}
        </div>

        {/* Today recommendations */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          marginTop: 22, marginBottom: 10,
        }}>
          <span style={{
            fontSize: 15, fontWeight: 700, color: C.ink, letterSpacing: -0.4,
          }}>今天适合去</span>
          <window.Icon name="sun" size={15} color="#E8B946" />
          <span style={{ fontSize: 11, color: C.inkMuted, marginLeft: 'auto', letterSpacing: -0.1 }}>
            18°C · 晴 · 微风
          </span>
        </div>

        <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 4 }}>
          {recs.map((r, i) => (
            <div key={i} style={{
              flex: '0 0 200px', background: C.surface,
              border: `0.5px solid ${C.line}`, borderRadius: 16,
              padding: 14, display: 'flex', flexDirection: 'column', gap: 10,
            }}>
              {/* mini map preview */}
              <div style={{
                height: 76, borderRadius: 10, background: '#E5DDD0',
                position: 'relative', overflow: 'hidden',
              }}>
                <svg viewBox="0 0 200 76" width="100%" height="100%">
                  <path d={i === 0 ? 'M20,60 Q60,20 100,40 T180,30' : i === 1 ? 'M15,50 Q50,10 90,50 T185,20' : 'M20,40 Q60,60 100,30 T180,50'}
                        stroke={C.flare} strokeWidth="2.5" fill="none" strokeLinecap="round"/>
                  <circle cx="20" cy={i === 0 ? 60 : i === 1 ? 50 : 40} r="3.5" fill={C.moss} stroke="#fff" strokeWidth="1"/>
                  <circle cx="180" cy={i === 0 ? 30 : i === 1 ? 20 : 50} r="3.5" fill={C.flare} stroke="#fff" strokeWidth="1"/>
                </svg>
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: C.ink, letterSpacing: -0.3 }}>{r.name}</div>
                <div style={{ fontSize: 11, color: C.inkMuted, marginTop: 2 }}>{r.km}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{
                  padding: '3px 8px', borderRadius: 99,
                  background: r.tagBg, color: r.tagFg,
                  fontSize: 10, fontWeight: 700, letterSpacing: 0.2,
                }}>{r.tag}</span>
                <button style={{
                  padding: '5px 10px', borderRadius: 99, border: 'none',
                  background: C.flare, color: '#fff', cursor: 'pointer',
                  fontSize: 11, fontWeight: 600, letterSpacing: -0.1,
                }}>选这条 →</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <style>{`
        @keyframes kpFade { from{opacity:0} to{opacity:1} }
        @keyframes kpSlide { from{transform:translateY(100%)} to{transform:translateY(0)} }
      `}</style>
    </div>
  );
}

window.ScreenMap = ScreenMap;
window.TabBar = TabBar;
window.DepartureSheet = DepartureSheet;
window.Glass = Glass;
window.Pill = Pill;
window.Stat = Stat;
window.DiffBadge = DiffBadge;
window.CircleBtn = CircleBtn;

// Kaipa final screens — Navigate HUD+, Route Publish, Onboarding (3 screens)
const Kf = new Proxy({}, { get: (_, p) => window.KAIPA_TOKENS[p] });
const Cf = new Proxy({}, { get: (_, p) => window.KAIPA_TOKENS.color[p] });

// ─── Navigate HUD+ (live mini-map + SOS) ─────────────────────
function ScreenNavigateHUD() {
  return (
    <div style={{ position: 'relative', height: '100%', background: Cf.bg, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 30 }}>
        <window.IOSStatusBar dark={Kf.mode === 'dark'} />
      </div>

      {/* Full-bleed map */}
      <div style={{ position: 'absolute', inset: 0 }}>
        <window.KaipaMap zoom="trail" showLabels={false} />
      </div>

      {/* Top: route ribbon */}
      <div style={{ position: 'absolute', top: 56, left: 16, right: 16, zIndex: 20 }}>
        <window.Glass radius={18} style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <window.CircleBtn icon="back" size={32} iconSize={14} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 11, fontFamily: Kf.font.sans, color: Cf.flare, fontWeight: 600,
              display: 'flex', alignItems: 'center', gap: 5,
            }}>
              <span style={{ width: 6, height: 6, borderRadius: 99, background: Cf.flare }} />
              进行中  ·  02:14:33
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, color: Cf.ink, letterSpacing: -0.2, marginTop: 1 }}>
              箭扣长城  →  鹰飞倒仰
            </div>
          </div>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 4,
            padding: '5px 9px', borderRadius: 99,
            background: Cf.mossSoft, color: Cf.mossDeep,
            fontSize: 11, fontWeight: 500, letterSpacing: -0.1,
          }}>
            <window.Icon name="users" size={11} />2
          </div>
        </window.Glass>
      </div>

      {/* Right rail: zoom + center */}
      <div style={{
        position: 'absolute', top: 130, right: 16, zIndex: 18,
        display: 'flex', flexDirection: 'column', gap: 8,
      }}>
        <window.Glass radius={14} style={{ padding: 4 }}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <button style={glassBtn}>
              <window.Icon name="plus" size={16} color={Cf.ink} />
            </button>
            <div style={{ height: 0.5, background: Cf.line, margin: '0 6px' }} />
            <button style={glassBtn}>
              <span style={{ fontSize: 18, fontWeight: 700, color: Cf.ink, lineHeight: 1 }}>−</span>
            </button>
          </div>
        </window.Glass>
        <window.Glass radius={14} style={{ padding: 4 }}>
          <button style={glassBtn}>
            <window.Icon name="navigate" size={16} color={Cf.flare} />
          </button>
        </window.Glass>
        <window.Glass radius={14} style={{ padding: 4 }}>
          <button style={glassBtn}>
            <window.Icon name="layers" size={16} color={Cf.ink} />
          </button>
        </window.Glass>
      </div>

      {/* Mid-left: live elevation strip + waypoint preview */}
      <div style={{
        position: 'absolute', top: 130, left: 16, zIndex: 18,
        width: 78,
      }}>
        <window.Glass radius={14} style={{ padding: 10 }}>
          <div style={{
            fontSize: 9, fontFamily: Kf.font.mono, color: Cf.inkMuted,
            letterSpacing: 1, marginBottom: 4,
          }}>ELEV</div>
          <ElevStrip />
          <div style={{
            display: 'flex', justifyContent: 'space-between',
            fontSize: 9, fontFamily: Kf.font.mono, color: Cf.inkDim, marginTop: 2,
          }}>
            <span>0</span><span>11.4</span>
          </div>
          <div style={{
            marginTop: 8, paddingTop: 8, borderTop: `0.5px solid ${Cf.line}`,
            fontSize: 9, fontFamily: Kf.font.mono, color: Cf.inkMuted, letterSpacing: 1,
          }}>NOW</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: Cf.ink, letterSpacing: -0.3, marginTop: 2 }}>
            1312<span style={{ fontSize: 9, color: Cf.inkDim, marginLeft: 1 }}>m</span>
          </div>
        </window.Glass>
      </div>

      {/* Bottom card: next + bigger metrics + SOS */}
      <div style={{ position: 'absolute', bottom: 28, left: 16, right: 16, zIndex: 20 }}>
        <window.Glass radius={20} style={{ padding: 16 }}>
          {/* Next waypoint */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <div style={{
              width: 44, height: 44, borderRadius: 12,
              background: Cf.flareSoft, border: `0.5px solid ${Cf.flare}30`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <window.Icon name="forward" size={20} color={Cf.flare} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{
                fontSize: 10, fontFamily: Kf.font.mono, color: Cf.inkMuted,
                letterSpacing: 1.5,
              }}>
                NEXT  ·  340 m  ·  右后方
              </div>
              <div style={{ fontSize: 16, fontWeight: 600, color: Cf.ink, marginTop: 2, letterSpacing: -0.3 }}>
                鹰飞倒仰  ·  打卡点
              </div>
            </div>
          </div>

          {/* Metrics */}
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8,
            paddingTop: 12, borderTop: `0.5px solid ${Cf.line}`,
          }}>
            <window.Stat value="4.7" unit="km" label="已走" />
            <window.Stat value="312" unit="m" label="爬升" />
            <window.Stat value="2.1" unit="km/h" label="均速" />
            <window.Stat value="6.7" unit="km" label="剩余" />
          </div>

          {/* Action row */}
          <div style={{
            marginTop: 14, paddingTop: 12, borderTop: `0.5px solid ${Cf.line}`,
            display: 'flex', gap: 10, alignItems: 'center',
          }}>
            <button style={{
              flex: 1, height: 46, borderRadius: 14,
              background: Cf.surfaceHi, color: Cf.ink, border: 'none',
              fontSize: 13.5, fontWeight: 500, letterSpacing: -0.2,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              cursor: 'pointer',
            }}>
              <window.Icon name="pause" size={13} color={Cf.ink} /> 暂停
            </button>
            <button style={{
              flex: 1, height: 46, borderRadius: 14,
              background: Cf.surfaceHi, color: Cf.ink, border: 'none',
              fontSize: 13.5, fontWeight: 500, letterSpacing: -0.2,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              cursor: 'pointer',
            }}>
              <window.Icon name="camera" size={14} color={Cf.ink} /> 打卡
            </button>
            <SOSButton />
          </div>
        </window.Glass>
      </div>
    </div>
  );
}

const glassBtn = {
  width: 36, height: 36, borderRadius: 10, border: 'none', background: 'transparent',
  display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
};

function ElevStrip() {
  const C = window.KAIPA_TOKENS.color;
  // simple sparkline: 0..1 height across width
  const pts = [0.1, 0.18, 0.28, 0.42, 0.55, 0.68, 0.62, 0.58, 0.74, 0.85, 0.82, 0.7, 0.55, 0.4];
  const W = 56, H = 38;
  const dx = W / (pts.length - 1);
  const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${(i * dx).toFixed(1)},${(H - p * H).toFixed(1)}`).join(' ');
  const fill = `${path} L${W},${H} L0,${H} Z`;
  // current marker at index ~5 (4.7/11.4 ≈ 0.41 → index 0.41*13 ≈ 5.3)
  const idx = 5.3;
  const cx = idx * dx, cy = H - pts[Math.round(idx)] * H;
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }}>
      <path d={fill} fill={C.flareSoft} />
      <path d={path} fill="none" stroke={C.flare} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={cx} cy={cy} r="3" fill={C.flare} stroke="#fff" strokeWidth="1.2" />
    </svg>
  );
}

function SOSButton() {
  return (
    <button style={{
      width: 46, height: 46, borderRadius: 14,
      background: '#C0392B', color: '#fff', border: 'none',
      fontSize: 11, fontWeight: 700, letterSpacing: 0.5,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      boxShadow: '0 4px 14px rgba(192,57,43,0.45), inset 0 0 0 1px rgba(255,255,255,0.15)',
      cursor: 'pointer', flexShrink: 0,
    }}>
      SOS
    </button>
  );
}

// ─── Route Publish ───────────────────────────────────────────
function ScreenRoutePublish() {
  return (
    <div style={{ position: 'relative', height: '100%', background: Cf.bg, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 30 }}>
        <window.IOSStatusBar dark={Kf.mode === 'dark'} />
      </div>

      {/* Top bar */}
      <div style={{
        padding: '54px 16px 14px', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <window.CircleBtn icon="close" size={36} iconSize={15} />
        <span style={{ fontSize: 13, fontWeight: 600, color: Cf.ink, letterSpacing: -0.2 }}>发布路线</span>
        <button style={{
          padding: '7px 14px', borderRadius: 99, border: 'none',
          background: Cf.flare, color: '#fff', fontSize: 12.5, fontWeight: 600,
          letterSpacing: -0.1, cursor: 'pointer',
        }}>发布</button>
      </div>

      <div style={{
        position: 'absolute', top: 100, left: 0, right: 0, bottom: 0,
        overflowY: 'auto', padding: '0 16px 32px',
      }}>
        {/* GPS source banner */}
        <div style={{
          padding: 14, borderRadius: 14, marginBottom: 14,
          background: Cf.mossSoft, border: `0.5px solid ${Cf.mossDeep}30`,
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10, background: Cf.surface,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <window.Icon name="navigate" size={16} color={Cf.mossDeep} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: Cf.ink, letterSpacing: -0.2 }}>
              基于今日 GPS 轨迹
            </div>
            <div style={{ fontSize: 11, color: Cf.inkMuted, marginTop: 1 }}>
              箭扣长城  ·  04.27 周日  ·  5:42 出发
            </div>
          </div>
          <span style={{ fontSize: 11.5, color: Cf.flare, fontWeight: 500 }}>更换 →</span>
        </div>

        {/* Map preview */}
        <div style={{
          height: 160, borderRadius: 14, overflow: 'hidden', marginBottom: 14,
          border: `0.5px solid ${Cf.line}`, position: 'relative',
        }}>
          <window.MiniMap seed={0} h={160} dark={Kf.mode === 'dark'} />
          <div style={{
            position: 'absolute', top: 10, right: 10,
            background: Cf.glass, backdropFilter: 'blur(20px)',
            borderRadius: 8, padding: '5px 9px',
            fontSize: 10.5, fontFamily: Kf.font.mono, color: Cf.ink,
          }}>
            11.4 km  ·  ↑680 m
          </div>
        </div>

        {/* Title input */}
        <div style={{
          padding: 14, borderRadius: 14, background: Cf.surface,
          border: `0.5px solid ${Cf.line}`, marginBottom: 10,
        }}>
          <div style={{ fontSize: 11, color: Cf.inkMuted, marginBottom: 4, letterSpacing: -0.1 }}>标题</div>
          <div style={{ fontSize: 17, fontWeight: 600, color: Cf.ink, letterSpacing: -0.4 }}>
            箭扣野长城日落穿越
          </div>
          <div style={{
            display: 'inline-block', marginTop: 6, fontSize: 10,
            color: Cf.flare, padding: '2px 7px', borderRadius: 99,
            background: Cf.flareSoft, fontWeight: 500,
          }}>AI 已建议  ·  改</div>
        </div>

        {/* Story */}
        <div style={{
          padding: 14, borderRadius: 14, background: Cf.surface,
          border: `0.5px solid ${Cf.line}`, marginBottom: 14,
        }}>
          <div style={{ fontSize: 11, color: Cf.inkMuted, marginBottom: 4, letterSpacing: -0.1 }}>这次走得怎么样？</div>
          <div style={{ fontSize: 13.5, color: Cf.ink, lineHeight: 1.6, letterSpacing: -0.1 }}>
            从将军关下车，沿着野长城往西，午后云开雾散，
            鹰飞倒仰段落比想象中陡。<span style={{ color: Cf.inkDim }}>...</span>
          </div>
          <div style={{
            display: 'flex', gap: 6, marginTop: 12, flexWrap: 'wrap',
          }}>
            <span style={pillTag(Cf)}>#野长城</span>
            <span style={pillTag(Cf)}>#怀柔</span>
            <span style={pillTag(Cf)}>#一日穿越</span>
          </div>
        </div>

        {/* Photos */}
        <div style={{
          fontSize: 13, fontWeight: 600, color: Cf.ink, marginBottom: 8,
          display: 'flex', justifyContent: 'space-between', letterSpacing: -0.2,
        }}>
          <span>照片  ·  6 张</span>
          <span style={{ fontSize: 11.5, color: Cf.flare, fontWeight: 500 }}>+ 添加</span>
        </div>
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', marginLeft: -16, paddingLeft: 16, marginRight: -16, paddingRight: 16, marginBottom: 14 }}>
          {[0, 1, 2, 3, 4, 5].map(i => (
            <PhotoTile key={i} seed={i} />
          ))}
        </div>

        {/* Difficulty + tags row */}
        <div style={{
          padding: 14, borderRadius: 14, background: Cf.surface,
          border: `0.5px solid ${Cf.line}`, marginBottom: 10,
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            marginBottom: 10,
          }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: Cf.ink, letterSpacing: -0.2 }}>难度评级</span>
            <window.DiffBadge level="hard" />
          </div>
          <div style={{
            display: 'flex', gap: 4, padding: 4, borderRadius: 10,
            background: Cf.surfaceHi,
          }}>
            {['T1', 'T2', 'T3', 'T4', 'T5'].map((t, i) => (
              <div key={t} style={{
                flex: 1, padding: '7px 0', textAlign: 'center', borderRadius: 7,
                fontSize: 12, fontWeight: 600, letterSpacing: -0.1,
                background: i === 2 ? Cf.flare : 'transparent',
                color: i === 2 ? '#fff' : Cf.inkMuted,
              }}>{t}</div>
            ))}
          </div>
          <div style={{
            display: 'flex', justifyContent: 'space-between',
            fontSize: 10.5, color: Cf.inkMuted, marginTop: 6,
            fontFamily: Kf.font.mono,
          }}>
            <span>初学</span><span>挑战</span>
          </div>
        </div>

        {/* Privacy */}
        <div style={{
          padding: 14, borderRadius: 14, background: Cf.surface,
          border: `0.5px solid ${Cf.line}`,
        }}>
          {[
            { i: 'users',  l: '公开',     d: '所有人可见 · 进入精选有机会被推荐', on: true },
            { i: 'compass',l: '记入足迹', d: '保留到个人主页的足迹地图',           on: true },
            { i: 'pin',    l: '隐藏起点', d: '保护登山口位置 · 推荐用于野线',     on: true },
          ].map((row, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '8px 0',
              borderBottom: i < 2 ? `0.5px solid ${Cf.line}` : 'none',
            }}>
              <div style={{
                width: 30, height: 30, borderRadius: 8, background: Cf.mossSoft,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <window.Icon name={row.i} size={14} color={Cf.mossDeep} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: Cf.ink, letterSpacing: -0.2 }}>{row.l}</div>
                <div style={{ fontSize: 10.5, color: Cf.inkMuted, marginTop: 1 }}>{row.d}</div>
              </div>
              <div style={{
                width: 32, height: 19, borderRadius: 99,
                background: row.on ? Cf.flare : Cf.line,
                position: 'relative',
              }}>
                <div style={{
                  position: 'absolute', top: 2, left: row.on ? 15 : 2,
                  width: 15, height: 15, borderRadius: 999, background: '#fff',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const pillTag = (Cf) => ({
  fontSize: 11.5, color: Cf.flare, padding: '4px 9px',
  borderRadius: 99, background: Cf.flareSoft, fontWeight: 500, letterSpacing: -0.1,
});

function PhotoTile({ seed }) {
  const C = window.KAIPA_TOKENS.color;
  // SVG placeholder photo with terrain-y bands
  const tones = [
    [C.terrain.lowland, C.terrain.ridge, C.terrain.peak],
    [C.terrain.water, C.terrain.lowland, C.terrain.mid],
    [C.terrain.peak, C.terrain.snow, C.terrain.ridge],
    [C.terrain.mid, C.terrain.forest, C.terrain.lowland],
    [C.terrain.water, C.terrain.waterDeep, C.terrain.mid],
    [C.terrain.lowland, C.terrain.peak, C.terrain.snow],
  ];
  const t = tones[seed % tones.length];
  return (
    <div style={{
      flexShrink: 0, width: 96, height: 120, borderRadius: 12, overflow: 'hidden',
      border: `0.5px solid ${C.line}`, position: 'relative',
    }}>
      <svg viewBox="0 0 96 120" width="96" height="120" preserveAspectRatio="none"
           style={{ display: 'block' }}>
        <rect width="96" height="60" fill={t[0]} />
        <path d={`M0,${50 + seed*3} Q30,${30 + seed*2} 50,${45} T96,${40} L96,80 L0,80 Z`} fill={t[1]} />
        <path d={`M0,${75 + seed} Q40,${60} 70,${72} T96,${68} L96,120 L0,120 Z`} fill={t[2]} />
      </svg>
      {seed === 0 && (
        <div style={{
          position: 'absolute', top: 6, left: 6,
          fontSize: 9, color: '#fff', fontFamily: window.KAIPA_TOKENS.font.mono,
          padding: '2px 6px', borderRadius: 4,
          background: 'rgba(0,0,0,0.45)', letterSpacing: 1,
        }}>封面</div>
      )}
    </div>
  );
}

// ─── Onboarding (3 screens, presented as one wide artboard) ──
function ScreenOnboarding({ step = 0 }) {
  return (
    <div style={{ position: 'relative', height: '100%', background: Cf.bg, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 30 }}>
        <window.IOSStatusBar dark={Kf.mode === 'dark'} />
      </div>
      {step === 0 && <OnboardWelcome />}
      {step === 1 && <OnboardLevel />}
      {step === 2 && <OnboardSafety />}

      {/* Pagination dots */}
      <div style={{
        position: 'absolute', bottom: 130, left: 0, right: 0, zIndex: 20,
        display: 'flex', justifyContent: 'center', gap: 6,
      }}>
        {[0, 1, 2].map(i => (
          <div key={i} style={{
            width: i === step ? 22 : 6, height: 6, borderRadius: 99,
            background: i === step ? Cf.flare : Cf.line, transition: 'width .2s',
          }} />
        ))}
      </div>

      {/* CTA */}
      <div style={{
        position: 'absolute', bottom: 32, left: 16, right: 16, zIndex: 20,
        display: 'flex', gap: 10, alignItems: 'center',
      }}>
        {step > 0 && (
          <button style={{
            height: 54, padding: '0 22px', borderRadius: 16,
            background: Cf.surface, color: Cf.ink, border: `0.5px solid ${Cf.line}`,
            fontSize: 14, fontWeight: 500, letterSpacing: -0.2, cursor: 'pointer',
          }}>上一步</button>
        )}
        <button style={{
          flex: 1, height: 54, borderRadius: 16,
          background: Cf.flare, color: '#fff', border: 'none',
          fontSize: 15, fontWeight: 600, letterSpacing: -0.3,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          cursor: 'pointer', boxShadow: `0 4px 16px ${Cf.flareSoft}`,
        }}>
          {step === 2 ? '开始探索' : '继续'}
          <window.Icon name="forward" size={14} />
        </button>
      </div>
    </div>
  );
}

function OnboardWelcome() {
  return (
    <div style={{ padding: '80px 28px 0', height: '100%' }}>
      {/* Hero illustration */}
      <div style={{
        height: 360, borderRadius: 24, overflow: 'hidden', marginBottom: 36,
        position: 'relative',
      }}>
        <HeroLandscape />
      </div>
      <div style={{
        fontSize: 11, fontFamily: Kf.font.mono, color: Cf.flare,
        letterSpacing: 3, fontWeight: 600,
      }}>KAIPA  ·  开拔</div>
      <h1 style={{
        fontSize: 32, fontWeight: 700, color: Cf.ink, letterSpacing: -0.9,
        lineHeight: 1.15, margin: '12px 0 12px', textWrap: 'balance',
      }}>
        让每一次<br />进山都更安心
      </h1>
      <div style={{
        fontSize: 14, color: Cf.inkMuted, lineHeight: 1.55, letterSpacing: -0.1,
        textWrap: 'pretty',
      }}>
        离线地图、装备清单、出发前安全确认——一个 App 替你想到的，比你以为的多。
      </div>
    </div>
  );
}

function OnboardLevel() {
  const levels = [
    { i: 'tree',     n: '城市散步',  d: '公园 · 短距离 · 平路', km: '< 5 km', sel: false },
    { i: 'trail',    n: '入门徒步',  d: '郊野 · 半日 · 缓坡',   km: '5–12 km', sel: true },
    { i: 'mountain', n: '中级登山',  d: '一日 · 较陡 · 专业鞋',   km: '12–25 km', sel: false },
    { i: 'flag',     n: '高阶纵走',  d: '过夜 · 雪线 · 重装',   km: '25 km +', sel: false },
  ];
  return (
    <div style={{ padding: '80px 24px 0', height: '100%' }}>
      <div style={{
        fontSize: 11, fontFamily: Kf.font.mono, color: Cf.inkMuted,
        letterSpacing: 2, fontWeight: 500, marginBottom: 8,
      }}>2 / 3</div>
      <h1 style={{
        fontSize: 28, fontWeight: 700, color: Cf.ink, letterSpacing: -0.7,
        margin: '0 0 8px', lineHeight: 1.2, textWrap: 'balance',
      }}>你最常走的距离？</h1>
      <div style={{ fontSize: 13, color: Cf.inkMuted, marginBottom: 24, lineHeight: 1.5 }}>
        我们会推荐合适的路线和装备清单。随时可以改。
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {levels.map((l, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: 14,
            padding: 14, borderRadius: 16,
            background: l.sel ? Cf.flareSoft : Cf.surface,
            border: `1px solid ${l.sel ? Cf.flare : Cf.line}`,
          }}>
            <div style={{
              width: 44, height: 44, borderRadius: 12,
              background: l.sel ? Cf.surface : Cf.mossSoft,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <window.Icon name={l.i} size={20} color={l.sel ? Cf.flare : Cf.mossDeep} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{
                fontSize: 14.5, fontWeight: 600, color: Cf.ink, letterSpacing: -0.2,
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                {l.n}
                <span style={{
                  fontSize: 10, fontFamily: Kf.font.mono, color: Cf.inkDim,
                  fontWeight: 500, letterSpacing: 0.3,
                }}>{l.km}</span>
              </div>
              <div style={{ fontSize: 11.5, color: Cf.inkMuted, marginTop: 2, letterSpacing: -0.1 }}>{l.d}</div>
            </div>
            <div style={{
              width: 22, height: 22, borderRadius: 999,
              background: l.sel ? Cf.flare : 'transparent',
              border: `1.5px solid ${l.sel ? Cf.flare : Cf.line}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {l.sel && <window.Icon name="check" size={11} color="#fff" strokeWidth={3} />}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function OnboardSafety() {
  const perms = [
    { i: 'navigate', n: '位置', d: '导航与紧急定位 · 仅使用期间', state: 'ask' },
    { i: 'download', n: '离线地图', d: '提前下载 32MB 左右',         state: 'ask' },
    { i: 'bell',     n: '通知',  d: '天气预警 · 超时提醒',           state: 'ok' },
    { i: 'users',    n: '联系人',d: '设置紧急联系人',                state: 'ok' },
  ];
  return (
    <div style={{ padding: '80px 24px 0', height: '100%' }}>
      <div style={{
        fontSize: 11, fontFamily: Kf.font.mono, color: Cf.inkMuted,
        letterSpacing: 2, fontWeight: 500, marginBottom: 8,
      }}>3 / 3</div>
      <h1 style={{
        fontSize: 28, fontWeight: 700, color: Cf.ink, letterSpacing: -0.7,
        margin: '0 0 8px', lineHeight: 1.2, textWrap: 'balance',
      }}>给我们一些权限，<br />关键时刻能用上</h1>
      <div style={{ fontSize: 13, color: Cf.inkMuted, marginBottom: 24, lineHeight: 1.5 }}>
        我们只在你出发后使用。任何时候都可以在「我的 → 隐私」里关掉。
      </div>

      {/* Big SOS demo card */}
      <div style={{
        padding: 16, borderRadius: 18, marginBottom: 18,
        background: `linear-gradient(135deg, ${Cf.flareSoft}, ${Cf.surface})`,
        border: `0.5px solid ${Cf.flare}30`,
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <div style={{
          width: 52, height: 52, borderRadius: 16,
          background: '#C0392B', color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 13, fontWeight: 700, letterSpacing: 0.5,
          boxShadow: '0 4px 12px rgba(192,57,43,0.4)',
        }}>SOS</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: Cf.ink, letterSpacing: -0.2 }}>
            一键 SOS  ·  长按 3 秒
          </div>
          <div style={{ fontSize: 11.5, color: Cf.inkMuted, marginTop: 2, lineHeight: 1.4 }}>
            自动呼叫 110、发送你的实时坐标给紧急联系人。
          </div>
        </div>
      </div>

      <div style={{
        background: Cf.surface, borderRadius: 16,
        border: `0.5px solid ${Cf.line}`, overflow: 'hidden',
      }}>
        {perms.map((p, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '13px 14px',
            borderBottom: i < perms.length - 1 ? `0.5px solid ${Cf.line}` : 'none',
          }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10, background: Cf.mossSoft,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <window.Icon name={p.i} size={16} color={Cf.mossDeep} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13.5, fontWeight: 500, color: Cf.ink, letterSpacing: -0.2 }}>{p.n}</div>
              <div style={{ fontSize: 11, color: Cf.inkMuted, marginTop: 1 }}>{p.d}</div>
            </div>
            {p.state === 'ok' ? (
              <div style={{
                width: 22, height: 22, borderRadius: 999, background: Cf.flare,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <window.Icon name="check" size={11} color="#fff" strokeWidth={3} />
              </div>
            ) : (
              <span style={{
                fontSize: 11.5, color: Cf.flare, fontWeight: 600,
                padding: '5px 11px', borderRadius: 99,
                background: Cf.flareSoft, letterSpacing: -0.1,
              }}>授权</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function HeroLandscape() {
  const C = window.KAIPA_TOKENS.color;
  return (
    <svg viewBox="0 0 320 360" width="100%" height="100%" preserveAspectRatio="xMidYMid slice"
         style={{ display: 'block' }}>
      <defs>
        <linearGradient id="sky-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"  stopColor={C.flareSoft} />
          <stop offset="40%" stopColor={C.terrain.snow} />
          <stop offset="100%" stopColor={C.surface} />
        </linearGradient>
      </defs>
      <rect width="320" height="360" fill="url(#sky-grad)" />
      {/* sun */}
      <circle cx="220" cy="110" r="36" fill={C.flare} opacity="0.85" />
      <circle cx="220" cy="110" r="48" fill={C.flare} opacity="0.18" />
      {/* far ridge */}
      <path d="M0,200 L40,160 L80,180 L130,140 L180,170 L240,130 L290,160 L320,150 L320,360 L0,360 Z"
            fill={C.terrain.ridge} opacity="0.7" />
      {/* mid ridge */}
      <path d="M0,260 L50,220 L90,240 L140,200 L180,230 L230,200 L280,240 L320,225 L320,360 L0,360 Z"
            fill={C.terrain.peak} opacity="0.85" />
      {/* near */}
      <path d="M0,320 L60,290 L120,300 L180,280 L260,310 L320,295 L320,360 L0,360 Z"
            fill={C.mossDeep} />
      {/* a tiny figure on the path */}
      <circle cx="160" cy="288" r="3" fill={C.flare} />
      <line x1="160" y1="291" x2="160" y2="298" stroke={C.flare} strokeWidth="1.5" />
      {/* trail */}
      <path d="M40,355 Q90,335 160,290 Q220,260 280,250"
            fill="none" stroke={C.flare} strokeWidth="1.6"
            strokeDasharray="3 3" opacity="0.65" />
    </svg>
  );
}

// ─── Settings — 主题色 + 外观设置 ──────────────────────────────
function ScreenSettings() {
  const C = new Proxy({}, { get: (_, p) => window.KAIPA_TOKENS.color[p] });
  const K = new Proxy({}, { get: (_, p) => window.KAIPA_TOKENS[p] });

  const [selMode, setSelMode] = React.useState('light');
  const [selPreset, setSelPreset] = React.useState(1);

  const presets = [
    { label: '草地绿', hex: '#22C55E' },
    { label: '苔藓',   hex: '#4A7C59' },
    { label: '柑橘',   hex: '#FF7A1A' },
    { label: '砖红',   hex: '#A84228' },
    { label: '桃粉',   hex: '#FF8FB1' },
    { label: '湖蓝',   hex: '#2C5D7E' },
  ];

  const SettingRow = ({ icon, title, detail, right, last }) => (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12, padding: '13px 0',
      borderBottom: last ? 'none' : `0.5px solid ${C.lineSoft}`,
    }}>
      <div style={{
        width: 34, height: 34, borderRadius: 9,
        background: C.mossSoft,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <window.Icon name={icon} size={16} color={C.mossDeep} />
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 500, color: C.ink, letterSpacing: -0.2 }}>{title}</div>
        {detail && <div style={{ fontSize: 11.5, color: C.inkMuted, marginTop: 1 }}>{detail}</div>}
      </div>
      {right || <window.Icon name="forward" size={14} color={C.inkDim} />}
    </div>
  );

  return (
    <div style={{ position: 'relative', height: '100%', background: C.bg, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 30 }}>
        <window.IOSStatusBar dark={K.mode === 'dark'} />
      </div>

      <div style={{ padding: '60px 16px 110px', height: '100%', overflowY: 'auto' }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12, marginTop: 4, marginBottom: 24,
        }}>
          <window.CircleBtn icon="back" />
          <span style={{ fontSize: 20, fontWeight: 700, color: C.ink, letterSpacing: -0.5 }}>设置</span>
        </div>

        {/* 外观模式 */}
        <div style={{ marginBottom: 22 }}>
          <div style={{
            fontSize: 12, fontWeight: 600, color: C.inkMuted, letterSpacing: 0.3,
            textTransform: 'uppercase', marginBottom: 10, paddingLeft: 2,
          }}>外观模式</div>
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10,
          }}>
            {[
              { key: 'light', label: '浅色', icon: 'sun' },
              { key: 'dark',  label: '深色', icon: 'moon' },
              { key: 'auto',  label: '跟随系统', icon: 'phone' },
            ].map(m => {
              const active = selMode === m.key;
              return (
                <div key={m.key} onClick={() => setSelMode(m.key)} style={{
                  padding: '16px 8px', borderRadius: 16, cursor: 'pointer',
                  background: active ? C.mossSoft : C.surface,
                  border: `1.5px solid ${active ? C.mossDeep : C.line}`,
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
                  transition: 'all .15s',
                }}>
                  <window.Icon name={m.icon} size={24} color={active ? C.mossDeep : C.inkMuted} />
                  <span style={{
                    fontSize: 12.5, fontWeight: active ? 600 : 500,
                    color: active ? C.mossDeep : C.ink, letterSpacing: -0.1,
                  }}>{m.label}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* 主题色 */}
        <div style={{ marginBottom: 22 }}>
          <div style={{
            fontSize: 12, fontWeight: 600, color: C.inkMuted, letterSpacing: 0.3,
            textTransform: 'uppercase', marginBottom: 10, paddingLeft: 2,
          }}>主题色</div>
          <div style={{
            padding: 16, background: C.surface, borderRadius: 18,
            border: `0.5px solid ${C.line}`,
          }}>
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 10,
            }}>
              {presets.map((p, i) => {
                const active = selPreset === i;
                return (
                  <div key={i} onClick={() => setSelPreset(i)} style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                    cursor: 'pointer',
                  }}>
                    <div style={{
                      width: 42, height: 42, borderRadius: 999, background: p.hex,
                      boxShadow: active
                        ? `0 0 0 2.5px ${C.bg}, 0 0 0 4.5px ${p.hex}`
                        : `0 2px 6px ${p.hex}30`,
                      transition: 'box-shadow .15s',
                    }} />
                    <span style={{
                      fontSize: 10, color: active ? C.ink : C.inkMuted,
                      fontWeight: active ? 600 : 400, letterSpacing: -0.1,
                    }}>{p.label}</span>
                  </div>
                );
              })}
            </div>

            {/* Preview strip */}
            <div style={{
              marginTop: 16, padding: 14, borderRadius: 14,
              background: C.surfaceHi || C.bg,
              border: `0.5px solid ${C.lineSoft}`,
              display: 'flex', alignItems: 'center', gap: 12,
            }}>
              <div style={{
                width: 40, height: 40, borderRadius: 12,
                background: presets[selPreset].hex,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <window.Icon name="mountain" size={20} color="#fff" />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.ink, letterSpacing: -0.2 }}>预览效果</div>
                <div style={{ fontSize: 11, color: C.inkMuted, marginTop: 2 }}>
                  按钮、标签和高亮将使用此颜色
                </div>
              </div>
            </div>

            {/* Custom color */}
            <div style={{
              marginTop: 12, display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 0 0', borderTop: `0.5px solid ${C.lineSoft}`,
            }}>
              <window.Icon name="sparkle" size={15} color={C.inkMuted} />
              <span style={{ fontSize: 12.5, color: C.ink, fontWeight: 500, flex: 1 }}>自定义颜色</span>
              <div style={{
                width: 28, height: 28, borderRadius: 8,
                background: 'conic-gradient(red, yellow, lime, aqua, blue, magenta, red)',
                border: `1.5px solid ${C.line}`,
              }} />
              <window.Icon name="forward" size={13} color={C.inkDim} />
            </div>
          </div>
        </div>

        {/* 其他设置 */}
        <div style={{ marginBottom: 22 }}>
          <div style={{
            fontSize: 12, fontWeight: 600, color: C.inkMuted, letterSpacing: 0.3,
            textTransform: 'uppercase', marginBottom: 10, paddingLeft: 2,
          }}>通用</div>
          <div style={{
            padding: '0 16px', background: C.surface, borderRadius: 18,
            border: `0.5px solid ${C.line}`,
          }}>
            <SettingRow icon="globe" title="语言" detail="简体中文" />
            <SettingRow icon="ruler" title="单位" detail="公制 (km, m)" />
            <SettingRow icon="pin" title="离线地图" detail="已下载 3 个区域 · 1.2GB" />
            <SettingRow icon="bell" title="通知" detail="天气预警、好友动态" />
            <SettingRow icon="shield" title="隐私" detail="仅好友可见轨迹" />
            <SettingRow icon="cloud" title="数据同步" detail="iCloud · 最近同步 2 分钟前" last />
          </div>
        </div>

        {/* 关于 */}
        <div>
          <div style={{
            fontSize: 12, fontWeight: 600, color: C.inkMuted, letterSpacing: 0.3,
            textTransform: 'uppercase', marginBottom: 10, paddingLeft: 2,
          }}>关于</div>
          <div style={{
            padding: '0 16px', background: C.surface, borderRadius: 18,
            border: `0.5px solid ${C.line}`,
          }}>
            <SettingRow icon="chat" title="反馈与帮助" />
            <SettingRow icon="star" title="给 Kaipa 评分" />
            <SettingRow icon="lock" title="用户协议与隐私" last />
          </div>
        </div>

        {/* Version */}
        <div style={{
          textAlign: 'center', marginTop: 24, fontSize: 11,
          color: C.inkDim, fontFamily: K.font.mono,
        }}>Kaipa v1.0.0 (build 42)</div>
      </div>

      <window.TabBar active="me" departing={false} />
    </div>
  );
}

// ─── Trip Complete — 行程完成总结 ─────────────────────────────
function ScreenTripComplete() {
  const C = new Proxy({}, { get: (_, p) => window.KAIPA_TOKENS.color[p] });
  const K = new Proxy({}, { get: (_, p) => window.KAIPA_TOKENS[p] });

  const stats = [
    { value: '11.4', unit: 'km', label: '总距离' },
    { value: '680', unit: 'm', label: '累计爬升' },
    { value: '5:18', unit: '', label: '用时' },
    { value: '4.2', unit: 'km/h', label: '均速' },
  ];

  const achievements = [
    { icon: 'mountain', label: '登顶 1410m', unlocked: true },
    { icon: 'flame', label: '连续 3 周', unlocked: true },
    { icon: 'star', label: '首条 T3', unlocked: true },
    { icon: 'moon', label: '日出行者', unlocked: false },
  ];

  const photos = [
    { spot: '北京结', time: '06:42' },
    { spot: '鹰飞倒仰', time: '08:15' },
    { spot: '天梯', time: '09:33' },
    { spot: '九眼楼', time: '11:01' },
  ];

  return (
    <div style={{ position: 'relative', height: '100%', background: C.bg, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 30 }}>
        <window.IOSStatusBar dark={true} />
      </div>

      <div style={{ height: '100%', overflowY: 'auto' }}>
        {/* Hero — celebration header */}
        <div style={{
          position: 'relative', height: 300, overflow: 'hidden',
          background: `linear-gradient(135deg, ${C.mossDeep}, ${C.flare}cc)`,
        }}>
          {/* Decorative trail SVG */}
          <svg viewBox="0 0 400 300" width="100%" height="100%"
               style={{ position: 'absolute', inset: 0, opacity: 0.12 }}>
            <path d="M-20,260 Q60,190 120,210 T240,150 T360,110 T420,70"
                  fill="none" stroke="#fff" strokeWidth="3" strokeDasharray="8 6" />
            <path d="M-20,280 Q80,210 160,230 T280,170 T380,130 T420,90"
                  fill="none" stroke="#fff" strokeWidth="2" />
          </svg>
          {/* Bottom fade into bg */}
          <div style={{
            position: 'absolute', left: 0, right: 0, bottom: 0, height: 60,
            background: `linear-gradient(180deg, transparent, ${C.bg})`,
          }} />

          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'flex-start',
            padding: '70px 20px 60px', textAlign: 'center',
          }}>
            <div style={{
              width: 52, height: 52, borderRadius: 999,
              background: 'rgba(255,255,255,0.2)', backdropFilter: 'blur(10px)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              marginBottom: 14,
            }}>
              <window.Icon name="check" size={26} color="#fff" strokeWidth={2.5} />
            </div>
            <div style={{
              fontSize: 12, color: 'rgba(255,255,255,0.7)', fontWeight: 600,
              letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8,
            }}>行程完成</div>
            <div style={{
              fontSize: 28, fontWeight: 700, color: '#fff', letterSpacing: -0.8,
              lineHeight: 1.1,
            }}>箭扣长城</div>
            <div style={{
              fontSize: 13, color: 'rgba(255,255,255,0.65)', marginTop: 8,
            }}>2026.04.26 · 周六 · 06:12 — 11:30</div>
          </div>
        </div>

        <div style={{ padding: '0 16px 110px', marginTop: -40, position: 'relative', zIndex: 5 }}>
          {/* Stats card */}
          <div style={{
            padding: 20, borderRadius: 20, background: C.surface,
            border: `0.5px solid ${C.line}`,
            boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
          }}>
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8,
            }}>
              {stats.map((s, i) => (
                <div key={i} style={{ textAlign: 'center' }}>
                  <div style={{
                    fontSize: 24, fontWeight: 700, color: C.ink,
                    fontFamily: K.font.sans, letterSpacing: -0.5,
                  }}>
                    {s.value}
                    {s.unit && <span style={{ fontSize: 11, fontWeight: 500, color: C.inkMuted, marginLeft: 2 }}>{s.unit}</span>}
                  </div>
                  <div style={{ fontSize: 11, color: C.inkMuted, marginTop: 3 }}>{s.label}</div>
                </div>
              ))}
            </div>

            {/* Mini elevation profile */}
            <div style={{
              marginTop: 18, paddingTop: 16, borderTop: `0.5px solid ${C.lineSoft}`,
            }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10,
              }}>
                <window.Icon name="altitude" size={14} color={C.inkMuted} />
                <span style={{ fontSize: 11, color: C.inkMuted, fontWeight: 500 }}>海拔轨迹</span>
              </div>
              <svg viewBox="0 0 320 60" width="100%" height="50" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="tc-elev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={C.flare} stopOpacity="0.25" />
                    <stop offset="100%" stopColor={C.flare} stopOpacity="0" />
                  </linearGradient>
                </defs>
                <path d="M0,50 L15,45 L40,35 L65,25 L90,18 L130,8 L160,14 L200,10 L230,22 L260,28 L290,38 L320,42 L320,60 L0,60 Z"
                      fill="url(#tc-elev)" />
                <path d="M0,50 L15,45 L40,35 L65,25 L90,18 L130,8 L160,14 L200,10 L230,22 L260,28 L290,38 L320,42"
                      fill="none" stroke={C.flare} strokeWidth="1.5" strokeLinejoin="round" />
                <circle cx="0" cy="50" r="3" fill={C.moss} stroke={C.surface} strokeWidth="1.5" />
                <circle cx="320" cy="42" r="3" fill={C.flare} stroke={C.surface} strokeWidth="1.5" />
              </svg>
              <div style={{
                display: 'flex', justifyContent: 'space-between',
                fontSize: 10, color: C.inkDim, marginTop: 4,
              }}>
                <span>730m 起点</span>
                <span style={{ color: C.flare, fontWeight: 600 }}>1410m 最高</span>
                <span>1180m 终点</span>
              </div>
            </div>
          </div>

          {/* Achievements */}
          <div style={{ marginTop: 24 }}>
            <window.SectionTitle title="本次成就" right={`${achievements.filter(a => a.unlocked).length} 个解锁`} />
          </div>
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginTop: 10,
          }}>
            {achievements.map((a, i) => (
              <div key={i} style={{
                aspectRatio: '1', borderRadius: 16,
                background: a.unlocked ? C.surface : 'transparent',
                border: `0.5px solid ${a.unlocked ? C.line : C.lineSoft}`,
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                justifyContent: 'center', gap: 6,
                opacity: a.unlocked ? 1 : 0.4,
              }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 999,
                  background: a.unlocked ? C.flareSoft : C.lineSoft,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <window.Icon name={a.icon} size={18}
                    color={a.unlocked ? C.flare : C.inkDim} />
                </div>
                <span style={{
                  fontSize: 10, color: a.unlocked ? C.ink : C.inkDim,
                  fontWeight: 500, letterSpacing: -0.1, textAlign: 'center',
                  padding: '0 4px',
                }}>{a.label}</span>
              </div>
            ))}
          </div>

          {/* Photo timeline */}
          <div style={{ marginTop: 24 }}>
            <window.SectionTitle title="沿途记录" right={`${photos.length} 张`} />
          </div>
          <div style={{
            display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 4,
            marginTop: 10, marginLeft: -16, paddingLeft: 16, marginRight: -16, paddingRight: 16,
          }}>
            {photos.map((p, i) => (
              <div key={i} style={{
                minWidth: 130, height: 170, borderRadius: 16, overflow: 'hidden',
                position: 'relative', border: `0.5px solid ${C.line}`,
                background: C.terrain.mid,
              }}>
                <window.PhotoStripe seed={i + 10} />
                <div style={{
                  position: 'absolute', inset: 0,
                  background: 'linear-gradient(180deg, transparent 40%, rgba(0,0,0,0.6) 100%)',
                }} />
                <div style={{ position: 'absolute', top: 10, left: 10 }}>
                  <span style={{
                    fontSize: 10, fontWeight: 600, color: '#fff',
                    background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(8px)',
                    padding: '3px 8px', borderRadius: 99,
                  }}>{p.time}</span>
                </div>
                <div style={{ position: 'absolute', bottom: 10, left: 12 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>{p.spot}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Share & rate */}
          <div style={{ marginTop: 24 }}>
            <window.SectionTitle title="分享这次旅程" />
          </div>
          <div style={{
            padding: 18, borderRadius: 18, background: C.surface,
            border: `0.5px solid ${C.line}`, marginTop: 10,
          }}>
            {/* Wrapped mini card */}
            <div style={{
              padding: 16, borderRadius: 14,
              background: `linear-gradient(135deg, ${C.mossDeep}, ${C.flare}bb)`,
              color: '#fff', marginBottom: 14,
            }}>
              <div style={{ fontSize: 10, opacity: 0.75, fontWeight: 500, letterSpacing: 0.5, marginBottom: 6 }}>KAIPA WRAPPED</div>
              <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: -0.4, marginBottom: 4 }}>箭扣长城 · 11.4km</div>
              <div style={{ fontSize: 11, opacity: 0.7 }}>2026.04.26 · 5 小时 18 分 · ↑680m</div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <button style={{
                height: 44, borderRadius: 12, border: 'none', cursor: 'pointer',
                background: C.flare, color: '#fff',
                fontSize: 13.5, fontWeight: 600, fontFamily: K.font.sans,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}>
                <window.Icon name="share" size={15} color="#fff" />
                分享给朋友
              </button>
              <button style={{
                height: 44, borderRadius: 12, border: `1px solid ${C.line}`, cursor: 'pointer',
                background: C.surface, color: C.ink,
                fontSize: 13.5, fontWeight: 600, fontFamily: K.font.sans,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}>
                <window.Icon name="download" size={15} color={C.ink} />
                保存图片
              </button>
            </div>
          </div>

          {/* Rate this route */}
          <div style={{
            marginTop: 16, padding: 18, borderRadius: 18, background: C.surface,
            border: `0.5px solid ${C.line}`,
          }}>
            <div style={{
              fontSize: 14, fontWeight: 600, color: C.ink, letterSpacing: -0.2,
              marginBottom: 12,
            }}>给这条路线评分</div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              {[1, 2, 3, 4, 5].map(s => (
                <div key={s} style={{
                  width: 36, height: 36, borderRadius: 999, cursor: 'pointer',
                  background: s <= 4 ? C.flareSoft : C.lineSoft,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <window.Icon name="star" size={18} color={s <= 4 ? C.flare : C.inkDim} />
                </div>
              ))}
            </div>
            <div style={{
              height: 68, borderRadius: 12, padding: '10px 12px',
              background: C.bg, border: `0.5px solid ${C.lineSoft}`,
              fontSize: 12.5, color: C.inkDim,
            }}>留下一句话给后来的人…</div>
          </div>
        </div>
      </div>

      {/* Bottom CTA */}
      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 25,
        padding: '12px 16px 32px',
        background: `linear-gradient(180deg, transparent 0%, ${C.bg} 50%)`,
      }}>
        <button style={{
          width: '100%', height: 54, borderRadius: 16,
          background: C.ink, color: C.bg, border: 'none',
          fontSize: 15, fontWeight: 600, fontFamily: K.font.sans,
          letterSpacing: -0.3, cursor: 'pointer',
        }}>完成  ·  返回首页</button>
      </div>
    </div>
  );
}

// ─── Notifications — 通知中心 ─────────────────────────────────
function ScreenNotifications() {
  const C = new Proxy({}, { get: (_, p) => window.KAIPA_TOKENS.color[p] });
  const K = new Proxy({}, { get: (_, p) => window.KAIPA_TOKENS[p] });

  const sections = [
    {
      label: '今天', items: [
        {
          type: 'weather', icon: 'weather', iconBg: C.sky,
          title: '天气预警 · 箭扣长城', detail: '明日午后雷阵雨概率 65%，建议调整出行时间',
          time: '2 小时前', unread: true,
        },
        {
          type: 'social', icon: 'heart', iconBg: C.flare,
          title: 'Sara K. 赞了你的路线', detail: '箭扣长城 · 11.4km',
          time: '4 小时前', unread: true,
        },
        {
          type: 'system', icon: 'download', iconBg: C.moss,
          title: '离线地图已更新', detail: '怀柔区地图包 v3.2 · 248MB',
          time: '5 小时前', unread: false,
        },
      ],
    },
    {
      label: '昨天', items: [
        {
          type: 'social', icon: 'users', iconBg: C.sand || '#C4A882',
          title: '陈芳 开始了行程', detail: '十三陵水库环线 · 正在进行中',
          time: '昨天 14:20', unread: false,
        },
        {
          type: 'achievement', icon: 'flag', iconBg: C.flare,
          title: '新成就解锁!', detail: '「百公里」— 累计徒步超过 100km',
          time: '昨天 11:30', unread: false,
        },
      ],
    },
    {
      label: '本周', items: [
        {
          type: 'weather', icon: 'sun', iconBg: C.sky,
          title: '本周末天气预报', detail: '周六多云 18°C，周日晴 22°C — 适合出行',
          time: '周三', unread: false,
        },
        {
          type: 'social', icon: 'chat', iconBg: C.moss,
          title: '陈明 评论了你的路线', detail: '「鹰飞倒仰确实很险，下次一起去…」',
          time: '周二', unread: false,
        },
        {
          type: 'system', icon: 'sparkle', iconBg: C.flare,
          title: 'Kaipa 周报', detail: '本周 2 次出行 · 28.7km · 查看回顾 →',
          time: '周一', unread: false,
        },
      ],
    },
  ];

  return (
    <div style={{ position: 'relative', height: '100%', background: C.bg, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 30 }}>
        <window.IOSStatusBar dark={K.mode === 'dark'} />
      </div>

      <div style={{ padding: '60px 16px 110px', height: '100%', overflowY: 'auto' }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginTop: 4, marginBottom: 20,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <window.CircleBtn icon="back" />
            <span style={{ fontSize: 20, fontWeight: 700, color: C.ink, letterSpacing: -0.5 }}>通知</span>
          </div>
          <span style={{
            fontSize: 12, color: C.flare, fontWeight: 500, letterSpacing: -0.1,
          }}>全部已读</span>
        </div>

        {/* Quick filters */}
        <div style={{
          display: 'flex', gap: 8, marginBottom: 20, overflowX: 'auto',
        }}>
          {[
            { label: '全部', active: true },
            { label: '天气', icon: 'weather' },
            { label: '好友', icon: 'users' },
            { label: '系统', icon: 'bell' },
          ].map((f, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '7px 14px', borderRadius: 99, whiteSpace: 'nowrap',
              background: f.active ? C.ink : C.surface,
              color: f.active ? C.bg : C.ink,
              border: `0.5px solid ${f.active ? C.ink : C.line}`,
              fontSize: 12.5, fontWeight: 500,
            }}>
              {f.icon && <window.Icon name={f.icon} size={13}
                color={f.active ? C.bg : C.inkMuted} />}
              {f.label}
            </div>
          ))}
        </div>

        {/* Notification sections */}
        {sections.map((sec, si) => (
          <div key={si} style={{ marginBottom: 20 }}>
            <div style={{
              fontSize: 12, fontWeight: 600, color: C.inkMuted,
              letterSpacing: 0.3, marginBottom: 10, paddingLeft: 2,
            }}>{sec.label}</div>

            <div style={{
              background: C.surface, borderRadius: 18,
              border: `0.5px solid ${C.line}`, overflow: 'hidden',
            }}>
              {sec.items.map((item, ii) => (
                <div key={ii} style={{
                  display: 'flex', alignItems: 'flex-start', gap: 12,
                  padding: '14px 16px',
                  borderBottom: ii < sec.items.length - 1 ? `0.5px solid ${C.lineSoft}` : 'none',
                  background: item.unread ? (C.flareSoft + '30') : 'transparent',
                }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                    background: item.iconBg + '20',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <window.Icon name={item.icon} size={17} color={item.iconBg} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                    }}>
                      <span style={{
                        fontSize: 13.5, fontWeight: item.unread ? 600 : 500,
                        color: C.ink, letterSpacing: -0.2,
                        flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>{item.title}</span>
                      {item.unread && <div style={{
                        width: 7, height: 7, borderRadius: 99, background: C.flare, flexShrink: 0,
                      }} />}
                    </div>
                    <div style={{
                      fontSize: 12, color: C.inkMuted, marginTop: 3, lineHeight: 1.4,
                    }}>{item.detail}</div>
                    <div style={{
                      fontSize: 11, color: C.inkDim, marginTop: 4,
                    }}>{item.time}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <window.TabBar active="me" departing={false} />
    </div>
  );
}

window.ScreenNavigateHUD = ScreenNavigateHUD;
window.ScreenRoutePublish = ScreenRoutePublish;
window.ScreenOnboarding = ScreenOnboarding;
window.ScreenSettings = ScreenSettings;
window.ScreenTripComplete = ScreenTripComplete;
window.ScreenNotifications = ScreenNotifications;

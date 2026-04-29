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

window.ScreenNavigateHUD = ScreenNavigateHUD;
window.ScreenRoutePublish = ScreenRoutePublish;
window.ScreenOnboarding = ScreenOnboarding;

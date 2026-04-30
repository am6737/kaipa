// Kaipa screens v2 — route detail, gear pick, navigate, library, profile
const Kr = new Proxy({}, { get: (_, p) => window.KAIPA_TOKENS[p] });
const Cr = new Proxy({}, { get: (_, p) => window.KAIPA_TOKENS.color[p] });

// ─────────────────────────────────────────────────────────────
// SCREEN 2: Route Detail — full-bleed hero map + scroll content
// ─────────────────────────────────────────────────────────────
function ScreenRouteDetail() {
  return (
    <div style={{ position: 'relative', height: '100%', background: Cr.bg, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 30 }}>
        <window.IOSStatusBar dark={false} />
      </div>

      {/* Hero map */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 360 }}>
        <window.KaipaMap zoom="trail" showLabels={false} animateRoute={false} />
        <div style={{
          position: 'absolute', inset: 0,
          background: `linear-gradient(180deg, transparent 50%, ${Cr.bg} 95%)`,
        }} />
        {/* Top chrome */}
        <div style={{
          position: 'absolute', top: 56, left: 16, right: 16,
          display: 'flex', justifyContent: 'space-between', zIndex: 5,
        }}>
          <window.CircleBtn icon="back" />
          <div style={{ display: 'flex', gap: 8 }}>
            <window.CircleBtn icon="heart" color={Cr.flare} />
            <window.CircleBtn icon="share" />
          </div>
        </div>
      </div>

      {/* Content */}
      <div style={{
        position: 'absolute', top: 280, left: 0, right: 0, bottom: 0,
        overflowY: 'auto', padding: '0 16px 110px',
      }}>
        <div style={{ marginBottom: 14 }}>
          <div style={{
            fontSize: 11, fontFamily: Kr.font.sans, color: Cr.inkMuted, marginBottom: 4,
          }}>北京 · 怀柔区</div>
          <h1 style={{
            fontSize: 32, fontWeight: 700, color: Cr.ink, letterSpacing: -0.9,
            margin: 0, lineHeight: 1.05,
          }}>箭扣长城</h1>
          <div style={{ fontSize: 14, color: Cr.inkMuted, marginTop: 6, letterSpacing: -0.2 }}>
            西栅子 → 九眼楼  ·  野长城段
          </div>
        </div>

        {/* Stats card */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12,
          padding: 16, background: Cr.surface, borderRadius: 18,
          border: `0.5px solid ${Cr.line}`, marginBottom: 16,
          boxShadow: '0 1px 3px rgba(40,30,20,0.04)',
        }}>
          <window.Stat value="11.4" unit="km" label="距离" />
          <window.Stat value="680" unit="m" label="爬升" />
          <window.Stat value="5:20" label="时长" />
          <window.Stat value="T3" label="难度" />
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 22 }}>
          <window.DiffBadge level="hard" />
          <window.Pill>野长城</window.Pill>
          <window.Pill>非景区</window.Pill>
          <window.Pill>暴露段</window.Pill>
          <window.Pill>需手脚并用</window.Pill>
        </div>

        {/* Elevation profile */}
        <SectionTitle title="海拔剖面" />
        <div style={{
          background: Cr.surface, borderRadius: 16, padding: 16,
          border: `0.5px solid ${Cr.line}`, marginBottom: 22,
        }}>
          <ElevProfile />
        </div>

        {/* Getting there */}
        <SectionTitle title="如何抵达" />
        <div style={{
          background: Cr.surface, borderRadius: 16, padding: '4px 16px',
          border: `0.5px solid ${Cr.line}`, marginBottom: 22,
        }}>
          <AccessRow icon="navigate" title="自驾" detail="国贸 → 西栅子村 · 2h10m · 92km" badge="推荐" />
          <Divider />
          <AccessRow icon="users" title="拼车" detail="周末徒步群拼车 · ¥80/人" />
          <Divider />
          <AccessRow icon="layers2" title="公交+打车" detail="916快 → 怀柔 → 黑山寨 · 3h+" />
        </div>

        {/* Gear */}
        <SectionTitle title="推荐装备" right="14 件 · 5.6kg" />
        <div style={{
          background: Cr.surface, borderRadius: 16, padding: 16,
          border: `0.5px solid ${Cr.line}`, marginBottom: 22,
          display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14,
        }}>
          {[
            { i: 'boot',     l: '高帮鞋' },
            { i: 'backpack', l: '30L 包' },
            { i: 'jacket',   l: '冲锋衣' },
            { i: 'bottle',   l: '2L 水' },
            { i: 'light',    l: '头灯' },
            { i: 'knife',    l: '手套' },
            { i: 'compass',  l: '指南针' },
            { i: 'plus',     l: '更多' },
          ].map((g, i) => (
            <div key={i} style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7,
            }}>
              <div style={{
                width: 52, height: 52, borderRadius: 14,
                background: i === 7 ? 'transparent' : Cr.surfaceHi,
                border: i === 7 ? `1px dashed ${Cr.line}` : `0.5px solid ${Cr.line}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <window.Icon name={g.i} size={22} color={i === 7 ? Cr.inkMuted : Cr.moss} strokeWidth={1.6} />
              </div>
              <span style={{ fontSize: 11, color: Cr.inkMuted, fontFamily: Kr.font.sans, letterSpacing: -0.1 }}>{g.l}</span>
            </div>
          ))}
        </div>

        {/* Photo spots */}
        <SectionTitle title="拍照打卡" right="5 处" />
        <div style={{
          display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 4,
          marginBottom: 22, marginLeft: -16, paddingLeft: 16, marginRight: -16, paddingRight: 16,
        }}>
          {[
            { n: '北京结', km: '3.2km', t: '日出最佳' },
            { n: '鹰飞倒仰', km: '5.8km', t: '险段' },
            { n: '天梯', km: '7.1km', t: '日落' },
            { n: '九眼楼', km: '11.4km', t: '终点' },
          ].map((p, i) => (
            <div key={i} style={{
              minWidth: 140, height: 180, borderRadius: 16, overflow: 'hidden',
              border: `0.5px solid ${Cr.line}`, position: 'relative',
              background: Cr.terrain.mid,
            }}>
              <PhotoStripe seed={i} />
              <div style={{
                position: 'absolute', inset: 0,
                background: 'linear-gradient(180deg, transparent 50%, rgba(0,0,0,0.65) 100%)',
              }} />
              <div style={{
                position: 'absolute', bottom: 10, left: 12, right: 12,
              }}>
                <div style={{
                  fontSize: 10, fontFamily: Kr.font.sans, color: '#fff',
                  opacity: 0.85, marginBottom: 2, letterSpacing: -0.1,
                }}>{p.t}  ·  {p.km}</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#fff', letterSpacing: -0.2 }}>{p.n}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Notes */}
        <SectionTitle title="走过的人" right="见全部" />
        <div style={{
          background: Cr.surface, borderRadius: 16, padding: 16,
          border: `0.5px solid ${Cr.line}`, marginBottom: 22,
        }}>
          <NoteRow user="陈明" date="3 天前" rating={4.5}
                   text="北京结到鹰飞倒仰最险，新手务必带绳子。日出 5:42 抵北京结刚好。" />
          <Divider />
          <NoteRow user="Sara K." date="上周" rating={5}
                   text="11 月去秋色拉满。下午 3 点后山风很大，建议带防风外套。" />
        </div>
      </div>

      {/* Sticky CTA */}
      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 25,
        padding: '12px 16px 32px',
        background: `linear-gradient(180deg, transparent 0%, ${Cr.bg} 50%)`,
      }}>
        <button style={{
          width: '100%', height: 54, borderRadius: 16,
          background: Cr.flare, color: '#fff', border: 'none',
          fontSize: 16, fontWeight: 600, fontFamily: Kr.font.sans,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          boxShadow: `0 4px 16px ${Cr.flare}40`, letterSpacing: -0.3,
          cursor: 'pointer',
        }}>
          <window.Icon name="navigate" size={16} />
          准备出发  ·  选择装备
        </button>
      </div>
    </div>
  );
}

function SectionTitle({ title, right }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
      marginBottom: 10, paddingLeft: 2,
    }}>
      <span style={{ fontSize: 18, fontWeight: 700, color: Cr.ink, letterSpacing: -0.4 }}>{title}</span>
      {right && <span style={{ fontSize: 12, color: Cr.inkMuted, letterSpacing: -0.1 }}>{right}</span>}
    </div>
  );
}

function Divider() {
  return <div style={{ height: 0.5, background: Cr.line, margin: '14px -16px' }} />;
}

function AccessRow({ icon, title, detail, badge }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0' }}>
      <div style={{
        width: 38, height: 38, borderRadius: 11, background: Cr.mossSoft,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <window.Icon name={icon} size={17} color={Cr.mossDeep} />
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 14.5, fontWeight: 500, color: Cr.ink, letterSpacing: -0.2 }}>{title}</span>
          {badge && (
            <span style={{
              fontSize: 10, fontFamily: Kr.font.sans, color: Cr.flare, fontWeight: 600,
              background: Cr.flareSoft, padding: '2px 7px', borderRadius: 99,
            }}>{badge}</span>
          )}
        </div>
        <div style={{ fontSize: 12, color: Cr.inkMuted, marginTop: 2 }}>{detail}</div>
      </div>
      <window.Icon name="forward" size={14} color={Cr.inkDim} />
    </div>
  );
}

function NoteRow({ user, date, rating, text }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <div style={{
          width: 32, height: 32, borderRadius: 999, background: Cr.mossSoft,
          color: Cr.mossDeep, display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 13, fontWeight: 600,
        }}>{user[0]}</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: Cr.ink, letterSpacing: -0.2 }}>{user}</div>
          <div style={{ fontSize: 11, color: Cr.inkDim }}>{date}</div>
        </div>
        <div style={{ fontSize: 12, color: Cr.flare, fontWeight: 600 }}>★ {rating}</div>
      </div>
      <div style={{ fontSize: 13.5, lineHeight: 1.5, color: Cr.ink, opacity: 0.85 }}>{text}</div>
    </div>
  );
}

function ElevProfile() {
  return (
    <div>
      <svg viewBox="0 0 320 100" width="100%" height="110" preserveAspectRatio="none">
        <defs>
          <linearGradient id="elev-fill-r" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={Cr.flare} stopOpacity="0.28" />
            <stop offset="100%" stopColor={Cr.flare} stopOpacity="0" />
          </linearGradient>
        </defs>
        {[20, 50, 80].map(y => (
          <line key={y} x1="0" y1={y} x2="320" y2={y} stroke={Cr.line} strokeWidth="0.5" strokeDasharray="2 3" />
        ))}
        <path d="M0,80 L20,72 L45,55 L70,40 L95,28 L130,15 L160,22 L200,18 L230,32 L260,40 L290,55 L320,65 L320,100 L0,100 Z"
              fill="url(#elev-fill-r)" />
        <path d="M0,80 L20,72 L45,55 L70,40 L95,28 L130,15 L160,22 L200,18 L230,32 L260,40 L290,55 L320,65"
              fill="none" stroke={Cr.flare} strokeWidth="2" strokeLinejoin="round" />
        <circle cx="0" cy="80" r="4" fill={Cr.moss} stroke="#fff" strokeWidth="1.5" />
        <circle cx="130" cy="15" r="4" fill={Cr.flare} stroke="#fff" strokeWidth="1.5" />
        <circle cx="320" cy="65" r="4" fill={Cr.flare} stroke="#fff" strokeWidth="1.5" />
      </svg>
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        fontSize: 11, fontFamily: Kr.font.sans, color: Cr.inkMuted, marginTop: 6,
      }}>
        <span>730m  起点</span>
        <span style={{ color: Cr.flare, fontWeight: 600 }}>1410m  鹰飞倒仰</span>
        <span>1180m  终点</span>
      </div>
    </div>
  );
}

function PhotoStripe({ seed = 0 }) {
  const palettes = [
    [Cr.terrain.peak, Cr.terrain.ridge],
    [Cr.terrain.ridge, Cr.terrain.mid],
    [Cr.terrain.water, Cr.terrain.lowland],
    [Cr.sand, Cr.terrain.peak],
  ];
  const [a, b] = palettes[seed % palettes.length];
  return (
    <svg viewBox="0 0 140 180" width="100%" height="100%" preserveAspectRatio="none"
         style={{ position: 'absolute', inset: 0 }}>
      <defs>
        <pattern id={`s2-${seed}`} width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="8" stroke={b} strokeWidth="4" />
        </pattern>
      </defs>
      <rect width="140" height="180" fill={a} />
      <rect width="140" height="180" fill={`url(#s2-${seed})`} opacity="0.4" />
      <text x="70" y="92" textAnchor="middle"
            fontFamily={Kr.font.mono} fontSize="8" fill={Cr.bg}
            opacity="0.6" letterSpacing="2">PHOTO</text>
    </svg>
  );
}

window.ScreenRouteDetail = ScreenRouteDetail;
window.PhotoStripe = PhotoStripe;
window.SectionTitle = SectionTitle;
window.Divider = Divider;

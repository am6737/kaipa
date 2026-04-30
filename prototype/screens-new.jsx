// Kaipa new screens — search, weather, confirm, social, profile-plus, onboarding
const Kn = new Proxy({}, { get: (_, p) => window.KAIPA_TOKENS[p] });
const Cn = new Proxy({}, { get: (_, p) => window.KAIPA_TOKENS.color[p] });

// Tiny route mini-map (decorative SVG)
function MiniMap({ seed = 0, h = 80, w = '100%', dark = false }) {
  const C = window.KAIPA_TOKENS.color;
  const paths = [
    'M5,55 Q20,30 35,40 T70,20 L95,15',
    'M5,40 Q25,55 45,35 Q65,15 95,30',
    'M8,20 Q30,45 50,30 Q70,15 95,55',
    'M10,60 Q35,20 60,40 Q80,55 95,25',
  ];
  const bg = dark ? C.terrain.lowland : C.terrain.lowland;
  const ridge = dark ? C.terrain.ridge : C.terrain.ridge;
  return (
    <svg viewBox="0 0 100 70" width={w} height={h} preserveAspectRatio="none"
         style={{ display: 'block', borderRadius: 'inherit' }}>
      <rect width="100" height="70" fill={bg} />
      {[15, 30, 45, 55].map((y, i) => (
        <line key={i} x1="0" y1={y} x2="100" y2={y}
              stroke={C.terrain.contour} strokeWidth="0.4" />
      ))}
      <path d={`M0,55 Q25,${35 + seed % 10} 50,40 T100,${25 + seed % 15} L100,70 L0,70 Z`}
            fill={ridge} opacity="0.5" />
      <path d={paths[seed % paths.length]} fill="none"
            stroke={C.flare} strokeWidth="2" strokeLinecap="round" />
      <circle cx="5" cy={paths[seed % paths.length].match(/M(\d+),(\d+)/)?.[2] || 50}
              r="2.2" fill={C.moss} stroke="#fff" strokeWidth="0.8" />
      <circle cx="95" cy={parseInt(paths[seed % paths.length].split('L')[1]?.split(',')[1] || 30)}
              r="2.2" fill={C.flare} stroke="#fff" strokeWidth="0.8" />
    </svg>
  );
}

// ─── Search Results ──────────────────────────────────────────
function ScreenSearch() {
  const [filter, setFilter] = React.useState('all');
  const filters = [
    { id: 'all',  l: '全部' },
    { id: 'easy', l: '入门' },
    { id: 'mod',  l: '中等' },
    { id: 'hard', l: '困难' },
    { id: 'near', l: '50km 内' },
  ];
  const results = [
    { n: '箭扣长城',     km: 11.4, up: 680, dur: '5:20', diff: 'hard', r: 4.7, region: '怀柔', seed: 0 },
    { n: '云蒙山主峰',    km: 7.3,  up: 620, dur: '4:00', diff: 'mod',  r: 4.5, region: '密云', seed: 1 },
    { n: '海坨山纵走',    km: 18.1, up: 1240,dur: '8:30', diff: 'expert',r: 4.9, region: '延庆', seed: 2 },
    { n: '十三陵水库环线', km: 14.2, up: 480, dur: '4:40', diff: 'easy', r: 4.2, region: '昌平', seed: 3 },
    { n: '香山公园主峰',   km: 5.4,  up: 380, dur: '2:30', diff: 'easy', r: 4.0, region: '海淀', seed: 0 },
  ];
  return (
    <div style={{ position: 'relative', height: '100%', background: Cn.bg, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 30 }}>
        <window.IOSStatusBar dark={Kn.mode === 'dark'} />
      </div>

      <div style={{ padding: '54px 16px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <window.CircleBtn icon="back" />
          <div style={{
            flex: 1, height: 40, borderRadius: 12,
            background: Cn.surface, border: `0.5px solid ${Cn.line}`,
            display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px',
          }}>
            <window.Icon name="search" size={15} color={Cn.inkMuted} />
            <span style={{ fontSize: 14, color: Cn.ink, letterSpacing: -0.2 }}>北京 周末 一日</span>
            <span style={{ flex: 1 }} />
            <span style={{ fontSize: 11, color: Cn.inkDim, fontFamily: Kn.font.mono }}>32 条</span>
          </div>
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', marginLeft: -16, paddingLeft: 16, marginRight: -16, paddingRight: 16, paddingBottom: 4 }}>
          {filters.map(f => (
            <button key={f.id} type="button"
                    onClick={() => setFilter(f.id)}
                    style={{
                      padding: '7px 14px', borderRadius: 999,
                      fontSize: 12.5, fontWeight: 500, letterSpacing: -0.1,
                      border: `0.5px solid ${filter === f.id ? Cn.flare : Cn.line}`,
                      background: filter === f.id ? Cn.flareSoft : Cn.surface,
                      color: filter === f.id ? Cn.flare : Cn.ink,
                      whiteSpace: 'nowrap', cursor: 'pointer',
                    }}>{f.l}</button>
          ))}
          <button type="button" style={{
            padding: '7px 12px', borderRadius: 999,
            border: `0.5px solid ${Cn.line}`, background: Cn.surface,
            color: Cn.inkMuted, display: 'flex', alignItems: 'center', gap: 4,
            fontSize: 12.5, cursor: 'pointer',
          }}>
            <window.Icon name="layers2" size={12} />筛选
          </button>
        </div>

        {/* Sort row */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          marginTop: 14, fontSize: 11.5, color: Cn.inkMuted,
        }}>
          <span>找到 32 条线路 · 距你 0–80km</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: Cn.ink, fontWeight: 500 }}>
            最近 <window.Icon name="forward" size={10} color={Cn.ink} />
          </span>
        </div>
      </div>

      {/* List */}
      <div style={{
        position: 'absolute', top: 200, left: 0, right: 0, bottom: 0,
        overflowY: 'auto', padding: '0 16px 32px',
      }}>
        {results.map((r, i) => (
          <div key={i} style={{
            display: 'flex', gap: 12, padding: 12, borderRadius: 14,
            background: Cn.surface, border: `0.5px solid ${Cn.line}`,
            marginBottom: 10,
          }}>
            <div style={{ width: 96, height: 96, borderRadius: 10, overflow: 'hidden', flexShrink: 0 }}>
              <MiniMap seed={r.seed} h={96} dark={Kn.mode === 'dark'} />
            </div>
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 15, fontWeight: 600, color: Cn.ink, letterSpacing: -0.3 }}>{r.n}</span>
                <span style={{ fontSize: 11.5, color: Cn.flare, fontWeight: 600 }}>★ {r.r}</span>
              </div>
              <div style={{ fontSize: 11.5, color: Cn.inkMuted, marginTop: 2 }}>{r.region} · 距你 {(15 + r.seed * 8).toFixed(0)}km</div>
              <div style={{ flex: 1 }} />
              <div style={{ display: 'flex', gap: 10, marginTop: 8, fontSize: 11, color: Cn.inkMuted, fontFamily: Kn.font.mono }}>
                <span>{r.km}km</span>
                <span>↑{r.up}m</span>
                <span>{r.dur}</span>
              </div>
              <div style={{ marginTop: 6 }}>
                <window.DiffBadge level={r.diff} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Weather step ────────────────────────────────────────────
function ScreenWeather() {
  return (
    <div style={{ position: 'relative', height: '100%', background: Cn.bg, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 30 }}>
        <window.IOSStatusBar dark={Kn.mode === 'dark'} />
      </div>
      <div style={{ padding: '60px 16px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <window.CircleBtn icon="back" />
          <span style={{ fontSize: 12, color: Cn.inkMuted }}>第 2 步 / 共 3 步</span>
          <window.CircleBtn icon="ellipsis" />
        </div>
        <div style={{ fontSize: 12, color: Cn.inkMuted, marginBottom: 4 }}>箭扣长城</div>
        <h1 style={{ fontSize: 26, fontWeight: 700, color: Cn.ink, letterSpacing: -0.7, margin: 0 }}>选择出发时间</h1>
      </div>

      {/* Score card */}
      <div style={{ padding: 16 }}>
        <div style={{
          background: `linear-gradient(135deg, ${Cn.flareSoft}, ${Cn.surface})`,
          border: `0.5px solid ${Cn.line}`, borderRadius: 18, padding: 18,
          display: 'flex', alignItems: 'center', gap: 14,
        }}>
          <div style={{
            width: 64, height: 64, borderRadius: 999,
            background: Cn.surface, border: `2px solid ${Cn.flare}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexDirection: 'column',
          }}>
            <span style={{ fontSize: 22, fontWeight: 700, color: Cn.flare, letterSpacing: -1 }}>87</span>
            <span style={{ fontSize: 8, color: Cn.inkMuted, letterSpacing: 1 }}>分</span>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: Cn.ink, letterSpacing: -0.3 }}>非常适合出行</div>
            <div style={{ fontSize: 12, color: Cn.inkMuted, marginTop: 4, lineHeight: 1.5 }}>
              周六晴朗少风 · 能见度好 · 山顶 12°C · 建议 5:30 出发观日出
            </div>
          </div>
        </div>
      </div>

      {/* 3 days */}
      <div style={{ padding: '0 16px' }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: Cn.ink, marginBottom: 8, letterSpacing: -0.2 }}>未来三天</div>
        <div style={{ background: Cn.surface, borderRadius: 16, border: `0.5px solid ${Cn.line}`, overflow: 'hidden' }}>
          {[
            { d: '今天 周五', i: 'cloud', t: '14° / 6°', s: '小雨 · 山区雷阵雨', score: 42, bad: true },
            { d: '明天 周六', i: 'sun',   t: '18° / 9°', s: '晴朗 · 微风',         score: 87, sel: true },
            { d: '后天 周日', i: 'sun',   t: '17° / 7°', s: '晴 · 中午有云',       score: 78 },
          ].map((d, i) => (
            <div key={i} style={{
              padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12,
              borderBottom: i < 2 ? `0.5px solid ${Cn.line}` : 'none',
              background: d.sel ? Cn.flareSoft : 'transparent',
            }}>
              <window.Icon name={d.i} size={22} color={d.bad ? Cn.inkMuted : Cn.flare} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 500, color: Cn.ink, letterSpacing: -0.2 }}>{d.d}</div>
                <div style={{ fontSize: 11.5, color: Cn.inkMuted, marginTop: 1 }}>{d.s}</div>
              </div>
              <div style={{ fontFamily: Kn.font.mono, fontSize: 12, color: Cn.ink }}>{d.t}</div>
              <div style={{
                minWidth: 32, textAlign: 'right',
                fontSize: 13, fontWeight: 600,
                color: d.score > 70 ? Cn.flare : d.score > 50 ? Cn.diff.mod : Cn.inkDim,
              }}>{d.score}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Sun chart */}
      <div style={{ padding: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: Cn.ink, marginBottom: 8 }}>周六 · 时段建议</div>
        <div style={{ background: Cn.surface, borderRadius: 16, border: `0.5px solid ${Cn.line}`, padding: 16 }}>
          <SunChart />
          <div style={{
            display: 'flex', justifyContent: 'space-between', marginTop: 12,
            fontSize: 11, fontFamily: Kn.font.mono, color: Cn.inkMuted,
          }}>
            <span>日出 5:42</span>
            <span style={{ color: Cn.flare, fontWeight: 600 }}>建议出发 5:30</span>
            <span>日落 18:54</span>
          </div>
        </div>
      </div>

      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: 0,
        padding: '12px 16px 32px',
        background: `linear-gradient(180deg, transparent 0%, ${Cn.bg} 50%)`,
      }}>
        <button style={{
          width: '100%', height: 54, borderRadius: 16,
          background: Cn.flare, color: '#fff', border: 'none',
          fontSize: 15, fontWeight: 600, letterSpacing: -0.3,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 20px', cursor: 'pointer',
          boxShadow: `0 4px 16px ${Cn.flareSoft}`,
        }}>
          <span>下一步  ·  安全确认</span>
          <window.Icon name="forward" size={15} />
        </button>
      </div>
    </div>
  );
}

function SunChart() {
  const C = window.KAIPA_TOKENS.color;
  return (
    <svg viewBox="0 0 320 90" width="100%" height="90" preserveAspectRatio="none">
      <defs>
        <linearGradient id="sun-grad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%"   stopColor={C.terrain.water} />
          <stop offset="20%"  stopColor={C.flareSoft} />
          <stop offset="50%"  stopColor={C.flare} />
          <stop offset="80%"  stopColor={C.flareSoft} />
          <stop offset="100%" stopColor={C.terrain.water} />
        </linearGradient>
      </defs>
      <rect x="0" y="80" width="320" height="2" fill={C.line} />
      <path d="M0,80 Q160,-30 320,80 Z" fill="url(#sun-grad)" opacity="0.4" />
      <path d="M0,80 Q160,-30 320,80" fill="none" stroke={C.flare} strokeWidth="1.5" />
      <line x1="40" y1="40" x2="40" y2="80" stroke={C.flare} strokeWidth="1.5" strokeDasharray="2 3" />
      <circle cx="40" cy="40" r="5" fill={C.flare} stroke="#fff" strokeWidth="2" />
    </svg>
  );
}

// ─── Confirm step ────────────────────────────────────────────
function ScreenConfirm() {
  return (
    <div style={{ position: 'relative', height: '100%', background: Cn.bg, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 30 }}>
        <window.IOSStatusBar dark={Kn.mode === 'dark'} />
      </div>
      <div style={{ padding: '60px 16px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <window.CircleBtn icon="back" />
          <span style={{ fontSize: 12, color: Cn.inkMuted }}>第 3 步 / 共 3 步</span>
          <window.CircleBtn icon="ellipsis" />
        </div>
        <div style={{ fontSize: 12, color: Cn.inkMuted, marginBottom: 4 }}>箭扣长城  ·  周六 5:30</div>
        <h1 style={{ fontSize: 26, fontWeight: 700, color: Cn.ink, letterSpacing: -0.7, margin: 0 }}>
          安全确认
        </h1>
      </div>

      <div style={{
        position: 'absolute', top: 170, left: 0, right: 0, bottom: 100,
        overflowY: 'auto', padding: '0 16px',
      }}>
        {/* Emergency contact */}
        <SettingCard
          icon="bell" title="紧急联系人"
          right="陈芳 · 妻子"
          desc="如果你 2 小时内未确认到达，会自动短信通知。" />

        {/* ETA */}
        <SettingCard
          icon="layers2" title="预计返回时间"
          right="周六 14:30"
          desc="你预计走 5:20。我们会在超时 30 分钟后提醒。" />

        {/* Live share */}
        <ToggleCard
          icon="users" title="实时位置共享"
          on={true}
          desc="陈芳、张磊可在 App 内看到你的实时位置。出山后自动停止。" />

        {/* Offline */}
        <ToggleCard
          icon="download" title="离线地图已下载"
          on={true}
          desc="箭扣长城周边 60 km² · 32 MB · 信号差时也能定位。"
          checkmark={true} />

        {/* SOS */}
        <ToggleCard
          icon="bell" title="一键 SOS"
          on={true}
          desc="进入导航后，长按右下角红色按钮 3 秒触发 110 + 紧急联系人。"
          danger={true} />
      </div>

      {/* Final CTA */}
      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: 0,
        padding: '12px 16px 32px',
        background: `linear-gradient(180deg, transparent 0%, ${Cn.bg} 50%)`,
      }}>
        <button style={{
          width: '100%', height: 56, borderRadius: 16,
          background: Cn.flare, color: '#fff', border: 'none',
          fontSize: 16, fontWeight: 700, letterSpacing: -0.3,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          cursor: 'pointer',
          boxShadow: `0 4px 16px ${Cn.flareSoft}`,
        }}>
          <window.Icon name="navigate" size={18} />
          一切就绪  ·  开始导航
        </button>
      </div>
    </div>
  );
}

function SettingCard({ icon, title, right, desc }) {
  return (
    <div style={{
      padding: 14, borderRadius: 14,
      background: Cn.surface, border: `0.5px solid ${Cn.line}`,
      marginBottom: 10,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
        <div style={{
          width: 36, height: 36, borderRadius: 10, background: Cn.mossSoft,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <window.Icon name={icon} size={17} color={Cn.mossDeep} />
        </div>
        <div style={{ fontSize: 14.5, fontWeight: 600, color: Cn.ink, letterSpacing: -0.2, flex: 1 }}>{title}</div>
        <div style={{ fontSize: 13, color: Cn.flare, fontWeight: 500 }}>{right}</div>
      </div>
      <div style={{ fontSize: 12, color: Cn.inkMuted, lineHeight: 1.5, paddingLeft: 48 }}>{desc}</div>
    </div>
  );
}

function ToggleCard({ icon, title, on, desc, danger, checkmark }) {
  const tint = danger ? Cn.flare : Cn.mossDeep;
  const tintBg = danger ? Cn.flareSoft : Cn.mossSoft;
  return (
    <div style={{
      padding: 14, borderRadius: 14,
      background: Cn.surface, border: `0.5px solid ${danger ? Cn.flare + '50' : Cn.line}`,
      marginBottom: 10,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
        <div style={{
          width: 36, height: 36, borderRadius: 10, background: tintBg,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <window.Icon name={icon} size={17} color={tint} />
        </div>
        <div style={{ fontSize: 14.5, fontWeight: 600, color: Cn.ink, letterSpacing: -0.2, flex: 1 }}>{title}</div>
        {checkmark ? (
          <div style={{
            width: 24, height: 24, borderRadius: 999, background: Cn.flare,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <window.Icon name="check" size={12} color="#fff" strokeWidth={3} />
          </div>
        ) : (
          <div style={{
            width: 36, height: 22, borderRadius: 99,
            background: on ? Cn.flare : Cn.line,
            position: 'relative', transition: 'background .15s',
          }}>
            <div style={{
              position: 'absolute', top: 2, left: on ? 16 : 2,
              width: 18, height: 18, borderRadius: 999, background: '#fff',
              boxShadow: '0 1px 3px rgba(0,0,0,0.2)', transition: 'left .15s',
            }} />
          </div>
        )}
      </div>
      <div style={{ fontSize: 12, color: Cn.inkMuted, lineHeight: 1.5, paddingLeft: 48 }}>{desc}</div>
    </div>
  );
}

// ─── Social Feed ─────────────────────────────────────────────
function ScreenFeed() {
  const posts = [
    {
      who: 'Sara K.', time: '2 小时前', loc: '海坨山纵走',
      text: '今天的雾凇绝了！山顶风很大但值得 ❄️',
      km: 18.1, up: 1240, dur: '8:42', diff: 'expert', seed: 2, likes: 47, comments: 12,
    },
    {
      who: '张磊', time: '昨天', loc: '云蒙山主峰',
      text: '带儿子第一次徒步，T2 难度刚刚好。山顶云海超治愈。',
      km: 7.3, up: 620, dur: '4:15', diff: 'mod', seed: 1, likes: 23, comments: 5,
    },
    {
      who: 'Lin M.', time: '3 天前', loc: '十三陵水库环线',
      text: '春天的绿。水库旁开了大片二月兰，下次想夜爬试试。',
      km: 14.2, up: 480, dur: '4:35', diff: 'easy', seed: 3, likes: 89, comments: 18,
    },
  ];

  return (
    <div style={{ position: 'relative', height: '100%', background: Cn.bg, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 30 }}>
        <window.IOSStatusBar dark={Kn.mode === 'dark'} />
      </div>

      {/* Header */}
      <div style={{
        padding: '54px 16px 12px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: Cn.bg, position: 'relative', zIndex: 5,
      }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, color: Cn.ink, margin: 0, letterSpacing: -0.7 }}>动态</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <window.CircleBtn icon="search" size={36} iconSize={15} />
          <window.CircleBtn icon="plus" size={36} iconSize={15} />
        </div>
      </div>

      {/* Story row */}
      <div style={{
        display: 'flex', gap: 10, overflowX: 'auto',
        padding: '0 16px 12px', borderBottom: `0.5px solid ${Cn.line}`,
      }}>
        {['你', 'Sara', '张磊', 'Lin', 'Wei', 'Bo'].map((n, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            <div style={{
              width: 56, height: 56, borderRadius: 999,
              background: i === 0 ? 'transparent' : `linear-gradient(135deg, ${Cn.flare}, ${Cn.mossDeep})`,
              padding: 2, border: i === 0 ? `1.5px dashed ${Cn.line}` : 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <div style={{
                width: '100%', height: '100%', borderRadius: 999,
                background: Cn.surface,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                border: i !== 0 ? `2px solid ${Cn.bg}` : 'none',
                color: Cn.ink, fontSize: 18, fontWeight: 600,
              }}>
                {i === 0 ? <window.Icon name="plus" size={18} color={Cn.inkMuted} /> : n[0]}
              </div>
            </div>
            <span style={{ fontSize: 10.5, color: Cn.inkMuted, letterSpacing: -0.1 }}>{n}</span>
          </div>
        ))}
      </div>

      {/* Posts */}
      <div style={{
        position: 'absolute', top: 175, left: 0, right: 0, bottom: 0,
        overflowY: 'auto', padding: '12px 16px 32px',
      }}>
        {posts.map((p, i) => (
          <div key={i} style={{
            background: Cn.surface, borderRadius: 16,
            border: `0.5px solid ${Cn.line}`, marginBottom: 12, overflow: 'hidden',
          }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 14 }}>
              <div style={{
                width: 38, height: 38, borderRadius: 999,
                background: `linear-gradient(135deg, ${Cn.flare}, ${Cn.mossDeep})`,
                color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 14, fontWeight: 600,
              }}>{p.who[0]}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: Cn.ink, letterSpacing: -0.2 }}>{p.who}</div>
                <div style={{ fontSize: 11, color: Cn.inkMuted, marginTop: 1 }}>
                  <window.Icon name="navigate" size={9} color={Cn.flare} /> {p.loc} · {p.time}
                </div>
              </div>
              <window.Icon name="ellipsis" size={16} color={Cn.inkMuted} />
            </div>

            {/* Map preview */}
            <div style={{ position: 'relative', height: 180 }}>
              <MiniMap seed={p.seed} h={180} dark={Kn.mode === 'dark'} />
              <div style={{
                position: 'absolute', bottom: 10, left: 10,
                background: Cn.glass, backdropFilter: 'blur(20px)',
                borderRadius: 10, padding: '6px 10px',
                display: 'flex', gap: 10,
                fontSize: 11, fontFamily: Kn.font.mono, color: Cn.ink,
              }}>
                <span>{p.km}km</span>
                <span>↑{p.up}m</span>
                <span>{p.dur}</span>
              </div>
            </div>

            {/* Text */}
            <div style={{ padding: '12px 14px 4px', fontSize: 13.5, color: Cn.ink, lineHeight: 1.5 }}>{p.text}</div>

            {/* Actions */}
            <div style={{
              padding: '10px 14px 14px', display: 'flex', alignItems: 'center', gap: 18,
              fontSize: 12.5, color: Cn.inkMuted,
            }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <window.Icon name="heart" size={15} color={Cn.flare} /> {p.likes}
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <window.Icon name="chat" size={15} color={Cn.inkMuted} /> {p.comments}
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <window.Icon name="share" size={15} color={Cn.inkMuted} />
              </span>
              <span style={{ flex: 1 }} />
              <span style={{ fontSize: 11.5, color: Cn.flare, fontWeight: 500 }}>查看路线 →</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Profile Plus (footprint map + yearly card) ──────────────
function ScreenProfilePlus() {
  return (
    <div style={{ position: 'relative', height: '100%', background: Cn.bg, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 30 }}>
        <window.IOSStatusBar dark={Kn.mode === 'dark'} />
      </div>
      <div style={{ padding: '60px 16px 32px', height: '100%', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
          <div style={{
            width: 60, height: 60, borderRadius: 999,
            background: `linear-gradient(135deg, ${Cn.flare}, ${Cn.mossDeep})`,
            color: '#fff', fontSize: 22, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>陈</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: Cn.ink, letterSpacing: -0.6 }}>陈明</div>
            <div style={{ fontSize: 12, color: Cn.inkMuted, marginTop: 2 }}>北京 · Lv.4 探索者</div>
          </div>
          <window.CircleBtn icon="ellipsis" size={36} iconSize={15} />
        </div>

        {/* Footprint map */}
        <div style={{
          fontSize: 13, fontWeight: 600, color: Cn.ink, marginBottom: 8, letterSpacing: -0.2,
          display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
        }}>
          <span>足迹地图</span>
          <span style={{ fontSize: 11, color: Cn.inkMuted }}>23 条路线</span>
        </div>
        <div style={{
          height: 180, borderRadius: 16, overflow: 'hidden',
          border: `0.5px solid ${Cn.line}`, position: 'relative',
        }}>
          <FootprintMap />
        </div>

        {/* Yearly Wrapped */}
        <div style={{ marginTop: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: Cn.ink, marginBottom: 8, letterSpacing: -0.2 }}>
            2026 春季回顾
          </div>
          <div style={{
            position: 'relative', borderRadius: 18, overflow: 'hidden', padding: 20,
            background: `linear-gradient(135deg, ${Cn.flareDeep || Cn.flare}, ${Cn.flare} 60%, ${Cn.mossDeep})`,
            color: '#fff',
          }}>
            <div style={{
              fontSize: 10, fontFamily: Kn.font.mono, opacity: 0.7, letterSpacing: 2, marginBottom: 6,
            }}>SPRING WRAPPED · 2026</div>
            <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: -0.5, lineHeight: 1.2, marginBottom: 14 }}>
              你走过 287 公里，<br />爬升相当于一座富士山。
            </div>
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8,
              padding: '14px 0 0', borderTop: '0.5px solid rgba(255,255,255,0.25)',
            }}>
              <div>
                <div style={{ fontSize: 22, fontWeight: 700, fontFamily: Kn.font.sans, lineHeight: 1 }}>23</div>
                <div style={{ fontSize: 10, opacity: 0.75, marginTop: 4 }}>条路线</div>
              </div>
              <div>
                <div style={{ fontSize: 22, fontWeight: 700, lineHeight: 1 }}>14.2k</div>
                <div style={{ fontSize: 10, opacity: 0.75, marginTop: 4 }}>米爬升</div>
              </div>
              <div>
                <div style={{ fontSize: 22, fontWeight: 700, lineHeight: 1 }}>2486</div>
                <div style={{ fontSize: 10, opacity: 0.75, marginTop: 4 }}>米最高</div>
              </div>
            </div>
            <button style={{
              marginTop: 14, padding: '8px 14px', borderRadius: 99,
              background: 'rgba(255,255,255,0.2)', color: '#fff', border: 'none',
              fontSize: 12, fontWeight: 500, cursor: 'pointer',
              backdropFilter: 'blur(10px)',
            }}>分享卡片  ↗</button>
          </div>
        </div>

        {/* Stats grid */}
        <div style={{ marginTop: 18, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {[
            { l: '最高海拔', v: '2486', u: 'm', s: '海坨山 · 3月' },
            { l: '最长一日', v: '23.4', u: 'km', s: '海坨纵走 · 3月' },
            { l: '最早出发', v: '04:12', s: '香山日出 · 5月' },
            { l: '收获徽章', v: '6',     s: '冬季登顶 +1' },
          ].map((c, i) => (
            <div key={i} style={{
              padding: 14, borderRadius: 14,
              background: Cn.surface, border: `0.5px solid ${Cn.line}`,
            }}>
              <div style={{ fontSize: 11, color: Cn.inkMuted, letterSpacing: -0.1 }}>{c.l}</div>
              <div style={{
                fontSize: 22, fontWeight: 700, color: Cn.ink, marginTop: 4, letterSpacing: -0.5,
                fontFamily: Kn.font.sans,
              }}>
                {c.v}{c.u && <span style={{ fontSize: 12, color: Cn.inkDim, marginLeft: 2, fontWeight: 500 }}>{c.u}</span>}
              </div>
              <div style={{ fontSize: 10.5, color: Cn.inkMuted, marginTop: 4, fontFamily: Kn.font.mono }}>{c.s}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function FootprintMap() {
  const C = window.KAIPA_TOKENS.color;
  const tracks = [
    'M40,140 Q70,80 110,90 T180,40',
    'M50,80 Q90,60 130,100 T200,130',
    'M30,160 Q60,140 90,150 Q120,160 150,140',
    'M150,30 Q180,60 200,50 Q230,40 260,80',
    'M210,170 Q240,120 280,130',
    'M80,170 L120,170',
  ];
  return (
    <svg viewBox="0 0 320 180" width="100%" height="100%" preserveAspectRatio="none">
      <rect width="320" height="180" fill={C.terrain.lowland} />
      {[20, 40, 60, 80, 100, 120, 140, 160].map(y => (
        <line key={y} x1="0" y1={y} x2="320" y2={y}
              stroke={C.terrain.contour} strokeWidth="0.4" />
      ))}
      <path d="M0,140 Q80,100 160,120 T320,90 L320,180 L0,180 Z"
            fill={C.terrain.ridge} opacity="0.4" />
      <path d="M0,160 Q100,130 200,145 T320,150 L320,180 L0,180 Z"
            fill={C.terrain.peak} opacity="0.3" />
      {tracks.map((d, i) => (
        <path key={i} d={d} fill="none"
              stroke={C.flare} strokeWidth="2" strokeLinecap="round" opacity="0.85" />
      ))}
      {[
        [40, 140], [180, 40], [200, 130], [150, 140], [260, 80], [280, 130], [120, 170],
      ].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="3" fill={C.flare} stroke="#fff" strokeWidth="1.2" />
      ))}
      <text x="280" y="20" fontSize="9" fill={C.inkMuted}
            fontFamily={C.font?.mono || 'monospace'}
            textAnchor="end" letterSpacing="1">
        北京 · 周边
      </text>
    </svg>
  );
}

window.ScreenSearch = ScreenSearch;
window.ScreenWeather = ScreenWeather;
window.ScreenConfirm = ScreenConfirm;
window.ScreenFeed = ScreenFeed;
window.ScreenProfilePlus = ScreenProfilePlus;
window.MiniMap = MiniMap;

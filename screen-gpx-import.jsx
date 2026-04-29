// GPX 导入流程 — 3 步：上传 → 解析预览 → 命名保存
const _Kg = () => window.KAIPA_TOKENS;
const _Cg = () => window.KAIPA_TOKENS.color;
const Kg = new Proxy({}, { get: (_, p) => _Kg()[p] });
const Cg = new Proxy({}, { get: (_, p) => _Cg()[p] });

// ── 顶部 chrome：返回 + 标题 + 步骤指示 ───────────────────
function GPXHeader({ step, onBack }) {
  return (
    <div style={{
      paddingTop: 56, padding: '56px 16px 12px',
      background: Cg.surface,
      borderBottom: `0.5px solid ${Cg.line}`,
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14,
      }}>
        <button onClick={onBack} style={{
          width: 36, height: 36, borderRadius: 999, border: 'none',
          background: Cg.surfaceHi, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <window.Icon name="chevronLeft" size={16} color={Cg.ink} />
        </button>
        <div style={{ flex: 1 }}>
          <div style={{
            fontSize: 17, fontWeight: 700, color: Cg.ink, letterSpacing: -0.4,
            fontFamily: Kg.font.sans,
          }}>导入 GPX 路线</div>
          <div style={{ fontSize: 11, color: Cg.inkMuted, marginTop: 2, letterSpacing: -0.1 }}>
            从手表、佳明 Connect、两步路、Strava 等
          </div>
        </div>
      </div>

      {/* 步骤指示 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {['上传文件', '预览校验', '命名保存'].map((label, i) => {
          const done = i < step, current = i === step;
          return (
            <React.Fragment key={i}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: '0 0 auto' }}>
                <div style={{
                  width: 22, height: 22, borderRadius: 999,
                  background: done ? Cg.flare : (current ? Cg.flareSoft : Cg.surfaceHi),
                  border: current ? `1.5px solid ${Cg.flare}` : 'none',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 700,
                  color: done ? '#fff' : (current ? Cg.flare : Cg.inkDim),
                }}>
                  {done ? <window.Icon name="check" size={11} color="#fff" /> : i + 1}
                </div>
                <span style={{
                  fontSize: 12, fontWeight: current ? 600 : 400,
                  color: current ? Cg.ink : (done ? Cg.flare : Cg.inkMuted),
                  letterSpacing: -0.1,
                }}>{label}</span>
              </div>
              {i < 2 && (
                <div style={{
                  flex: 1, height: 1, background: i < step ? Cg.flare : Cg.line,
                }} />
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}

// ── Step 1：上传 ─────────────────────────────────
function GPXStep1() {
  const sources = [
    { icon: 'cloud',    name: '佳明 Connect',  hint: '已连接 · 23 条新轨迹' },
    { icon: 'phone',    name: '从本机文件',     hint: 'iCloud · 文件夹' },
    { icon: 'download', name: '两步路 / 户外助手', hint: '粘贴分享链接' },
    { icon: 'globe',    name: 'Strava',       hint: '未连接' },
  ];

  return (
    <div style={{ padding: '20px 16px 100px', background: Cg.bg, minHeight: '100%' }}>
      {/* 拖放区 */}
      <div style={{
        height: 180, borderRadius: 20,
        border: `1.5px dashed ${Cg.flare}`,
        background: Cg.flareSoft,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        gap: 10, marginBottom: 24,
      }}>
        <div style={{
          width: 56, height: 56, borderRadius: 999,
          background: Cg.surface,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 4px 12px rgba(40,30,20,0.08)',
        }}>
          <window.Icon name="upload" size={22} color={Cg.flare} />
        </div>
        <div style={{ fontSize: 15, fontWeight: 600, color: Cg.ink, letterSpacing: -0.3 }}>
          拖入或选择 .gpx 文件
        </div>
        <div style={{ fontSize: 11, color: Cg.inkMuted, letterSpacing: -0.1 }}>
          支持 .gpx · .tcx · .fit · .kml
        </div>
      </div>

      <div style={{
        fontSize: 11, fontWeight: 600, color: Cg.inkMuted,
        textTransform: 'uppercase', letterSpacing: 0.5,
        marginBottom: 10, paddingLeft: 4,
      }}>
        或从这些来源导入
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {sources.map((s, i) => (
          <button key={i} style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '14px 14px',
            background: Cg.surface,
            border: `0.5px solid ${Cg.line}`,
            borderRadius: 14, cursor: 'pointer', textAlign: 'left',
          }}>
            <div style={{
              width: 38, height: 38, borderRadius: 10,
              background: Cg.surfaceHi,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <window.Icon name={s.icon} size={18} color={Cg.ink} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: Cg.ink, letterSpacing: -0.2 }}>
                {s.name}
              </div>
              <div style={{ fontSize: 11, color: Cg.inkMuted, marginTop: 2, letterSpacing: -0.1 }}>
                {s.hint}
              </div>
            </div>
            <window.Icon name="chevronRight" size={14} color={Cg.inkDim} />
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Step 2：解析预览 ─────────────────────────────────
function GPXStep2() {
  // 模拟一个海拔剖面 SVG
  const profile = [120, 145, 180, 210, 260, 320, 380, 420, 460, 490, 510, 540, 560, 580, 600, 620, 640, 670, 700, 720, 740, 760, 770, 760, 730, 690, 640, 580, 510, 450, 400, 360, 340, 320, 310, 300];
  const w = 340, h = 86, max = 800, min = 100;
  const pts = profile.map((v, i) => {
    const x = (i / (profile.length - 1)) * w;
    const y = h - ((v - min) / (max - min)) * h;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  const area = `0,${h} ${pts} ${w},${h}`;

  // 缩略地图轨迹（一条曲折线）
  const trackPath = "M30,140 Q60,80 100,90 T160,110 Q200,130 220,90 T280,60 Q310,40 330,70";

  return (
    <div style={{ padding: '16px 16px 100px', background: Cg.bg, minHeight: '100%' }}>
      {/* 文件信息 bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '12px 14px', background: Cg.surface,
        border: `0.5px solid ${Cg.line}`, borderRadius: 12, marginBottom: 14,
      }}>
        <div style={{
          width: 32, height: 32, borderRadius: 8,
          background: Cg.flareSoft,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <span style={{ fontSize: 9, fontWeight: 800, color: Cg.flare, letterSpacing: 0.3 }}>GPX</span>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 13, fontWeight: 600, color: Cg.ink, letterSpacing: -0.2,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>activity_14820731.gpx</div>
          <div style={{ fontSize: 11, color: Cg.inkMuted, letterSpacing: -0.1 }}>
            247 KB · 2,341 个轨迹点
          </div>
        </div>
        <div style={{
          padding: '4px 8px', borderRadius: 999,
          background: '#E8F4EA', color: Cg.moss,
          fontSize: 10, fontWeight: 700, letterSpacing: 0.3,
        }}>
          已识别
        </div>
      </div>

      {/* 地图缩略 */}
      <div style={{
        height: 180, background: '#E5DDD0', borderRadius: 16,
        border: `0.5px solid ${Cg.line}`, marginBottom: 14,
        position: 'relative', overflow: 'hidden',
      }}>
        {/* 等高线纹理 */}
        <svg viewBox="0 0 360 180" width="100%" height="100%" style={{ display: 'block' }}>
          <defs>
            <pattern id="contour" width="24" height="24" patternUnits="userSpaceOnUse">
              <path d="M0,12 Q12,4 24,12" stroke="rgba(120,100,72,0.15)" fill="none" strokeWidth="0.5"/>
            </pattern>
          </defs>
          <rect width="360" height="180" fill="url(#contour)"/>
          {/* 轨迹 */}
          <path d={trackPath} stroke={Cg.flare} strokeWidth="3" fill="none" strokeLinecap="round"/>
          <path d={trackPath} stroke={Cg.flare} strokeWidth="6" fill="none" strokeLinecap="round" opacity="0.18"/>
          {/* 起终点 */}
          <circle cx="30" cy="140" r="6" fill={Cg.moss} stroke="#fff" strokeWidth="2"/>
          <circle cx="330" cy="70" r="6" fill={Cg.flare} stroke="#fff" strokeWidth="2"/>
          <text x="40" y="155" fontSize="10" fontWeight="600" fill={Cg.ink}>起点</text>
          <text x="298" y="60" fontSize="10" fontWeight="600" fill={Cg.ink}>终点</text>
        </svg>
        <div style={{
          position: 'absolute', top: 10, right: 10,
          padding: '5px 10px', borderRadius: 999,
          background: 'rgba(255,255,255,0.92)', fontSize: 10,
          color: Cg.ink, fontWeight: 600, letterSpacing: -0.1,
          border: `0.5px solid ${Cg.line}`,
        }}>
          GCJ-02 · 已纠偏
        </div>
      </div>

      {/* 数据概览 */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 14,
      }}>
        {[
          { v: '11.4', u: 'km', l: '总距离' },
          { v: '+820', u: 'm',  l: '累计爬升' },
          { v: '4:32', u: '',   l: '运动时长' },
          { v: '2.5',  u: 'km/h', l: '均速' },
        ].map((s, i) => (
          <div key={i} style={{
            padding: '10px 8px', background: Cg.surface,
            border: `0.5px solid ${Cg.line}`, borderRadius: 10,
          }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 2 }}>
              <span style={{ fontSize: 16, fontWeight: 700, color: Cg.ink, letterSpacing: -0.5, fontFamily: Kg.font.sans }}>{s.v}</span>
              <span style={{ fontSize: 9, color: Cg.inkMuted, letterSpacing: -0.1 }}>{s.u}</span>
            </div>
            <div style={{ fontSize: 10, color: Cg.inkMuted, marginTop: 2, letterSpacing: -0.1 }}>{s.l}</div>
          </div>
        ))}
      </div>

      {/* 海拔剖面 */}
      <div style={{
        background: Cg.surface, border: `0.5px solid ${Cg.line}`,
        borderRadius: 14, padding: 12, marginBottom: 14,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: Cg.ink, letterSpacing: -0.2 }}>海拔剖面</span>
          <span style={{ fontSize: 10, color: Cg.inkMuted, letterSpacing: -0.1 }}>120 → 770m</span>
        </div>
        <svg viewBox={`0 0 ${w} ${h + 16}`} width="100%" height={h + 16} style={{ display: 'block' }}>
          <defs>
            <linearGradient id="elev" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={Cg.flare} stopOpacity="0.35"/>
              <stop offset="100%" stopColor={Cg.flare} stopOpacity="0"/>
            </linearGradient>
          </defs>
          <polygon points={area} fill="url(#elev)"/>
          <polyline points={pts} stroke={Cg.flare} strokeWidth="1.5" fill="none"/>
          {/* 顶峰标记 */}
          <circle cx={(22 / (profile.length - 1)) * w} cy={h - ((770 - min) / (max - min)) * h} r="3" fill={Cg.flare} stroke="#fff" strokeWidth="1"/>
        </svg>
      </div>

      {/* 校验项 */}
      <div style={{
        background: Cg.surface, border: `0.5px solid ${Cg.line}`, borderRadius: 14,
        overflow: 'hidden',
      }}>
        {[
          { ok: true,  label: '坐标系自动转换', sub: 'WGS-84 → GCJ-02' },
          { ok: true,  label: '去除 GPS 漂移点', sub: '剔除 23 个异常点' },
          { ok: true,  label: '路线自动闭合检测', sub: '识别为单程往返' },
          { ok: false, label: '尾段信号丢失', sub: '最后 0.4km 用直线连接，可手动调整' },
        ].map((c, i, arr) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '11px 12px',
            borderBottom: i < arr.length - 1 ? `0.5px solid ${Cg.lineSoft}` : 'none',
          }}>
            <div style={{
              width: 22, height: 22, borderRadius: 999,
              background: c.ok ? '#E8F4EA' : '#FEF1E2',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <window.Icon name={c.ok ? 'check' : 'alert'} size={11} color={c.ok ? Cg.moss : Cg.flare} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12.5, fontWeight: 500, color: Cg.ink, letterSpacing: -0.2 }}>
                {c.label}
              </div>
              <div style={{ fontSize: 10.5, color: Cg.inkMuted, marginTop: 1, letterSpacing: -0.1 }}>
                {c.sub}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Step 3：命名保存 ─────────────────────────────────
function GPXStep3() {
  return (
    <div style={{ padding: '20px 16px 100px', background: Cg.bg, minHeight: '100%' }}>
      {/* 路线名 */}
      <Field label="路线名">
        <input defaultValue="箭扣长城 · 北京结—正北楼"
               style={{
                 width: '100%', padding: '12px 14px',
                 fontSize: 15, color: Cg.ink, fontWeight: 500,
                 background: Cg.surface, border: `0.5px solid ${Cg.line}`,
                 borderRadius: 12, outline: 'none',
                 fontFamily: Kg.font.sans, letterSpacing: -0.2,
               }} />
      </Field>

      {/* 区域 */}
      <Field label="所在区域">
        <button style={{
          width: '100%', padding: '12px 14px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: Cg.surface, border: `0.5px solid ${Cg.line}`,
          borderRadius: 12, cursor: 'pointer',
          fontSize: 14, color: Cg.ink, letterSpacing: -0.2,
        }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <window.Icon name="navigate" size={13} color={Cg.flare} />
            北京 · 怀柔区
          </span>
          <window.Icon name="chevronRight" size={13} color={Cg.inkDim} />
        </button>
      </Field>

      {/* 类型 */}
      <Field label="路线类型">
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {['徒步', '登山', '越野跑', '骑行', '溯溪'].map((t, i) => (
            <button key={i} style={{
              padding: '8px 14px', borderRadius: 999,
              background: i === 0 ? Cg.flare : Cg.surface,
              border: i === 0 ? 'none' : `0.5px solid ${Cg.line}`,
              color: i === 0 ? '#fff' : Cg.ink,
              fontSize: 12.5, fontWeight: 500, cursor: 'pointer', letterSpacing: -0.1,
            }}>{t}</button>
          ))}
        </div>
      </Field>

      {/* 难度 */}
      <Field label="难度等级（自动评估）">
        <div style={{
          padding: '14px', background: Cg.surface,
          border: `0.5px solid ${Cg.line}`, borderRadius: 12,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
            <div style={{
              padding: '4px 10px', borderRadius: 999,
              background: Cg.diff.mod, color: '#fff',
              fontSize: 11, fontWeight: 700, letterSpacing: 0.3,
            }}>T2 · 中等</div>
            <span style={{ fontSize: 11, color: Cg.inkMuted, letterSpacing: -0.1 }}>
              基于距离 + 爬升 + 坡度自动评估
            </span>
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            {['T1', 'T2', 'T3', 'T4', 'T5'].map((t, i) => (
              <div key={i} style={{
                flex: 1, height: 4, borderRadius: 2,
                background: i <= 1 ? Cg.flare : Cg.surfaceHi,
              }} />
            ))}
          </div>
        </div>
      </Field>

      {/* 隐私 */}
      <Field label="可见性">
        <div style={{
          background: Cg.surface, border: `0.5px solid ${Cg.line}`,
          borderRadius: 12, overflow: 'hidden',
        }}>
          {[
            { icon: 'lock',  name: '仅自己',     desc: '只有你能看到', selected: false },
            { icon: 'users', name: '好友可见',   desc: '关注你的人能看', selected: true  },
            { icon: 'globe', name: '公开',       desc: '出现在区域路线库（可获积分）', selected: false },
          ].map((o, i, arr) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '12px 14px',
              borderBottom: i < arr.length - 1 ? `0.5px solid ${Cg.lineSoft}` : 'none',
              background: o.selected ? Cg.flareSoft : 'transparent',
            }}>
              <window.Icon name={o.icon} size={16} color={o.selected ? Cg.flare : Cg.ink} />
              <div style={{ flex: 1 }}>
                <div style={{
                  fontSize: 13.5, fontWeight: o.selected ? 600 : 500, color: Cg.ink, letterSpacing: -0.2,
                }}>{o.name}</div>
                <div style={{ fontSize: 10.5, color: Cg.inkMuted, marginTop: 1, letterSpacing: -0.1 }}>
                  {o.desc}
                </div>
              </div>
              <div style={{
                width: 18, height: 18, borderRadius: 999,
                border: `1.5px solid ${o.selected ? Cg.flare : Cg.line}`,
                background: o.selected ? Cg.flare : 'transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {o.selected && <window.Icon name="check" size={10} color="#fff" />}
              </div>
            </div>
          ))}
        </div>
      </Field>

      {/* 备注 */}
      <Field label="补充信息（可选）">
        <textarea
          placeholder="路况、补给点、注意事项…"
          defaultValue="北京结到正北楼一段，注意鹰飞倒仰处需要手脚并用，雨天慎行。"
          style={{
            width: '100%', padding: '12px 14px',
            minHeight: 76, resize: 'none',
            fontSize: 13, color: Cg.ink, lineHeight: 1.5,
            background: Cg.surface, border: `0.5px solid ${Cg.line}`,
            borderRadius: 12, outline: 'none',
            fontFamily: Kg.font.sans, letterSpacing: -0.1,
          }} />
      </Field>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{
        fontSize: 11, fontWeight: 600, color: Cg.inkMuted,
        textTransform: 'uppercase', letterSpacing: 0.5,
        marginBottom: 8, paddingLeft: 4,
      }}>{label}</div>
      {children}
    </div>
  );
}

// ── 底部 CTA ─────────────────────────────────
function GPXFooter({ step }) {
  const labels = ['选择文件', '继续', '保存路线'];
  return (
    <div style={{
      position: 'absolute', bottom: 0, left: 0, right: 0,
      padding: '12px 16px 28px',
      background: `linear-gradient(to top, ${Cg.bg} 60%, transparent)`,
      display: 'flex', gap: 8,
    }}>
      {step > 0 && (
        <button style={{
          padding: '0 18px', height: 50, borderRadius: 14,
          background: Cg.surface, border: `0.5px solid ${Cg.line}`,
          color: Cg.ink, fontSize: 14, fontWeight: 500, cursor: 'pointer',
          letterSpacing: -0.2,
        }}>上一步</button>
      )}
      <button style={{
        flex: 1, height: 50, borderRadius: 14, border: 'none',
        background: Cg.flare, color: '#fff',
        fontSize: 15, fontWeight: 600, cursor: 'pointer',
        letterSpacing: -0.2, boxShadow: '0 4px 12px rgba(216,99,49,0.25)',
      }}>{labels[step]}{step < 2 ? ' →' : ''}</button>
    </div>
  );
}

// ── 主组件 ─────────────────────────────────
function ScreenGPXImport({ step = 0 }) {
  return (
    <div style={{
      width: '100%', height: '100%',
      background: Cg.bg, position: 'relative', overflow: 'hidden',
      fontFamily: Kg.font.sans,
    }}>
      <GPXHeader step={step} />
      <div style={{
        position: 'absolute', top: 156, bottom: 0, left: 0, right: 0,
        overflow: 'hidden',
      }}>
        {step === 0 && <GPXStep1 />}
        {step === 1 && <GPXStep2 />}
        {step === 2 && <GPXStep3 />}
      </div>
      <GPXFooter step={step} />
    </div>
  );
}

window.ScreenGPXImport = ScreenGPXImport;

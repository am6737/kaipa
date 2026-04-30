// Kaipa other screens v2 — light Apple aesthetic
const Ko = new Proxy({}, { get: (_, p) => window.KAIPA_TOKENS[p] });
const Co = new Proxy({}, { get: (_, p) => window.KAIPA_TOKENS.color[p] });

// ─── Gear pick (3) ────────────────────────────────────────────
// 路线情境 — AI 与警告系统都基于这里推理
const TRIP_CTX = {
  routeName: '箭扣长城',
  diff: 'T3',
  km: 11.4,
  days: 1,             // 单日
  nightLow: 4,         // 夜间最低 4°C
  windPeak: 7,         // 阵风 7 级
  altMax: 942,
  hasWaterSrc: false,  // 全程无补水点
};

function AISmartPackCard({ aiState, onApply, onUndo, onShowWhy }) {
  // aiState: 'idle' | 'analyzing' | 'applied'
  return (
    <div style={{
      marginTop: 12, borderRadius: 18, overflow: 'hidden',
      background: aiState === 'applied'
        ? `linear-gradient(135deg, ${Co.mossSoft}, ${Co.surface} 70%)`
        : `linear-gradient(135deg, ${Co.flareSoft}, ${Co.surface} 70%)`,
      border: `0.5px solid ${aiState === 'applied' ? Co.mossDeep + '40' : Co.flare + '30'}`,
      position: 'relative',
      transition: 'background .3s, border-color .3s',
    }}>
      {/* Decorative rays */}
      <svg width="100%" height="60" viewBox="0 0 360 60"
           style={{ position: 'absolute', top: 0, left: 0, opacity: 0.3, pointerEvents: 'none' }}>
        <defs>
          <radialGradient id="ai-glow" cx="0.85" cy="0.2" r="0.6">
            <stop offset="0%"  stopColor={Co.flare} stopOpacity="0.4" />
            <stop offset="100%" stopColor={Co.flare} stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect width="360" height="60" fill="url(#ai-glow)" />
      </svg>

      <div style={{ padding: '14px 14px 12px', position: 'relative' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 10,
            background: Co.flare,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: `0 4px 10px ${Co.flare}55`,
          }}>
            <SparkleIcon />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{
              fontSize: 13, fontWeight: 700, color: Co.ink, letterSpacing: -0.2,
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              AI 智能搭配
              <span style={{
                fontSize: 9, fontWeight: 600, letterSpacing: 0.5,
                color: aiState === 'applied' ? Co.mossDeep : Co.flare,
                background: '#fff',
                padding: '1.5px 5px', borderRadius: 99,
                border: `0.5px solid ${(aiState === 'applied' ? Co.mossDeep : Co.flare) + '40'}`,
              }}>{aiState === 'analyzing' ? '分析中…' : aiState === 'applied' ? '已应用' : 'BETA'}</span>
            </div>
            <div style={{ fontSize: 10.5, color: Co.inkMuted, marginTop: 1 }}>
              {aiState === 'analyzing'
                ? '正在读取路线 / 天气 / 装备库…'
                : aiState === 'applied'
                ? '已为你勾选 7 件 + 标出 2 件需补'
                : '基于路线 + 天气 + 你的装备库'}
            </div>
          </div>
          {aiState === 'analyzing' && (
            <div style={{
              width: 16, height: 16, borderRadius: 999,
              border: `2px solid ${Co.flare}30`, borderTopColor: Co.flare,
              animation: 'kaipa-spin 0.8s linear infinite',
            }} />
          )}
        </div>

        {/* Reasoning bullets — content varies by state */}
        <div style={{
          fontSize: 12, color: Co.ink, lineHeight: 1.55, letterSpacing: -0.1,
          paddingLeft: 2,
        }}>
          {aiState === 'idle' && (
            <ReasoningRow tone="ok">
              点下方按钮，AI 会读取路线 + 天气 + 你的装备库，自动勾选最合适的搭配
            </ReasoningRow>
          )}
          {aiState === 'analyzing' && (
            <>
              <ShimmerRow />
              <ShimmerRow w={180} />
              <ShimmerRow w={210} />
            </>
          )}
          {aiState === 'applied' && (
            <>
              <ReasoningRow tone="ok">
                <b>T3 · 野长城</b>  ·  已选高帮越野鞋 + 硬壳冲锋衣
              </ReasoningRow>
              <ReasoningRow tone="warn">
                夜间最低 4°C  ·  已加保暖中层；阵风 7 级  ·  加防风镜
              </ReasoningRow>
              <ReasoningRow tone="alert">
                装备库缺 <b>急救包</b> 与 <b>防水袋 5L</b>  ·  下方可借/购
              </ReasoningRow>
            </>
          )}
        </div>

        {aiState === 'applied' && (
          <div style={{
            marginTop: 10, paddingTop: 10, borderTop: `0.5px dashed ${Co.line}`,
            display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8,
          }}>
            <MiniMetric label="目标包重" value="6.2" unit="kg" />
            <MiniMetric label="预计能耗" value="2,840" unit="kcal" />
            <MiniMetric label="日落时间" value="18:42" />
            <MiniMetric label="海拔最高" value="942" unit="m" />
          </div>
        )}

        {/* Action row */}
        <div style={{
          display: 'flex', gap: 8, marginTop: 12,
        }}>
          {aiState === 'applied' ? (
            <>
              <button onClick={onUndo} style={{
                flex: 1, height: 40, borderRadius: 12,
                background: '#fff', color: Co.ink, border: `0.5px solid ${Co.line}`,
                fontSize: 12.5, fontWeight: 500, letterSpacing: -0.2, cursor: 'pointer',
              }}>撤销 AI 搭配</button>
              <button onClick={onShowWhy} style={{
                height: 40, padding: '0 14px', borderRadius: 12,
                background: Co.mossSoft, color: Co.mossDeep, border: 'none',
                fontSize: 12.5, fontWeight: 600, letterSpacing: -0.2, cursor: 'pointer',
              }}>为什么？</button>
            </>
          ) : (
            <>
              <button onClick={onApply} disabled={aiState === 'analyzing'} style={{
                flex: 1, height: 40, borderRadius: 12,
                background: Co.flare, color: '#fff', border: 'none',
                fontSize: 12.5, fontWeight: 600, letterSpacing: -0.2,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                boxShadow: `0 3px 10px ${Co.flare}40`,
                cursor: aiState === 'analyzing' ? 'wait' : 'pointer',
                opacity: aiState === 'analyzing' ? 0.7 : 1,
              }}>
                <SparkleIcon size={11} />
                {aiState === 'analyzing' ? '分析中…' : '一键智能搭配'}
              </button>
              <button onClick={onShowWhy} style={{
                height: 40, padding: '0 14px', borderRadius: 12,
                background: '#fff', color: Co.ink, border: `0.5px solid ${Co.line}`,
                fontSize: 12.5, fontWeight: 500, letterSpacing: -0.2, cursor: 'pointer',
              }}>手动选</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ShimmerRow({ w = 240 }) {
  return (
    <div style={{ padding: '4px 0' }}>
      <div style={{
        height: 10, width: w, maxWidth: '100%', borderRadius: 4,
        background: `linear-gradient(90deg, ${Co.lineSoft}, ${Co.line}, ${Co.lineSoft})`,
        backgroundSize: '200% 100%',
        animation: 'kaipa-shimmer 1.4s ease-in-out infinite',
      }} />
    </div>
  );
}

function SparkleIcon({ size = 14, color = '#fff' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none">
      <path d="M7 1.5 L8.2 5.5 L12 7 L8.2 8.5 L7 12.5 L5.8 8.5 L2 7 L5.8 5.5 Z" fill={color} />
      <circle cx="11.5" cy="2.8" r="0.8" fill={color} opacity="0.7" />
      <circle cx="2.5" cy="11.5" r="0.6" fill={color} opacity="0.5" />
    </svg>
  );
}

function ReasoningRow({ tone, children }) {
  const toneColor = tone === 'alert' ? '#C0392B'
                  : tone === 'warn'  ? '#C97A1F'
                  : Co.mossDeep;
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 7,
      padding: '3px 0',
    }}>
      <span style={{
        width: 14, height: 14, marginTop: 2, flexShrink: 0,
        borderRadius: 99, background: `${toneColor}20`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <span style={{ width: 5, height: 5, borderRadius: 99, background: toneColor }} />
      </span>
      <span style={{ flex: 1 }}>{children}</span>
    </div>
  );
}

function MiniMetric({ label, value, unit }) {
  return (
    <div style={{
      background: '#fff', borderRadius: 10, padding: '8px 10px',
      border: `0.5px solid ${Co.line}`,
    }}>
      <div style={{
        fontSize: 9.5, color: Co.inkMuted, letterSpacing: 1,
        fontFamily: Ko.font.mono, marginBottom: 2,
      }}>{label.toUpperCase()}</div>
      <div style={{
        fontSize: 15, fontWeight: 700, color: Co.ink, letterSpacing: -0.4,
        fontFamily: Ko.font.mono,
      }}>
        {value}
        {unit && <span style={{ fontSize: 10, color: Co.inkDim, marginLeft: 2, fontWeight: 500 }}>{unit}</span>}
      </div>
    </div>
  );
}

function ScreenGearPick({ tweaks }) {
  // 路线情境（由 tweaks 注入；默认箭扣长城）
  const ctx = (tweaks && tweaks.ctx) || TRIP_CTX;

  // 强制场景，方便在不同 artboard 里展示同一屏的不同状态：
  // 'manual-clean' / 'manual-warning' / 'ai-analyzing' / 'ai-applied'
  const scenario = (tweaks && tweaks.scenario) || 'manual-warning';

  // 装备清单（state — 用户可勾选，AI 也能改写）
  const initialCats = React.useMemo(() => ([
    { cat: '鞋履 · Footwear', items: [
      { id: 'boot1',  i: 'boot',  n: 'Salomon X Ultra 4', m: '高帮 · 480g', on: true,  rec: true, key: 'boots' },
      { id: 'sock1',  i: 'socks', n: 'Smartwool 羊毛袜',  m: '中筒 · 60g',  on: true },
    ]},
    { cat: '背包 · Pack', items: [
      { id: 'pack1', i: 'backpack', n: 'Osprey Talon 33', m: '日包 · 1.05kg', on: true, rec: true, key: 'pack' },
    ]},
    { cat: '衣物 · Clothing', items: [
      { id: 'jkt1', i: 'jacket', n: 'Patagonia 冲锋衣',   m: '硬壳 · 380g', on: true,  rec: true, key: 'shell' },
      { id: 'jkt2', i: 'jacket', n: 'Arc\'teryx 棉服',     m: '中层 · 320g', on: scenario !== 'manual-warning' && scenario !== 'manual-clean', key: 'midlayer' },
    ]},
    { cat: '水补 · Water & Fuel', items: [
      { id: 'btl1', i: 'bottle', n: 'Nalgene 1L × 2', m: '硬水壶 · 350g', on: true, key: 'water' },
      { id: 'gel1', i: 'drop',   n: '能量胶 × 4',     m: '补给 · 120g',  on: true },
    ]},
    { cat: '安全 · Safety', items: [
      { id: 'lit1',  i: 'light', n: 'Petzl 头灯', m: '450 流明 · 90g', on: true,  rec: true, key: 'headlamp' },
      { id: 'med1',  i: 'knife', n: '急救包',     m: '基础 · 200g',    on: false, rec: true, missing: true, key: 'firstaid' },
      { id: 'dry1',  i: 'drop',  n: '防水袋 5L',  m: 'AI 推荐 · 60g',  on: false, rec: true, missing: true, key: 'drysack' },
    ]},
  ]), [scenario]);

  const [cats, setCats] = React.useState(initialCats);
  // AI 状态
  const [aiState, setAiState] = React.useState(
    scenario === 'ai-analyzing' ? 'analyzing'
    : scenario === 'ai-applied' ? 'applied'
    : 'idle'
  );
  // 在被 scenario 切换时重置
  React.useEffect(() => { setCats(initialCats); }, [initialCats]);
  React.useEffect(() => {
    setAiState(
      scenario === 'ai-analyzing' ? 'analyzing'
      : scenario === 'ai-applied' ? 'applied'
      : 'idle'
    );
  }, [scenario]);

  // 切换某件装备
  const toggle = (id) => {
    setCats(cs => cs.map(c => ({
      ...c,
      items: c.items.map(it => it.id === id && !it.missing ? { ...it, on: !it.on } : it),
    })));
  };

  // 触发 AI
  const onApply = () => {
    setAiState('analyzing');
    setTimeout(() => {
      // 应用：勾选所有推荐项 + 加棉服中层（夜间冷）
      setCats(cs => cs.map(c => ({
        ...c,
        items: c.items.map(it => {
          if (it.missing) return it; // 缺装备不能勾，需借/购
          if (it.rec) return { ...it, on: true };
          if (it.key === 'midlayer') return { ...it, on: true }; // 推论：夜间冷
          return it;
        }),
      })));
      setAiState('applied');
    }, 1400);
  };
  const onUndo = () => { setCats(initialCats); setAiState('idle'); };

  // ── 计算所有警告（不依赖 AI；任何选择改变都重算）──────
  const warnings = React.useMemo(() => {
    const all = cats.flatMap(c => c.items);
    const has = (key) => all.find(it => it.key === key && it.on);
    const missingRec = all.filter(it => it.rec && it.missing);
    const list = [];

    // 缺关键 AI 推荐
    if (missingRec.length > 0) {
      list.push({
        sev: 'alert', icon: 'alert',
        title: `装备库缺 ${missingRec.length} 件关键装备`,
        body: missingRec.map(it => it.n).join(' · ') + ' — 可借用或购买',
      });
    }

    // 多日路线没带睡袋（用户的例子）
    if (ctx.days >= 2 && !has('sleeping_bag')) {
      list.push({
        sev: 'alert', icon: 'alert',
        title: `${ctx.days} 天 ${ctx.days - 1} 夜，未携带睡袋`,
        body: '过夜路线必须有睡袋；可从装备库添加或换日间包',
      });
    }

    // 夜间低温但中层不足
    if (ctx.nightLow <= 5 && !has('midlayer')) {
      list.push({
        sev: 'warn', icon: 'snow',
        title: `夜间最低 ${ctx.nightLow}°C，建议加保暖中层`,
        body: '当前已选硬壳，但缺羽绒/棉服中层；体温下降风险 ↑',
      });
    }

    // 高海拔 + 大风
    if (ctx.windPeak >= 6 && ctx.altMax >= 800 && !has('shell')) {
      list.push({
        sev: 'warn', icon: 'wind',
        title: `海拔 ${ctx.altMax}m + 阵风 ${ctx.windPeak} 级`,
        body: '建议选择硬壳冲锋衣，普通防风衣可能不够',
      });
    }

    // 全程无水源
    if (!ctx.hasWaterSrc && ctx.km >= 8) {
      const water = all.find(it => it.key === 'water' && it.on);
      if (!water) {
        list.push({
          sev: 'warn', icon: 'drop',
          title: '全程无补水点',
          body: `${ctx.km}km 建议至少 2L 水；当前未选硬水壶`,
        });
      }
    }

    return list;
  }, [cats, ctx]);

  // 统计
  const stats = React.useMemo(() => {
    const all = cats.flatMap(c => c.items);
    const selectedReal = all.filter(it => it.on && !it.missing).length;
    const totalRec = all.filter(it => it.rec).length;
    const recPicked = all.filter(it => it.rec && it.on && !it.missing).length;
    return { selectedReal, totalRec, recPicked };
  }, [cats]);

  return (
    <div style={{ position: 'relative', height: '100%', background: Co.bg, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 30 }}>
        <window.IOSStatusBar dark={false} />
      </div>

      <div style={{ height: '100%', overflowY: 'auto', padding: '60px 0 110px' }}>
        {/* Header */}
        <div style={{ padding: '0 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
            <window.CircleBtn icon="close" />
            <span style={{ fontSize: 12, fontFamily: Ko.font.sans, color: Co.inkMuted, letterSpacing: -0.1 }}>
              第 1 步 / 共 3 步
            </span>
            <window.CircleBtn icon="ellipsis" />
          </div>
          <div style={{ fontSize: 12, fontFamily: Ko.font.sans, color: Co.inkMuted, marginBottom: 4 }}>
            {ctx.routeName}  ·  困难 {ctx.diff}  ·  {ctx.km} 公里
            {ctx.days >= 2 && `  ·  ${ctx.days} 天 ${ctx.days - 1} 夜`}
          </div>
          <h1 style={{
            fontSize: 28, fontWeight: 700, color: Co.ink, letterSpacing: -0.7,
            margin: 0, lineHeight: 1.15,
          }}>选择今天带哪些装备</h1>
        </div>

        {/* AI 智能搭配卡 */}
        <div style={{ padding: 16 }}>
          <AISmartPackCard
            aiState={aiState}
            onApply={onApply}
            onUndo={onUndo}
            onShowWhy={() => {}}
          />
        </div>

        {/* 警告 banner */}
        {warnings.length > 0 && (
          <div style={{ padding: '0 16px 8px' }}>
            <WarningStack items={warnings} />
          </div>
        )}

        {/* List — natural flow, no absolute positioning */}
        <div style={{ padding: '8px 16px 0' }}>
          {cats.map((c, ci) => (
            <div key={ci} style={{ marginBottom: 18 }}>
              <div style={{
                fontSize: 13, fontWeight: 600, color: Co.ink, letterSpacing: -0.2,
                marginBottom: 8, paddingLeft: 4,
              }}>{c.cat}</div>
              <div style={{
                background: Co.surface, borderRadius: 16,
              border: `0.5px solid ${Co.line}`, overflow: 'hidden',
            }}>
              {c.items.map((g, gi) => (
                <div key={g.id} onClick={() => !g.missing && toggle(g.id)}
                     style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '13px 14px',
                  borderBottom: gi < c.items.length - 1 ? `0.5px solid ${Co.line}` : 'none',
                  background: g.missing ? 'rgba(192,57,43,0.04)' : 'transparent',
                  cursor: g.missing ? 'default' : 'pointer',
                }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: 11,
                    background: g.missing ? 'rgba(192,57,43,0.12)' : (g.on ? Co.mossSoft : Co.surfaceHi),
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'background .15s',
                  }}>
                    <window.Icon name={g.i} size={19}
                                 color={g.missing ? '#C0392B' : (g.on ? Co.mossDeep : Co.inkMuted)} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 14, fontWeight: 500, color: Co.ink, letterSpacing: -0.2 }}>{g.n}</span>
                      {g.missing ? (
                        <span style={{
                          fontSize: 10, fontFamily: Ko.font.sans, color: '#C0392B', fontWeight: 600,
                          background: 'rgba(192,57,43,0.10)', padding: '2px 6px', borderRadius: 99,
                          letterSpacing: -0.1,
                        }}>装备库缺</span>
                      ) : g.rec && (
                        <span style={{
                          fontSize: 10, fontFamily: Ko.font.sans, color: Co.flare, fontWeight: 600,
                          background: Co.flareSoft, padding: '2px 6px', borderRadius: 99,
                        }}>推荐</span>
                      )}
                    </div>
                    <div style={{ fontSize: 11.5, color: Co.inkMuted, marginTop: 1 }}>{g.m}</div>
                  </div>
                  {g.missing ? (
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={(e) => e.stopPropagation()} style={{
                        height: 28, padding: '0 10px', borderRadius: 8,
                        background: '#fff', color: Co.ink,
                        border: `0.5px solid ${Co.line}`,
                        fontSize: 11.5, fontWeight: 600, letterSpacing: -0.1, cursor: 'pointer',
                      }}>借</button>
                      <button onClick={(e) => e.stopPropagation()} style={{
                        height: 28, padding: '0 10px', borderRadius: 8,
                        background: '#C0392B', color: '#fff', border: 'none',
                        fontSize: 11.5, fontWeight: 600, letterSpacing: -0.1, cursor: 'pointer',
                      }}>购</button>
                    </div>
                  ) : (
                    <div style={{
                      width: 24, height: 24, borderRadius: 999,
                      background: g.on ? Co.flare : 'transparent',
                      border: `1.5px solid ${g.on ? Co.flare : Co.line}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      transition: 'background .15s, border-color .15s',
                    }}>
                      {g.on && <window.Icon name="check" size={12} color="#fff" strokeWidth={3} />}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
          ))}
        </div>
      </div>

      {/* CTA */}
      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 25,
        padding: '12px 16px 32px',
        background: `linear-gradient(180deg, transparent 0%, ${Co.bg} 40%)`,
      }}>
        <button style={{
          width: '100%', height: 54, borderRadius: 16,
          background: warnings.some(w => w.sev === 'alert') ? Co.surfaceHi : Co.flare,
          color: warnings.some(w => w.sev === 'alert') ? Co.inkMuted : '#fff',
          border: warnings.some(w => w.sev === 'alert') ? `0.5px solid ${Co.line}` : 'none',
          fontSize: 15, fontWeight: 600, fontFamily: Ko.font.sans,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 20px',
          boxShadow: warnings.some(w => w.sev === 'alert') ? 'none' : `0 4px 16px ${Co.flare}40`,
          letterSpacing: -0.3,
          cursor: warnings.some(w => w.sev === 'alert') ? 'not-allowed' : 'pointer',
        }}>
          <span>
            {warnings.some(w => w.sev === 'alert')
              ? `请先解决 ${warnings.filter(w => w.sev === 'alert').length} 个红色警告`
              : warnings.length > 0
              ? '了解风险，仍要继续 →'
              : '下一步  ·  天气与时间'}
          </span>
          <window.Icon name="forward" size={15} />
        </button>
      </div>
    </div>
  );
}

// ── 警告堆叠 ────────────────────────────────
function WarningStack({ items }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {items.slice(0, 3).map((w, i) => {
        const isAlert = w.sev === 'alert';
        const tone = isAlert ? '#C0392B' : '#C97A1F';
        const bg = isAlert ? 'rgba(192,57,43,0.07)' : 'rgba(201,122,31,0.07)';
        return (
          <div key={i} style={{
            display: 'flex', alignItems: 'flex-start', gap: 10,
            padding: '10px 12px', borderRadius: 12,
            background: bg, border: `0.5px solid ${tone}30`,
          }}>
            <div style={{
              width: 24, height: 24, borderRadius: 999,
              background: tone, flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              marginTop: 1,
            }}>
              <span style={{ fontSize: 12, fontWeight: 800, color: '#fff' }}>!</span>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: 12.5, fontWeight: 600, color: tone,
                letterSpacing: -0.2, lineHeight: 1.3,
              }}>{w.title}</div>
              <div style={{
                fontSize: 11, color: Co.ink, marginTop: 2,
                lineHeight: 1.4, opacity: 0.75, letterSpacing: -0.1,
              }}>{w.body}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Navigate (4) ─────────────────────────────────────────────
function ScreenNavigate() {  return (
    <div style={{ position: 'relative', height: '100%', background: Co.bg, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 30 }}>
        <window.IOSStatusBar dark={false} />
      </div>

      <div style={{ position: 'absolute', inset: 0 }}>
        <window.KaipaMap zoom="trail" showLabels={false} />
      </div>

      {/* Top HUD */}
      <div style={{ position: 'absolute', top: 56, left: 16, right: 16, zIndex: 20 }}>
        <window.Glass radius={20} style={{ padding: 16 }}>
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            marginBottom: 12,
          }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              fontSize: 12, fontFamily: Ko.font.sans, fontWeight: 600, color: Co.flare,
              letterSpacing: -0.1,
            }}>
              <span style={{ width: 8, height: 8, borderRadius: 99, background: Co.flare }} />
              进行中  ·  02:14:33
            </span>
            <span style={{ fontSize: 12, color: Co.inkMuted, letterSpacing: -0.1 }}>箭扣长城</span>
          </div>
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8,
            paddingTop: 12, borderTop: `0.5px solid ${Co.line}`,
          }}>
            <window.Stat value="4.7" unit="km" label="已走" />
            <window.Stat value="312" unit="m" label="爬升" />
            <window.Stat value="2.1" unit="km/h" label="均速" />
            <window.Stat value="6.7" unit="km" label="剩余" />
          </div>
        </window.Glass>
      </div>

      {/* Next waypoint */}
      <div style={{ position: 'absolute', bottom: 200, left: 16, right: 16, zIndex: 20 }}>
        <window.Glass radius={16} style={{ padding: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 50, height: 50, borderRadius: 14,
            background: Co.flareSoft, border: `0.5px solid ${Co.flare}30`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <window.Icon name="camera" size={22} color={Co.flare} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, fontFamily: Ko.font.sans, color: Co.inkMuted, letterSpacing: -0.1 }}>
              下一个  ·  340 米
            </div>
            <div style={{ fontSize: 15, fontWeight: 600, color: Co.ink, marginTop: 1, letterSpacing: -0.3 }}>
              鹰飞倒仰  ·  打卡点
            </div>
            <div style={{ fontSize: 11.5, color: Co.inkMuted, marginTop: 1 }}>
              海拔 1410m  ·  ↑ 98m
            </div>
          </div>
          <window.Icon name="forward" size={14} color={Co.inkMuted} />
        </window.Glass>
      </div>

      {/* Bottom action bar */}
      <div style={{
        position: 'absolute', bottom: 50, left: 16, right: 16, zIndex: 20,
        display: 'flex', gap: 10,
      }}>
        <window.CircleBtn icon="camera" size={56} iconSize={22} />
        <button style={{
          flex: 1, height: 56, borderRadius: 999,
          background: Co.flare, color: '#fff', border: 'none',
          fontSize: 15, fontWeight: 600,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          boxShadow: `0 4px 16px ${Co.flare}50`, letterSpacing: -0.2,
          cursor: 'pointer',
        }}>
          <window.Icon name="pause" size={16} /> 暂停
        </button>
        <window.CircleBtn icon="bell" size={56} iconSize={22} color={Co.flare} />
      </div>
    </div>
  );
}

// ─── Gear library (5) ────────────────────────────────────────
function ScreenGearLibrary() {
  const cats = [
    { i: 'boot',     n: '鞋履',  c: 4,  w: '1.2kg' },
    { i: 'backpack', n: '背包',  c: 3,  w: '4.1kg' },
    { i: 'jacket',   n: '衣物',  c: 12, w: '3.8kg' },
    { i: 'tent',     n: '帐篷',  c: 2,  w: '2.4kg' },
    { i: 'bottle',   n: '水补',  c: 6,  w: '0.8kg' },
    { i: 'light',    n: '电子',  c: 5,  w: '0.6kg' },
    { i: 'knife',    n: '工具',  c: 8,  w: '0.9kg' },
    { i: 'flame',    n: '炊具',  c: 4,  w: '1.1kg' },
  ];

  return (
    <div style={{ position: 'relative', height: '100%', background: Co.bg, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 30 }}>
        <window.IOSStatusBar dark={false} />
      </div>

      <div style={{ padding: '60px 16px 110px', height: '100%', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 8 }}>
          <h1 style={{ fontSize: 32, fontWeight: 700, color: Co.ink, margin: 0, letterSpacing: -0.8 }}>装备库</h1>
          <window.CircleBtn icon="plus" color="#fff" />
        </div>

        {(() => {
          const spendCats = [
            { name: '背包', val: 5.1, color: Co.flare },
            { name: '鞋履', val: 4.2, color: Co.sky },
            { name: '衣物', val: 3.6, color: Co.sand },
            { name: '帐篷', val: 2.8, color: '#C47D5A' },
            { name: '电子', val: 1.2, color: Co.moss },
            { name: '工具', val: 0.7, color: '#7BAFC8' },
            { name: '水补', val: 0.6, color: '#A89070' },
            { name: '炊具', val: 0.5, color: Co.inkDim },
          ];
          const spendTotal = spendCats.reduce((s, c) => s + c.val, 0);
          const dr = 48, dsw = 15, dcirc = 2 * Math.PI * dr;

          return (
            <div style={{
              marginTop: 18, padding: '20px 18px 16px',
              background: Co.surface, border: `0.5px solid ${Co.line}`, borderRadius: 18,
              boxShadow: '0 1px 3px rgba(40,30,20,0.04)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <svg viewBox="0 0 136 136" width="136" height="136" style={{ flexShrink: 0, display: 'block' }}>
                  {(() => {
                    let off = 0;
                    return spendCats.map((cat, i) => {
                      const seg = (cat.val / spendTotal) * dcirc;
                      const gap = 2;
                      const el = (
                        <circle key={i} cx="68" cy="68" r={dr}
                          fill="none" stroke={cat.color} strokeWidth={dsw}
                          strokeDasharray={`${(seg - gap).toFixed(2)} ${(dcirc - seg + gap).toFixed(2)}`}
                          strokeDashoffset={`${-(off + gap / 2).toFixed(2)}`}
                          transform="rotate(-90 68 68)" />
                      );
                      off += seg;
                      return el;
                    });
                  })()}
                  <text x="68" y="60" textAnchor="middle" dominantBaseline="central"
                    style={{ fontSize: 30, fontWeight: 700, fontFamily: Ko.font.sans,
                      fill: Co.ink, letterSpacing: -1 }}>
                    44
                  </text>
                  <text x="68" y="80" textAnchor="middle" dominantBaseline="central"
                    style={{ fontSize: 10, fontWeight: 500, fontFamily: Ko.font.sans,
                      fill: Co.inkMuted, letterSpacing: 0.3 }}>
                    件装备
                  </text>
                </svg>
                <div style={{
                  display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 10px', flex: 1,
                }}>
                  {spendCats.map((cat, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <div style={{
                        width: 7, height: 7, borderRadius: 99, background: cat.color, flexShrink: 0,
                      }} />
                      <span style={{
                        fontSize: 10.5, color: Co.ink, fontFamily: Ko.font.sans,
                        fontWeight: 500, letterSpacing: -0.1,
                      }}>{cat.name}</span>
                      <span style={{
                        fontSize: 10, color: Co.inkDim, fontFamily: Ko.font.sans, marginLeft: 'auto',
                      }}>¥{cat.val}k</span>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{
                display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12,
                marginTop: 16, paddingTop: 14,
                borderTop: `0.5px solid ${Co.lineSoft}`,
              }}>
                <window.Stat value="14.9" unit="kg" label="总重" />
                <window.Stat value="¥18.7" unit="k" label="总值" />
                <window.Stat value="8" label="个分类" />
              </div>

              <div style={{
                display: 'flex', alignItems: 'center', gap: 6,
                marginTop: 14, paddingTop: 12,
                borderTop: `0.5px solid ${Co.lineSoft}`,
              }}>
                <window.Icon name="alert" size={14} color={Co.flare} />
                <span style={{
                  fontSize: 12, fontWeight: 500, color: Co.flare,
                  letterSpacing: -0.2, fontFamily: Ko.font.sans,
                }}>
                  安全类装备不足，建议补充急救包
                </span>
              </div>
            </div>
          );
        })()}

        <div style={{ marginTop: 24, marginBottom: 12 }}>
          <window.SectionTitle title="装备预设" right="3 套" />
        </div>
        <div style={{ display: 'flex', gap: 10, overflowX: 'auto', marginLeft: -16, paddingLeft: 16, marginRight: -16, paddingRight: 16, paddingBottom: 4 }}>
          {[
            { n: '一日徒步',   s: '8 件 · 5.2kg',   c: Co.moss },
            { n: '过夜重装',   s: '24 件 · 12.1kg', c: Co.flare },
            { n: '雪线攀登',   s: '18 件 · 9.4kg',  c: Co.sky },
          ].map((p, i) => (
            <div key={i} style={{
              minWidth: 150, padding: 16, borderRadius: 16,
              background: Co.surface, border: `0.5px solid ${Co.line}`,
            }}>
              <div style={{ width: 10, height: 10, borderRadius: 99, background: p.c, marginBottom: 12 }} />
              <div style={{ fontSize: 15, fontWeight: 600, color: Co.ink, letterSpacing: -0.3 }}>{p.n}</div>
              <div style={{ fontSize: 11.5, color: Co.inkMuted, marginTop: 4 }}>{p.s}</div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 24, marginBottom: 12 }}>
          <window.SectionTitle title="分类" />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {cats.map((c, i) => (
            <div key={i} style={{
              padding: 16, borderRadius: 16,
              background: Co.surface, border: `0.5px solid ${Co.line}`,
              minHeight: 116,
            }}>
              <div style={{
                width: 36, height: 36, borderRadius: 10, background: Co.mossSoft,
                display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12,
              }}>
                <window.Icon name={c.i} size={18} color={Co.mossDeep} />
              </div>
              <div style={{ fontSize: 14.5, fontWeight: 600, color: Co.ink, letterSpacing: -0.2 }}>{c.n}</div>
              <div style={{ fontSize: 11.5, color: Co.inkMuted, marginTop: 4 }}>{c.c} 件  ·  {c.w}</div>
            </div>
          ))}
        </div>
      </div>

      <window.TabBar active="gear" departing={false} />
    </div>
  );
}

// ─── Profile (6) ─────────────────────────────────────────────
function ScreenProfile() {
  return (
    <div style={{ position: 'relative', height: '100%', background: Co.bg, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 30 }}>
        <window.IOSStatusBar dark={false} />
      </div>

      <div style={{ padding: '60px 16px 110px', height: '100%', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 8, marginBottom: 20 }}>
          <div style={{
            width: 68, height: 68, borderRadius: 999,
            background: `linear-gradient(135deg, ${Co.flare}, ${Co.sand})`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontSize: 26, fontWeight: 700,
            boxShadow: '0 4px 16px rgba(229,96,79,0.25)',
          }}>陈</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 24, fontWeight: 700, color: Co.ink, letterSpacing: -0.6 }}>陈明</div>
            <div style={{ fontSize: 12.5, color: Co.inkMuted, marginTop: 2 }}>北京 · 走过 23 条线路</div>
          </div>
          <window.CircleBtn icon="ellipsis" />
        </div>

        <div style={{
          padding: 18, borderRadius: 18,
          background: Co.surface, border: `0.5px solid ${Co.line}`,
          display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8,
          boxShadow: '0 1px 3px rgba(40,30,20,0.04)',
        }}>
          <window.Stat value="287" unit="km" label="累计" />
          <window.Stat value="14.2" unit="k m" label="爬升" />
          <window.Stat value="23" label="路线" />
          <window.Stat value="6" label="徽章" />
        </div>

        <div style={{ marginTop: 24 }}>
          <window.SectionTitle title="今年的足迹" right="42 次出行" />
        </div>
        <div style={{
          marginTop: 10, padding: 16, background: Co.surface, borderRadius: 16,
          border: `0.5px solid ${Co.line}`,
        }}>
          <YearHeatmap />
        </div>

        <div style={{ marginTop: 24 }}>
          <window.SectionTitle title="徽章" right="6 / 24" />
        </div>
        <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
          {[
            { i: 'mountain', l: '登顶 5K', on: true },
            { i: 'trail',    l: '百公里',   on: true },
            { i: 'sun',      l: '十日出',   on: true },
            { i: 'moon',     l: '月光',     on: true },
            { i: 'flame',    l: '冬季',     on: true },
            { i: 'flag',     l: '七大洲',   on: false },
            { i: 'tree',     l: '原始林',   on: false },
            { i: 'compass',  l: '探索者',   on: true },
          ].map((b, i) => (
            <div key={i} style={{
              aspectRatio: '1', borderRadius: 16,
              background: b.on ? Co.surface : 'transparent',
              border: `0.5px solid ${b.on ? Co.line : Co.lineSoft}`,
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              gap: 6, opacity: b.on ? 1 : 0.45,
            }}>
              <window.Icon name={b.i} size={24} color={b.on ? Co.flare : Co.inkDim} />
              <span style={{ fontSize: 10.5, color: b.on ? Co.ink : Co.inkDim, letterSpacing: -0.1 }}>{b.l}</span>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 24 }}>
          <window.SectionTitle title="最近走过" />
        </div>
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[
            { n: '十三陵水库环线', d: '2026.04.20', km: '14.2', up: '480' },
            { n: '云蒙山',         d: '2026.04.06', km: '7.3',  up: '620' },
            { n: '海坨山',         d: '2026.03.22', km: '18.1', up: '1240' },
          ].map((r, i) => (
            <div key={i} style={{
              padding: 14, borderRadius: 14,
              background: Co.surface, border: `0.5px solid ${Co.line}`,
              display: 'flex', alignItems: 'center', gap: 12,
            }}>
              <div style={{
                width: 44, height: 44, borderRadius: 12,
                background: Co.terrain.lowland,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <window.Icon name="mountain" size={20} color={Co.mossDeep} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14.5, fontWeight: 600, color: Co.ink, letterSpacing: -0.2 }}>{r.n}</div>
                <div style={{ fontSize: 11.5, color: Co.inkMuted, marginTop: 2 }}>
                  {r.d}  ·  {r.km}km  ·  ↑{r.up}m
                </div>
              </div>
              <window.Icon name="forward" size={14} color={Co.inkDim} />
            </div>
          ))}
        </div>
      </div>

      <window.TabBar active="me" departing={false} />
    </div>
  );
}

function YearHeatmap() {
  const weeks = 26, days = 7;
  const data = Array.from({ length: weeks * days }, (_, i) => {
    const seed = (i * 13 + 7) % 31;
    return seed > 26 ? 4 : seed > 22 ? 3 : seed > 17 ? 2 : seed > 13 ? 1 : 0;
  });
  const colors = [Co.lineSoft, Co.moss + '35', Co.moss + '70', Co.moss, Co.flare];
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${weeks}, 1fr)`, gap: 2 }}>
        {Array.from({ length: weeks }, (_, w) => (
          <div key={w} style={{ display: 'grid', gridTemplateRows: `repeat(${days}, 1fr)`, gap: 2 }}>
            {Array.from({ length: days }, (_, d) => (
              <div key={d} style={{ aspectRatio: '1', background: colors[data[w * days + d]], borderRadius: 3 }} />
            ))}
          </div>
        ))}
      </div>
      <div style={{
        display: 'flex', justifyContent: 'space-between', marginTop: 10,
        fontSize: 10.5, fontFamily: Ko.font.sans, color: Co.inkMuted,
      }}>
        <span>1月</span><span>2月</span><span>3月</span><span>4月</span><span>5月</span><span>6月</span>
      </div>
    </div>
  );
}

window.ScreenGearPick = ScreenGearPick;
window.ScreenNavigate = ScreenNavigate;
window.ScreenGearLibrary = ScreenGearLibrary;
window.ScreenProfile = ScreenProfile;

// ─── Gear category detail (5b) ──────────────────────────────
// List of items in one category — e.g. "鞋履"
function ScreenGearCategory() {
  const items = [
    { id: 'salomon', n: 'Salomon X Ultra 4', sub: 'GTX 中帮 · 男 42', w: '420g',
      tags: ['防水', '中帮', '春秋'], cond: 'good', uses: 38, photos: 4,
      colors: ['#5C4D3E', '#A04A2C'] },
    { id: 'lasportiva', n: 'La Sportiva TX4', sub: '接近鞋 · 男 42', w: '380g',
      tags: ['攀爬', '低帮'], cond: 'good', uses: 12, photos: 3,
      colors: ['#1F2E1A', '#FFD93D'] },
    { id: 'hoka', n: 'Hoka Speedgoat 5', sub: '越野跑鞋 · 男 42.5', w: '300g',
      tags: ['越野', '夏季'], cond: 'worn', uses: 64, photos: 5,
      colors: ['#2C5D7E', '#FFFFFF'] },
    { id: 'kailas', n: 'Kailas KX5 高山靴', sub: '雪线 · 男 42 · B2 卡式', w: '780g',
      tags: ['雪线', '冰爪兼容'], cond: 'good', uses: 6, photos: 2,
      colors: ['#34465E', '#FF7A1A'] },
  ];

  const condCfg = {
    good: { label: '良好', color: Co.moss, bg: Co.mossSoft },
    worn: { label: '磨损', color: Co.flare, bg: Co.flareSoft },
    new:  { label: '全新', color: '#3D6A8C', bg: '#EAF0F5' },
  };

  return (
    <div style={{ position: 'relative', height: '100%', background: Co.bg, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 30 }}>
        <window.IOSStatusBar dark={false} />
      </div>

      {/* Header — sticky */}
      <div style={{
        position: 'absolute', top: 44, left: 0, right: 0, zIndex: 20,
        padding: '10px 16px',
        background: `linear-gradient(${Co.bg} 80%, transparent)`,
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <button style={{
          width: 36, height: 36, borderRadius: 99, border: `0.5px solid ${Co.line}`,
          background: Co.surface, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <window.Icon name="chevronLeft" size={16} color={Co.ink} />
        </button>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: Co.ink, letterSpacing: -0.4 }}>鞋履</div>
          <div style={{ fontSize: 11, color: Co.inkMuted, marginTop: 1 }}>4 件 · 1.88 kg · ¥4,820</div>
        </div>
        <button style={{
          width: 36, height: 36, borderRadius: 99, border: 'none',
          background: Co.flare, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <window.Icon name="plus" size={16} color="#fff" />
        </button>
      </div>

      <div style={{ padding: '108px 16px 110px', height: '100%', overflowY: 'auto' }}>
        {/* Filter chips */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 14, overflowX: 'auto' }}>
          {['全部 4', '使用中 2', '收藏 1', '雪线', '越野', '中帮'].map((s, i) => (
            <span key={i} style={{
              padding: '6px 11px', borderRadius: 999, whiteSpace: 'nowrap',
              background: i === 0 ? Co.flareSoft : Co.surface,
              color: i === 0 ? Co.flare : Co.ink,
              border: `0.5px solid ${i === 0 ? 'transparent' : Co.line}`,
              fontSize: 11.5, fontWeight: i === 0 ? 600 : 500, letterSpacing: -0.1,
            }}>{s}</span>
          ))}
        </div>

        {/* Sort */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          marginBottom: 10, paddingLeft: 4,
        }}>
          <span style={{ fontSize: 12, color: Co.inkMuted, letterSpacing: -0.1 }}>4 件 · 按使用次数</span>
          <div style={{ display: 'flex', gap: 6 }}>
            <button style={{
              width: 28, height: 28, borderRadius: 8, border: `0.5px solid ${Co.line}`,
              background: Co.surface, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <window.Icon name="grid" size={13} color={Co.ink} />
            </button>
            <button style={{
              width: 28, height: 28, borderRadius: 8, border: `0.5px solid ${Co.line}`,
              background: Co.flareSoft, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <window.Icon name="list" size={13} color={Co.flare} />
            </button>
          </div>
        </div>

        {/* Item cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {items.map(it => {
            const cfg = condCfg[it.cond];
            return (
              <div key={it.id} style={{
                background: Co.surface, border: `0.5px solid ${Co.line}`,
                borderRadius: 16, padding: 12,
                display: 'flex', gap: 12,
                boxShadow: '0 1px 3px rgba(40,30,20,0.04)',
              }}>
                {/* Photo thumbnail with stack indicator */}
                <div style={{ position: 'relative', flex: '0 0 84px' }}>
                  <div style={{
                    width: 84, height: 84, borderRadius: 12,
                    background: `linear-gradient(135deg, ${it.colors[0]}, ${it.colors[1]})`,
                    position: 'relative', overflow: 'hidden',
                  }}>
                    {/* Stylized boot silhouette */}
                    <svg viewBox="0 0 84 84" width="84" height="84"
                         style={{ position: 'absolute', inset: 0 }}>
                      <path d="M20,52 L20,32 Q20,22 30,22 L42,22 Q50,22 52,28 L62,42 Q66,46 66,54 L66,60 Q66,66 60,66 L26,66 Q20,66 20,60 Z"
                            fill="rgba(0,0,0,0.35)" />
                      <path d="M22,50 L22,34 Q22,26 30,26 L40,26 Q46,26 48,30 L58,42 Q62,46 62,52 L62,58 Q62,62 58,62 L26,62 Q22,62 22,58 Z"
                            fill="rgba(255,255,255,0.18)" />
                      <line x1="28" y1="38" x2="44" y2="38" stroke="rgba(255,255,255,0.5)" strokeWidth="0.8" />
                      <line x1="28" y1="44" x2="46" y2="44" stroke="rgba(255,255,255,0.5)" strokeWidth="0.8" />
                    </svg>
                  </div>
                  {/* Photo count badge */}
                  <div style={{
                    position: 'absolute', bottom: 6, right: 6,
                    padding: '2px 6px', borderRadius: 99,
                    background: 'rgba(0,0,0,0.55)',
                    backdropFilter: 'blur(6px)',
                    fontSize: 9.5, color: '#fff', fontWeight: 600,
                    display: 'flex', alignItems: 'center', gap: 3,
                  }}>
                    <window.Icon name="image" size={9} color="#fff" />
                    {it.photos}
                  </div>
                </div>

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 6 }}>
                    <div style={{
                      fontSize: 14, fontWeight: 700, color: Co.ink, letterSpacing: -0.3,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>{it.n}</div>
                    <span style={{
                      flex: '0 0 auto',
                      padding: '2px 7px', borderRadius: 99,
                      fontSize: 9.5, fontWeight: 700, letterSpacing: 0.2,
                      color: cfg.color, background: cfg.bg,
                    }}>{cfg.label}</span>
                  </div>
                  <div style={{ fontSize: 11.5, color: Co.inkMuted, letterSpacing: -0.1 }}>{it.sub}</div>

                  {/* Tags */}
                  <div style={{ display: 'flex', gap: 4, marginTop: 4, flexWrap: 'wrap' }}>
                    {it.tags.map(t => (
                      <span key={t} style={{
                        padding: '2px 7px', borderRadius: 99,
                        background: Co.surfaceHi, fontSize: 10, color: Co.ink,
                        border: `0.5px solid ${Co.line}`, letterSpacing: -0.1,
                      }}>{t}</span>
                    ))}
                  </div>

                  {/* Stats row */}
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 12, marginTop: 6,
                    fontSize: 10.5, color: Co.inkMuted,
                    fontFamily: 'ui-monospace, SFMono-Regular, monospace',
                  }}>
                    <span>{it.w}</span>
                    <span style={{ width: 1, height: 10, background: Co.line }} />
                    <span>用过 {it.uses} 次</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <window.TabBar active="gear" departing={false} />
    </div>
  );
}

// ─── Gear item detail (5c) ───────────────────────────────────
// Single item with multiple photos
function ScreenGearItemDetail() {
  const photos = [
    { c1: '#5C4D3E', c2: '#A04A2C', tag: '主图' },
    { c1: '#3A2E25', c2: '#7A6855', tag: '细节' },
    { c1: '#634A36', c2: '#9E7A4A', tag: '使用中' },
    { c1: '#4A3D30', c2: '#7E6238', tag: '磨损' },
  ];
  const fields = [
    { l: '品牌', v: 'Salomon' },
    { l: '型号', v: 'X Ultra 4 Mid GTX' },
    { l: '尺码', v: 'EU 42 · UK 8' },
    { l: '重量', v: '420 g' },
    { l: '价格', v: '¥1,280' },
    { l: '入手日期', v: '2025-09-12' },
  ];

  return (
    <div style={{ position: 'relative', height: '100%', background: Co.bg, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 30 }}>
        <window.IOSStatusBar dark={false} />
      </div>

      <div style={{ height: '100%', overflowY: 'auto' }}>
        {/* Photo carousel */}
        <div style={{
          position: 'relative', width: '100%', height: 380,
          background: '#2A2118', overflow: 'hidden',
        }}>
          {/* Main photo */}
          <div style={{
            position: 'absolute', inset: 0,
            background: `radial-gradient(circle at 35% 30%, ${photos[0].c2}, ${photos[0].c1})`,
          }}>
            <svg viewBox="0 0 400 380" width="100%" height="100%">
              <path d="M80,260 L80,140 Q80,100 130,100 L210,100 Q260,100 280,135 L340,220 Q360,245 360,290 L360,320 Q360,340 335,340 L100,340 Q80,340 80,320 Z"
                    fill="rgba(0,0,0,0.5)" />
              <path d="M90,250 L90,150 Q90,115 135,115 L205,115 Q245,115 260,142 L325,225 Q345,250 345,290 L345,315 Q345,330 325,330 L105,330 Q90,330 90,315 Z"
                    fill="rgba(255,255,255,0.12)" />
              <line x1="120" y1="180" x2="240" y2="180" stroke="rgba(255,255,255,0.4)" strokeWidth="2" />
              <line x1="125" y1="205" x2="250" y2="205" stroke="rgba(255,255,255,0.4)" strokeWidth="2" />
              <line x1="130" y1="230" x2="255" y2="230" stroke="rgba(255,255,255,0.4)" strokeWidth="2" />
              <ellipse cx="220" cy="280" rx="90" ry="14" fill="rgba(0,0,0,0.4)" />
            </svg>
          </div>

          {/* Top chrome — back/share */}
          <div style={{
            position: 'absolute', top: 50, left: 12, right: 12,
            display: 'flex', justifyContent: 'space-between',
          }}>
            <button style={{
              width: 38, height: 38, borderRadius: 999, border: 'none',
              background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(20px)',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
            }}>
              <window.Icon name="chevronLeft" size={17} color={Co.ink} />
            </button>
            <div style={{ display: 'flex', gap: 8 }}>
              <button style={{
                width: 38, height: 38, borderRadius: 999, border: 'none',
                background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(20px)',
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
              }}>
                <window.Icon name="share" size={15} color={Co.ink} />
              </button>
              <button style={{
                width: 38, height: 38, borderRadius: 999, border: 'none',
                background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(20px)',
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
              }}>
                <window.Icon name="more" size={15} color={Co.ink} />
              </button>
            </div>
          </div>

          {/* Photo counter */}
          <div style={{
            position: 'absolute', top: 50, left: '50%', transform: 'translateX(-50%)',
            padding: '6px 12px', borderRadius: 99,
            background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(10px)',
            fontSize: 11, color: '#fff', fontWeight: 600, letterSpacing: 0.3,
          }}>1 / {photos.length}</div>

          {/* Page dots */}
          <div style={{
            position: 'absolute', bottom: 76, left: 0, right: 0,
            display: 'flex', justifyContent: 'center', gap: 5,
          }}>
            {photos.map((_, i) => (
              <span key={i} style={{
                width: i === 0 ? 18 : 6, height: 6, borderRadius: 99,
                background: i === 0 ? '#fff' : 'rgba(255,255,255,0.5)',
                transition: 'width .25s',
              }} />
            ))}
          </div>

          {/* Thumbnail strip */}
          <div style={{
            position: 'absolute', bottom: 12, left: 12, right: 12,
            display: 'flex', gap: 6, overflowX: 'auto',
          }}>
            {photos.map((p, i) => (
              <div key={i} style={{
                flex: '0 0 52px', height: 52, borderRadius: 8,
                background: `linear-gradient(135deg, ${p.c1}, ${p.c2})`,
                border: i === 0 ? '2px solid #fff' : '2px solid rgba(255,255,255,0.3)',
                position: 'relative', cursor: 'pointer',
              }}>
                <span style={{
                  position: 'absolute', bottom: 2, left: 2, right: 2,
                  fontSize: 8, color: '#fff', fontWeight: 600,
                  textShadow: '0 1px 2px rgba(0,0,0,0.6)', textAlign: 'center',
                  letterSpacing: 0.2,
                }}>{p.tag}</span>
              </div>
            ))}
            {/* Add photo button */}
            <button style={{
              flex: '0 0 52px', height: 52, borderRadius: 8,
              background: 'rgba(255,255,255,0.2)', backdropFilter: 'blur(10px)',
              border: '1.5px dashed rgba(255,255,255,0.6)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <window.Icon name="plus" size={16} color="#fff" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: '20px 16px 110px' }}>
          {/* Title row */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
            <div style={{ flex: 1 }}>
              <h1 style={{ fontSize: 24, fontWeight: 700, color: Co.ink, margin: 0, letterSpacing: -0.6 }}>
                Salomon X Ultra 4
              </h1>
              <div style={{ fontSize: 13, color: Co.inkMuted, marginTop: 4, letterSpacing: -0.2 }}>
                GTX 中帮防水徒步鞋
              </div>
            </div>
            <span style={{
              padding: '4px 10px', borderRadius: 99,
              fontSize: 10.5, fontWeight: 700, letterSpacing: 0.3,
              color: Co.moss, background: Co.mossSoft,
            }}>良好</span>
          </div>

          {/* Tags */}
          <div style={{ display: 'flex', gap: 6, marginTop: 12, flexWrap: 'wrap' }}>
            {['防水', '中帮', '春秋', '常用'].map(t => (
              <span key={t} style={{
                padding: '4px 10px', borderRadius: 99,
                background: Co.surfaceHi, border: `0.5px solid ${Co.line}`,
                fontSize: 11, color: Co.ink, letterSpacing: -0.1,
              }}>{t}</span>
            ))}
          </div>

          {/* Stats grid */}
          <div style={{
            marginTop: 18, padding: 16,
            background: Co.surface, border: `0.5px solid ${Co.line}`,
            borderRadius: 16,
            display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12,
          }}>
            <window.Stat value="38" label="使用次数" />
            <window.Stat value="412" unit="km" label="累计里程" />
            <window.Stat value="4.6" label="自评" />
          </div>

          {/* Specs */}
          <div style={{ marginTop: 22, marginBottom: 10 }}>
            <window.SectionTitle title="规格" right="编辑" />
          </div>
          <div style={{
            background: Co.surface, border: `0.5px solid ${Co.line}`, borderRadius: 16,
            overflow: 'hidden',
          }}>
            {fields.map((f, i) => (
              <div key={f.l} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '12px 14px',
                borderTop: i === 0 ? 'none' : `0.5px solid ${Co.line}`,
              }}>
                <span style={{ fontSize: 13, color: Co.inkMuted, letterSpacing: -0.1 }}>{f.l}</span>
                <span style={{
                  fontSize: 13, color: Co.ink, fontWeight: 500, letterSpacing: -0.2,
                  fontFamily: f.l === '价格' || f.l === '重量' ? 'ui-monospace, SFMono-Regular, monospace' : 'inherit',
                }}>{f.v}</span>
              </div>
            ))}
          </div>

          {/* Notes */}
          <div style={{ marginTop: 22, marginBottom: 10 }}>
            <window.SectionTitle title="备注" />
          </div>
          <div style={{
            padding: 14, background: Co.surface, border: `0.5px solid ${Co.line}`,
            borderRadius: 14, fontSize: 13, color: Co.ink, lineHeight: 1.55,
            letterSpacing: -0.1,
          }}>
            鞋码偏小半码，建议加垫。冰雪路面抓地一般，需配合冰爪。鞋带 3 个月后开始磨损，可考虑换 5mm 圆绳。
          </div>

          {/* Used on routes */}
          <div style={{ marginTop: 22, marginBottom: 10 }}>
            <window.SectionTitle title="参与过的路线" right="38 次" />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              { n: '箭扣长城西段', d: '2026-04-12', km: '11.4 km' },
              { n: '香山·南北穿越', d: '2026-03-28', km: '6.2 km' },
              { n: '云蒙山东线', d: '2026-03-15', km: '7.3 km' },
            ].map((r, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '11px 12px', background: Co.surface,
                border: `0.5px solid ${Co.line}`, borderRadius: 12,
              }}>
                <div style={{
                  width: 28, height: 28, borderRadius: 8, background: Co.flareSoft,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <window.Icon name="route" size={13} color={Co.flare} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: Co.ink, letterSpacing: -0.2 }}>{r.n}</div>
                  <div style={{ fontSize: 10.5, color: Co.inkMuted, marginTop: 1,
                                fontFamily: 'ui-monospace, SFMono-Regular, monospace' }}>
                    {r.d} · {r.km}
                  </div>
                </div>
                <window.Icon name="chevronRight" size={13} color={Co.inkMuted} />
              </div>
            ))}
          </div>
        </div>
      </div>

      <window.TabBar active="gear" departing={false} />
    </div>
  );
}

window.ScreenGearLibrary = ScreenGearLibrary;
window.ScreenGearCategory = ScreenGearCategory;
window.ScreenGearItemDetail = ScreenGearItemDetail;
window.ScreenProfile = ScreenProfile;

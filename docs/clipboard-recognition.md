# 剪贴板商品识别 · 设计与真机验证

从淘宝 / 京东 / 得物 / 抖音商城复制一条商品链接,回到 Kaipa,装备页会弹出一张识别卡片。
难点不在识别,而在 iOS:从后台恢复时**读一次剪贴板文本,本身就会弹系统的「允许粘贴」**。
所以整个设计的目标是——把「读」压到最后一步,只在最可能命中的时候读。

---

## 1. 识别的是什么

`src/lib/clipboardProduct.ts`

- 文案里**包含**一个链接即可(分享文案通常是「数字 + 标题 + 短链 + 引导语」)。
- 链接的 host 必须在白名单里:`taobao.com` `tmall.com` `tb.cn` `jd.com` `3.cn` `jd.hk` `dewu.com` `dw4.co` `douyin.com`(含其子域)。
- 每段文本按 FNV-1a 指纹记进 AsyncStorage 的 seen 列表(上限 20 条):弹出过、被关掉、或者抓取失败的文本**都不再出现**。

命中后交给 `fetchGearLinkPreview()` 取商品标题、价格、图片,再由 `ClipboardProductCard` 展示。

## 2. 什么时候扫

`src/hooks/useClipboardProduct.ts`

只在两个时刻:**冷启动后 1.5s** 和 **从 background/inactive 回到 active**。没有定时器。
录音或导航进行中、有全屏浮层时(`ClipboardProductGate` 传入的 `suppressed`)直接跳过。

## 3. iOS 的闸门(核心)

iOS 16 起,只要文本来自别的 app,`Clipboard.getStringAsync()` 每次都会弹「允许粘贴」。
expo-clipboard 56.0.4 没有暴露 `UIPasteboard.changeCount`,也没有暴露 pattern 检测
(见 `node_modules/expo-clipboard/ios/ClipboardModule.swift`),所以补了一个 app-local 原生模块
`modules/clipboard-probe`,只做两件**不碰内容**的事:

```
changeCount()   粘贴板写入计数器 —— 不返回值,不弹窗
detectLink()    只问「文本里是否含链接」—— 不返回值,不弹窗
```

扫描顺序:

| 步骤 | 判断 | 不通过时 |
|---|---|---|
| ① | `clipboardProbe` 存在? | 直接放弃自动识别(Expo Go / 老包)。**不读**,所以不弹 |
| ② | `changeCount()` 和上次记录的不同? | 停。冷启动第一次没有上次值,按「变了」处理 |
| ③ | 立刻记下新的 count | 同一份内容不会被探测第二次 |
| ④ | `detectLink()` 为 true? | 停。**不读**,所以不弹 |
| ⑤ | `getStringAsync()` | 全流程**唯一**可能弹系统提示的地方 |

②③④ 都在 `ClipboardProbeModule.swift` 内完成。Swift 里用
iOS 15 起的键路径接口 `detectPatterns(for: [\.links, \.probableWebURL])`
(`UIPasteboard.DetectedValues`)。`links` 的含义是「文本**包含**链接」,对应分享文案;
`probableWebURL` 只匹配「文本整体就是一个 URL」,用来兜住 Safari 里复制的裸链接。
Swift 里没有 `DetectionPattern.link`,ObjC 的 `UIPasteboardDetectionPatternLink` 在 Swift
中被改写成了上面的键路径接口。项目最低支持 iOS 16.4,所以没有旧系统分支。模块**绝不**读取 `string` / `strings` / `url` /
`urls` / detected values —— 一旦读了,弹窗又回来了。

Android 不变:回到前台等 400ms(窗口拿到焦点后才能读),然后直接读、按白名单判断。

## 4. 老包 / Expo Go 的行为

`clipboardProbe` 为 `null` 时,iOS 走自动识别的那条路整条关掉:不探测、不读、不弹窗。
手动粘贴入口(装备页里粘贴识别)照常可用,因为它由用户主动触发,弹窗是预期内的。

## 5. 原生模块必须重新出包

`modules/` 里的东西通过 `package.json` 的 `expo.autolinking.nativeModulesDir` 自动注册,
但它是**原生代码**:必须 `expo prebuild` + 重新构建 dev/production 包才生效,
**不能**通过 `expo-updates` 下发。JS 侧已经做了缺失兜底,所以老包不会因为这次改动崩溃,
只是没有自动识别。

## 6. 真机验证清单

前提:iPhone 上一个**包含本模块**的 dev build,`npx expo start --dev-client`,
Metro 控制台过滤 `clipboard-probe`。每行形如:

```
[clipboard-probe] count=12 prev=11 link=true read=yes host=m.tb.cn
[clipboard-probe] count=13 prev=12 link=false read=no        ← 不含链接,静默
[clipboard-probe] count=13 prev=13 link=false read=no        ← 粘贴板没动过(同一行只打一次)
[clipboard-probe] module=missing read=no                     ← 包里没有该模块
```

| # | 操作 | 期望的系统弹窗 | 期望的日志 |
|---|---|---|---|
| a | 在**淘宝 app 里**点分享→复制链接(标题 + `https://m.tb.cn/xxxx` + 引导语),切回 Kaipa | 至多**一次**「允许粘贴」,允许后出现识别卡片 | `count` 变大、`link=true`、`read=yes`、`host=m.tb.cn`;随后 `product added` 由卡片体现 |
| b | 卡片关掉或忽略,**不复制任何东西**,再切走再切回 | 无弹窗 | 只有一行 `count=N prev=N link=false read=no`(count 没变),不会走到 `read=yes` |
| c | 在备忘录里复制一段**纯中文、不含链接**的文字,切回 Kaipa | 无弹窗 | `count` 变大但 `link=false read=no`;`prev` 是这次的新 count,再切回时 `count=prev` |
| d | 在**京东 app**里复制商品分享文案,切回 | 至多一次弹窗,出现卡片 | `link=true read=yes host=item.jd.com`(或 `3.cn` 短链) |
| e | 在 **Safari** 地址栏/分享菜单里复制**一条裸链接**(整段文本就是一个 URL),切回 | 可能弹窗 | 分享文案命中 `links`;裸链接命中 `links` 或 `probableWebURL`,都会 `link=true read=yes host=<该域名>`,随后被白名单挡掉 → `read=yes host=-`(说明探测放行、白名单正确拦截) |
| f | 系统 **设置 → Kaipa → 允许粘贴 → 允许**,重复 a/d | **完全没有弹窗**,直接出卡片 | 与 a/d 相同:「允许」只影响弹窗是否出现,`link=true read=yes` 序列不变 |
| g | 装一个**改动之前**的旧包(或用 Expo Go),复制淘宝链接后切回 | 无弹窗(旧逻辑可能弹,见备注) | `module=missing read=no`;app 不崩、不报错、不出卡片,手动粘贴入口仍可用 |

额外要确认的两件事:

- **冷启动**:杀掉 app、复制好链接、再启动。1.5s 后应出现一行 `count=… prev=null link=true read=yes host=…`。
- **seen 去重**:同一条链接的卡片出现或失败过一次之后,再切走切回应是 `count` 不变(`link=false read=no`);若期间又复制了别的内容,则 count 变大但同一文本不会再弹第二次卡片。

备注(g):旧包里的逻辑是「resume 就读」,只要粘贴板上有文本就会弹。清单里的 g 只验证**新代码在有模块/无模块两种包里的行为**,旧包的表现以它自己那版代码为准。

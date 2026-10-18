# 装包模式：美术素材规格与生图提示词

日期：2026-10-16。状态：素材规格草案；功能尚未开发。交互原型见 `docs/previews/packing-mode.html`（原型里的矢量图形只用来验证布局和交互，正式版全部换成本文定义的素材）。

## 0. 结论

- 画面由**一张背包剖面图**和**一套装备图标**组成，风格统一为「写实 3D 渲染的产品图标」：真实面料质感、柔和棚拍光、轻微俯视的 3/4 视角，接近 Apple 产品图和高质量游戏道具图。
- 装备图标优先买现成的 3D 户外素材包，缺的用 AI 补齐；背包剖面图用 AI 生成再修图。
- **先定风格锚点，再批量出图**：先挑定素材包（或第一张满意的 AI 图），之后每一张都拿它当风格参考图，否则一整套图会风格不一。
- 不带任何品牌 Logo 或商标。示例装备里的 Nemo、Arc'teryx 等只是用户自己填的名称，图标一律做成无品牌的通用款。

## 1. 统一风格

| 项 | 要求 |
| --- | --- |
| 渲染风格 | 写实 3D 产品渲染，材质偏柔和（不是卡通黏土，也不是照片级脏旧感） |
| 视角 | 从右前方看的 3/4 视角，略微俯视约 15 到 20 度。所有素材同一视角 |
| 光照 | 主光在左上方，柔和棚拍光，带轻微环境光遮蔽和细的轮廓光（深色背景上也能看清边缘） |
| 背景 | 生成时用纯色浅灰底（#E6E6E6），后期抠成透明。不要白底，避免浅色装备和背景粘连 |
| 地面阴影 | **不要**画进图里，阴影由代码统一加 |
| 配色 | 户外装备常见的饱和度偏低的颜色：橄榄绿、岩灰、赭橙、深蓝、暗红、芥末黄。同一区域相邻的装备颜色要拉开 |
| 文字 | 图里不出现任何文字、标签、Logo |

使用场景：装包页是沉浸式深色舞台（浅色和深色模式都用同一个深色舞台，类似全屏看图），素材要在 #1D2822 左右的深色背景上清晰可辨。

## 2. 背包剖面图

### 2.1 交付文件

| 文件 | 内容 | 来源 |
| --- | --- | --- |
| `bag-base.png` | 完整背包。主仓正面开一个圆角矩形「透视窗」，窗内是**空的**深色内衬；顶包同样开窗、内部为空；侧袋和腰带包为空 | AI 生成后修图 |
| `bag-front.png` | 与 `bag-base.png` 完全对齐的同尺寸图，但主仓窗口和顶包窗口内部抠成透明，只保留外层面料、拉链边和压缩带 | 从 `bag-base.png` 修出 |
| `pocket-side.png` | 只有侧袋网兜（半透明），与上面两张对齐 | 从 `bag-base.png` 修出 |
| `pocket-belt.png` | 只有腰带包网兜（半透明），与上面两张对齐 | 从 `bag-base.png` 修出 |

叠放顺序（从下到上）：`bag-base` → 包内装备 → `bag-front` → 侧袋和腰带包里的装备 → `pocket-side`、`pocket-belt` → 外挂装备（防潮垫、登山杖）。外层面料会自然盖住装备的边缘，看起来就是装在包里，代码不需要做遮罩。

### 2.2 尺寸与构图

- 画布 1536 × 2048（3:4），PNG 透明底，sRGB。
- 背包居中，四周留白至少 8%：底部要给外挂防潮垫留出位置，左侧给腰带留出位置。
- 主仓窗口尽量大，占背包正面的 75% 以上；顶包窗口占顶包正面的 70% 以上。
- 背包本身：60 升左右重装徒步包，正面平整、两侧有压缩带、右侧可见一个网兜侧袋、左下角可见一截腰带和腰带包、包底有两根外挂织带。

### 2.3 提示词

**方案 A：直接生成剖面图（首选）**

```text
A 3D rendered product illustration of a 60L hiking backpack, three-quarter front-right view, slightly from above.
The front panel of the main compartment has a large rounded-rectangle cutaway window revealing a completely EMPTY dark interior lining.
The top lid also has a cutaway window showing an empty interior. Mesh side pocket on the right side, empty.
A short section of padded hip belt with an empty mesh pocket visible on the lower left. Two empty gear straps under the bottom.
Olive green ripstop nylon body, burnt orange top lid, dark grey compression straps and buckles, visible stitching and zipper around the cutaway edges.
Soft studio lighting from the top left, subtle rim light, soft ambient occlusion, clean and premium, realistic fabric texture.
Plain light grey background, no ground shadow, no text, no logo, no brand, no people.
```

Midjourney 追加参数：`--ar 3:4 --style raw --v 7`。有满意的装备图标后加 `--sref <锚点图链接>` 统一风格。

中文版（即梦、通义万相等中文模型用）：

```text
60 升重装徒步背包的 3D 渲染产品插画，右前方 3/4 视角，略微俯视。
主仓正面开一个大的圆角矩形剖面窗口，透过窗口能看到完全空着的深色内衬；顶包也开一个窗口，内部是空的。
右侧有一个空的网兜侧袋，左下方露出一截带空网兜小包的腰带，包底有两根空的外挂织带。
包身橄榄绿格子尼龙面料，顶包为赭橙色，深灰色压缩带和卡扣，剖面窗口边缘有明显的车线和拉链。
左上方柔和棚拍光，细轮廓光，柔和环境光遮蔽，干净、高级、真实面料质感。
纯浅灰色背景，没有地面阴影，没有文字，没有 Logo，没有品牌，没有人物。
```

反向提示词（工具支持时填写）：`items inside, clutter, text, logo, brand name, watermark, people, hands, ground shadow, cartoon, flat vector, low poly, multiple backpacks`

**方案 B：剖面图生成失败时的退路**

AI 经常画不好「空的剖面窗」，可能会往里塞东西，或者窗口形状不规则。这时改为生成一张**正面完整、没有开窗**的背包（把方案 A 里关于 cutaway 的两句删掉），透视窗由代码画：在主仓正面盖一层圆角的深色半透明毛玻璃（项目已有 `expo-blur`），装备显示在毛玻璃里，效果类似「X 光透视」。这种做法只需要一张图，风格最好控制，但真实感比方案 A 弱一档。

### 2.4 修图步骤

在 Photoshop、Figma 或免费的 Photopea 里完成：

1. 抠掉背景，导出 `bag-base.png`。窗口内衬里如果有 AI 画进去的杂物，用仿制图章或内容识别填充清掉。
2. 复制一层，用钢笔工具沿窗口内边缘选区，删除主仓窗口和顶包窗口内部，导出 `bag-front.png`。
3. 再复制一层，只保留侧袋网兜，不透明度调到约 70%，导出 `pocket-side.png`；腰带包同理导出 `pocket-belt.png`。
4. 四张图**画布尺寸和位置必须完全一致**，不要裁切。

## 3. 装备图标

### 3.1 规格

- 画布 1024 × 1024，PNG 透明底，sRGB。装备居中，主体占画布 75% 到 85%，四周留出透明边。
- **画成装进包里时的形态**：睡袋和帐篷装在收纳袋里，衣物叠好或卷好，食物装在防水卷口袋里。
- **朝向按下表**：比如睡袋横放、帐篷竖放，代码会把图标放进背包里对应区域，朝向错了就塞不进去。
- 文件名用下表的 `id`，例如 `sleeping-bag.png`。

### 3.2 统一提示词前缀

每个装备的完整提示词 =「前缀」+「主体描述」（3.3 表格最后一列）。

```text
A single 3D rendered product icon of {主体描述}, three-quarter front-right view, slightly from above.
Realistic soft materials, soft studio lighting from the top left, subtle rim light, soft ambient occlusion, clean and premium.
Muted outdoor colors. Centered, isolated on a plain light grey background, no ground shadow, no text, no logo, no brand.
```

Midjourney 参数：`--ar 1:1 --style raw --v 7 --sref <锚点图链接>`。即梦等工具用「参考图」功能上传锚点图，参考强度设在中等。

### 3.3 清单

「区域」是默认放置位置，实际由代码按分类和名称匹配。优先级 P0 是第一版必须有的，P1 可以后补，暂缺时用通用收纳袋代替。

| id | 名称 | 区域 | 朝向和比例 | 优先级 | 主体描述（填入前缀） |
| --- | --- | --- | --- | --- | --- |
| `sleeping-bag` | 睡袋 | 底部 | 横放圆柱，约 2.2:1 | P0 | a down sleeping bag compressed in a purple nylon stuff sack with compression straps, lying horizontally |
| `spare-clothes` | 备用衣物 | 底部 | 横放卷筒，约 2:1 | P1 | a rolled bundle of spare clothes tied with a strap, lying horizontally |
| `pillow` | 充气枕 | 底部 | 小袋，约 1.3:1 | P1 | a small packed inflatable pillow in a tiny stuff sack |
| `tent` | 帐篷 | 核心区 | 竖放圆柱，约 1:2.5 | P0 | a backpacking tent packed in an orange stuff sack with two compression straps, standing upright |
| `groundsheet` | 地布 | 核心区 | 竖放扁卷，约 1:2 | P1 | a folded thin groundsheet rolled tightly, standing upright |
| `food-bag` | 食物袋 | 核心区 | 竖放方袋，约 1:1.3 | P0 | a tan roll-top dry bag full of food, standing upright, slightly bulging |
| `cookset` | 锅具 | 核心区 | 圆柱，约 1:1 | P0 | a titanium camping cook pot with folding handle and lid, teal silicone grip |
| `stove` | 炉头 | 核心区 | 小盒，约 1:1 | P1 | a compact camping stove folded inside a small hard case |
| `gas-canister` | 气罐 | 核心区 | 扁圆柱，约 1:0.9 | P0 | a squat blue camping gas canister with silver valve on top, blank label |
| `hydration-bladder` | 水袋 | 核心区 贴背 | 竖放扁袋，约 1:1.8 | P1 | a filled hydration bladder with drinking tube coiled on top, standing upright |
| `fleece` | 抓绒中层 | 上部 | 横放叠衣，约 3:1 | P0 | a neatly folded green fleece jacket, lying flat, seen from slightly above |
| `rain-jacket` | 冲锋衣 雨衣 | 上部 | 横放叠衣，约 3:1 | P0 | a neatly folded dark green waterproof shell jacket with a visible zipper, lying flat |
| `down-jacket` | 羽绒服 | 上部 | 横放收纳袋，约 2:1 | P0 | a puffy down jacket packed into its own small stuff sack, lying horizontally |
| `rain-pants` | 雨裤 | 上部 | 横放叠衣，约 3:1 | P1 | neatly folded grey waterproof rain pants, lying flat |
| `dry-bag` | 防水收纳袋 | 上部 | 横放，约 1.6:1 | P1 | a small yellow roll-top dry bag, lying horizontally |
| `headlamp` | 头灯 | 顶包 | 横放，约 2:1 | P0 | a headlamp with elastic headband coiled neatly, lamp facing forward |
| `first-aid` | 急救包 | 顶包 | 方盒，约 1.5:1 | P0 | a red soft first aid pouch with a white cross, zipped |
| `power-bank` | 充电宝 | 顶包 | 扁块，约 1.6:1 | P0 | a slim dark grey power bank with a coiled short cable |
| `snacks` | 路餐 能量食品 | 顶包 | 一小堆，约 1.5:1 | P0 | a small pile of energy bars and trail mix in a zip bag |
| `sunscreen` | 防晒用品 | 顶包 | 竖放小瓶，约 1:1.6 | P0 | a small sunscreen tube and a lip balm standing together |
| `sunglasses` | 墨镜 | 顶包 | 横放，约 2:1 | P1 | folded sport sunglasses with dark lenses |
| `tissues` | 纸巾 湿巾 | 顶包 | 扁包，约 1.6:1 | P1 | a pack of tissues and a pack of wet wipes stacked |
| `beanie-gloves` | 保暖帽 手套 | 顶包 | 一组，约 1.5:1 | P1 | a knit beanie with a pair of fleece gloves folded on top |
| `medicine` | 个人药品 | 顶包 | 小盒，约 1.4:1 | P1 | a small clear pill organizer box with colorful pills |
| `emergency-blanket` | 救生毯 | 顶包 | 扁包，约 1.4:1 | P1 | a folded gold and silver emergency blanket in a small packet |
| `trash-bag` | 垃圾袋 | 顶包 | 小卷，约 1.4:1 | P1 | a small roll of dark trash bags |
| `water-bottle` | 水壶 | 侧袋 | 竖放瓶，约 1:3.5 | P0 | a 1 liter blue hiking water bottle with black screw cap, standing upright |
| `thermos` | 保温水壶 | 侧袋 | 竖放瓶，约 1:3.5 | P1 | a stainless steel insulated thermos bottle, standing upright |
| `phone` | 手机 | 腰带包 | 竖放，约 1:1.8 | P0 | a smartphone with dark screen in a rugged case, standing upright |
| `sleeping-pad` | 防潮垫 | 外挂 底部 | 横放长卷，约 5:1 | P0 | a rolled closed-cell foam sleeping pad, mustard yellow with egg-crate texture, lying horizontally |
| `trekking-poles` | 登山杖 | 外挂 侧面 | 竖放，约 1:6 | P0 | a pair of collapsed trekking poles bundled together, standing upright |
| `rain-cover` | 背包罩 | 顶包 | 小袋，约 1.4:1 | P1 | a backpack rain cover stuffed into its small orange pouch |
| `generic-sack-s` | 通用小件 | 不限 | 小袋，约 1.3:1 | P0 | a small plain grey-green nylon stuff sack with drawstring |
| `generic-sack-m` | 通用中件 | 不限 | 圆柱，约 1.8:1 | P0 | a medium plain grey-green nylon stuff sack with drawstring, lying horizontally |
| `generic-sack-l` | 通用大件 | 不限 | 圆柱，约 2.2:1 | P0 | a large plain grey-green nylon compression stuff sack, lying horizontally |

P0 共 20 张，P1 共 15 张。

## 4. 出图流程

1. **先找素材包**（半天）：在 IconScout、Envato Elements、Freepik、Figma Community 搜 `3D camping icon`、`3D hiking gear icon`、`outdoor equipment 3D`。挑覆盖 P0 最多、视角和光线最接近第 1 节要求的那一套。买之前确认授权**允许在商业 App 里使用**、不要求在 App 里署名。
2. **定风格锚点**：素材包里挑一张最好的图作为锚点。没有合适的素材包，就先用 AI 生成 `sleeping-bag`，反复调到满意，用它当锚点。
3. **生成背包**：按 2.3 生成，每次出 4 张，挑窗口最干净、视角最接近锚点的一张，再按 2.4 修图。
4. **补齐装备**：素材包里没有的，按 3.2 和 3.3 用锚点作风格参考生成。素材包里有、但视角或配色明显不一致的，也重新生成。
5. **抠图**：AI 图用 remove.bg、Photoshop 的「移除背景」，或者 App 里已有的装备抠图能力（`src/lib/gearBackgroundRemoval.ts` 对应的 Edge Function）批量处理。检查边缘不能有灰白毛边。
6. **交付**：把原图（PNG 透明底）放进 `design/packing/` 下的 `bag/` 和 `items/` 目录交给我。压缩成 WebP、确定每个区域的坐标，都由我在代码侧处理。

AI 工具的商用条款也要确认：Midjourney 需要付费订阅才能商用；即梦、通义万相等以各自的用户协议为准。

## 5. 验收清单

- [ ] 所有图同一视角、同一光向，放在一起不像来自两套素材
- [ ] 没有文字、Logo、水印
- [ ] 透明底干净，在深色（#1D2822）和浅色背景上都没有毛边或白边
- [ ] 背包四张图尺寸一致、叠起来完全对齐
- [ ] 背包窗口内部是空的
- [ ] 每个装备的朝向和比例符合 3.3 表格
- [ ] 深色装备（手机、充电宝、炉头）有轮廓光，在深色舞台上看得清
- [ ] 授权：素材包和 AI 工具都允许商用

## 6. 代码侧如何使用（供参考）

- 背包按 2.1 的顺序分层叠放，用 `expo-image` 显示；整体随手指轻微倾斜，装入时有落下和回弹动画（`react-native-reanimated`）。
- 每个区域在 `bag-base.png` 上量出一个矩形范围。区域里的装备按装包顺序由下往上、由里往外自动排布，并按区域大小缩放；同一区域装备太多时，后装的叠在前面并略微缩小。
- 装备匹配：先按用户装备的名称关键词匹配 3.3 的 `id`，再按装备分类匹配，都匹配不上就按重量用通用收纳袋的小、中、大三种。
- 用户拍过照的装备：底部悬浮条显示用户自己的抠图照片；放进包里时仍用统一风格的图标，保证包里画面整齐。
- 素材全部随 JS 包发布，可以走热更新，不需要重新打原生包。

# Kaipa Design System

Kaipa 的全局 UI 以新版装备概览、装备详情、装备列表、清单详情和清单列表为视觉基准。后续新增页面应优先组合设计系统中的 token、组件和页面模式，而不是在业务页面内重新定义一套样式。

## 设计原则

1. **克制且有空间感**：使用较大的区块留白、清晰的标题层级和低噪音表面。
2. **内容优先**：黑白与中性色承担结构，强调色只用于当前状态和主要操作。
3. **圆润但不松散**：控件、普通卡片、重点卡片分别使用固定圆角层级。
4. **数据可扫读**：重量、距离、金额、数量等指标优先使用等宽字体。
5. **明暗模式同等设计**：禁止只为浅色模式选择固定颜色。
6. **页面来自模板**：列表、详情、表单等页面应共享导航、滚动和区块节奏。

## 使用入口

```ts
import {
  AppCard,
  AppHeaderSearch,
  AppIconButton,
  AppMetricStrip,
  AppProgressBar,
  AppPropertyRow,
  AppSectionHeader,
  DetailPage,
  layout,
  radius,
  space,
  type,
} from '../design-system';
```

业务代码只从 `src/design-system/index.ts` 使用公开 API，不直接依赖设计系统内部文件。

## Token

- `space`：页面和组件间距。
- `radius`：控件、卡片、重点卡片和胶囊圆角。
- `layout`：页面边距、顶部栏、按钮、输入框和列表行尺寸。
- `type`：页面标题、导航标题、区块标题、正文、说明文字和指标数字。
- `motion`：快速、标准、强调动画，以及详情页进入动画。

颜色使用 `Theme` 中的语义字段：

- `bg`：基础页面背景。
- `groupedBg`：分组页面背景。
- `featureSurface`：装备概览风格的高对比重点卡片。
- `controlSurface`：浮动圆形按钮等独立控件表面。
- `surfaceTop`：普通浮层卡片。
- `fieldSurface` / `fieldBorder`：输入、筛选和柔和数据块。
- `progressTrack`：进度条轨道。
- `text` / `text2` / `text3`：三级文字。
- `accent` / `danger`：强调和危险操作。

不要在新业务页面中重复写这些明暗模式三元表达式。

## 组件层级

### 全局组件

全局组件不得依赖 `GearItem`、`Journey` 等业务数据模型：

- `AppCard`
- `AppIconButton`
- `AppSectionHeader`
- `AppPropertyRow`
- `AppMetricStrip`
- `AppProgressBar`
- `AppHeaderSearch`
- `DetailPage`

### 业务组件

依赖业务模型的组件留在对应功能目录。例如 `GearItemRow`、装备图片和重量格式化继续保留在 `src/components/gear/`。业务组件应使用全局 token 和基础组件完成视觉表达。

## 标准页面结构

### 详情页

```tsx
<DetailPage
  theme={theme}
  title={title}
  onBack={onBack}
  right={<AppIconButton theme={theme} name="more" onPress={openMenu} />}
>
  <View style={{ paddingHorizontal: space.md }}>
    <AppSectionHeader theme={theme} text="概览" />
    <AppCard theme={theme}>{content}</AppCard>
  </View>
</DetailPage>
```

### 列表页

列表页沿用 `DetailPage` 的导航外壳，并使用 `AppHeaderSearch` 承载搜索与顶部操作。业务层负责筛选、排序、列表布局和数据状态。

## 新页面检查清单

- 是否使用语义颜色而不是固定明暗颜色？
- 是否优先使用 `space`、`radius`、`type` 和 `layout`？
- 顶部返回、更多和搜索是否复用现有组件？
- 普通卡片和重点卡片是否使用了正确的表面层级？
- 数字指标是否使用统一的等宽字体角色？
- 空、加载、失败和危险操作是否有明确状态？
- 是否在浅色和深色模式下都验证过？
- 新组件是否真的跨业务通用？否则应留在业务目录。

## 迁移策略

旧页面不要求一次性重写。修改现有页面时，按以下顺序渐进迁移：

1. 固定颜色替换为语义主题色。
2. 固定间距、圆角和字号替换为 token。
3. 重复的视觉结构替换为全局组件。
4. 业务数据展示保留在业务组件中。

装备页面中的旧名称目前通过兼容别名继续工作；新页面应直接使用全局名称。

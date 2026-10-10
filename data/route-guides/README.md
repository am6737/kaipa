# 路线指南

每条路线只维护一份 `data/route-guides/<routeId>.md`（如 `trk014.md`），路线 ID 使用目录中的 catalog id。这里是经过人工整理、核验的可信资料；AI 会直接读取正文并引用原帖链接，请勿放入未经确认的采集内容。

文件以 YAML frontmatter 开头，随后写 Markdown 正文。支持普通字符串、引号字符串、`null` 和下列缩进形式；不支持复杂 YAML。

```markdown
---
routeId: trk014
title: 格聂牧场线
variant: 4天3晚 · 下则通村→则巴村
asOf: 2026-10-09
sources:
  - id: s1
    platform: xiaohongshu
    title: 格聂牧场线 4天3晚
    url: null
    author: null
    observedOn: 2025-11
    retrievedAt: 2026-10-09
---
## 概览 [s1]
此处填写经过核验的正文。
```

`asOf` 是内容最后整理／核验日期，`retrievedAt` 是资料获取日期，均为 `YYYY-MM-DD`。`observedOn` 是作者实际在路线上的时间，使用 `YYYY-MM`、`YYYY-MM-DD` 或 `null`；未知链接、作者使用 `null`。`variant` 可省略（生成值为 `null`）。`platform` 只允许 `xiaohongshu`、`douyin`、`web`、`official`、`firsthand`、`social`。没有来源时可写 `sources: []`。

正文二级标题只允许以下列表；可自由排列，生成后按此顺序输出章节。章节可省略，省略表示资料缺口；已写的章节不能留空。

| key | 二级标题 |
| --- | --- |
| overview | 概览 |
| itinerary | 行程 |
| access | 交通 |
| overnight | 住宿与营地 |
| costs | 费用 |
| water_supply | 补给与水源 |
| season_risk | 季节与风险 |
| gear | 装备建议 |
| tips | 注意事项 |

必需章节为概览、行程、交通、住宿与营地、季节与风险；加载器会报告这些章节的缺口。每个事实性章节都应在标题后标注来源，例如 `## 交通 [s1,s2]`，ID 必须在 `sources` 中定义。价格、交通和封闭信息必须在正文中注明截至日期，不能让读者把旧记录当作现状。

构建：`node scripts/build-route-guides.mjs`。提交时一并更新生成的 `supabase/functions/_shared/route-guides.generated.ts`，不要手改生成文件；CI 可用 `node scripts/build-route-guides.mjs --check` 检查是否过期。

`_inbox/` 用于存放不可信的采集原料，不入 git、不参与构建，也绝不会在运行时读取。以 `_` 开头的文件同样忽略；本 README 和子目录不参与构建。
